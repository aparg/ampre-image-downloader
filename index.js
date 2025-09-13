const express = require("express");
const cors = require("cors");
const sharp = require("sharp");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
require("dotenv").config();

// Simple in-memory cache for processed images
const imageCache = new Map();
const CACHE_MAX_SIZE = 50; // Limit cache size
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Cache cleanup function
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of imageCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }
  // If still too large, remove oldest entries
  if (imageCache.size > CACHE_MAX_SIZE) {
    const entries = Array.from(imageCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    const toDelete = entries.slice(0, imageCache.size - CACHE_MAX_SIZE);
    toDelete.forEach(([key]) => imageCache.delete(key));
  }
}

// Run cache cleanup every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000);

// Optimized image quality middleware
const imageQualityMiddleware = async (req, res, next) => {
  const isCardImage = req.query.cardImage === "true";
  const maxSizeKB = parseInt(req.query.maxSize) || 100;

  if (!isCardImage) {
    return next();
  }

  const imagePath = path.join(__dirname, "./Data/Images", req.path);

  // Create cache key
  const cacheKey = `${req.path}-${maxSizeKB}`;

  // Check cache first
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    console.log(`Cache hit for ${req.path}`);

    res.set({
      "Cache-Control": "public, max-age=3600",
      Expires: new Date(Date.now() + 3600 * 1000).toUTCString(),
      "Content-Type": "image/jpeg",
    });

    return res.send(cached.buffer);
  }

  // Check if file exists (async)
  try {
    await fs.access(imagePath);
  } catch (error) {
    return res.status(404).send("Image not found");
  }

  // Check if it's an image file
  const ext = path.extname(imagePath).toLowerCase();
  const supportedFormats = [".jpg", ".jpeg", ".png", ".webp"];

  if (!supportedFormats.includes(ext)) {
    return next();
  }

  let transformer = null;

  try {
    const startTime = Date.now();
    transformer = sharp(imagePath);
    const maxSizeBytes = maxSizeKB * 1024;

    // Get metadata once
    const metadata = await transformer.metadata();
    console.log(
      `Processing ${req.path} - Original: ${metadata.width}x${metadata.height}, Target: ${maxSizeKB}KB`
    );

    let buffer;
    let finalWidth = metadata.width;
    let finalHeight = metadata.height;

    // Smart initial size estimation
    const estimatedFileSize = (metadata.width * metadata.height * 3) / 8; // Rough estimate for JPEG
    if (estimatedFileSize > maxSizeBytes * 3) {
      // If image is much larger than target, resize first
      const scaleFactor = Math.sqrt((maxSizeBytes * 2) / estimatedFileSize);
      finalWidth = Math.floor(metadata.width * scaleFactor);
      finalHeight = Math.floor(metadata.height * scaleFactor);
      console.log(
        `Pre-scaling to ${finalWidth}x${finalHeight} (scale: ${scaleFactor.toFixed(
          2
        )})`
      );
    }

    // Efficient quality selection based on target size
    let quality;
    if (maxSizeKB <= 50) {
      quality = 35;
    } else if (maxSizeKB <= 100) {
      quality = 50;
    } else {
      quality = 65;
    }

    // Single attempt with smart defaults
    buffer = await sharp(imagePath)
      .resize(finalWidth, finalHeight, {
        kernel: sharp.kernel.lanczos2, // Faster kernel
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        progressive: false, // Faster processing
        optimiseScans: true,
        trellisQuantisation: true,
      })
      .toBuffer();

    // If still too large, do one adjustment
    if (buffer.length > maxSizeBytes) {
      const sizeRatio = buffer.length / maxSizeBytes;

      if (sizeRatio > 2) {
        // Much too large - reduce dimensions significantly
        const newScaleFactor = 1 / Math.sqrt(sizeRatio * 1.2);
        finalWidth = Math.floor(finalWidth * newScaleFactor);
        finalHeight = Math.floor(finalHeight * newScaleFactor);
        quality = Math.max(25, quality - 15);
      } else {
        // Slightly too large - just reduce quality
        quality = Math.max(20, Math.floor(quality / sizeRatio));
      }

      buffer = await sharp(imagePath)
        .resize(finalWidth, finalHeight, {
          kernel: sharp.kernel.lanczos2,
          withoutEnlargement: true,
        })
        .jpeg({
          quality,
          progressive: false,
          optimiseScans: true,
        })
        .toBuffer();

      console.log(
        `Adjusted: Quality ${quality}, Size: ${finalWidth}x${finalHeight}`
      );
    }

    const processingTime = Date.now() - startTime;
    const finalSizeKB = (buffer.length / 1024).toFixed(2);
    console.log(
      `Processed ${req.path} in ${processingTime}ms - Final: ${finalSizeKB}KB`
    );

    // Cache the result
    imageCache.set(cacheKey, {
      buffer,
      timestamp: Date.now(),
    });

    res.set({
      "Cache-Control": "public, max-age=3600",
      Expires: new Date(Date.now() + 3600 * 1000).toUTCString(),
      "Content-Type": "image/jpeg",
    });

    res.send(buffer);
  } catch (err) {
    console.error("Error processing image:", err);
    next();
  } finally {
    if (transformer) {
      transformer.destroy();
    }
  }
};

// Updated route with quality middleware
app.use(
  "/images",
  cors(),
  imageQualityMiddleware,
  express.static(path.join(__dirname, "./Data/Images"))
);

app.get("/api/listings/:listingKey/photo-count", async (req, res) => {
  const { listingKey } = req.params;
  const imagesDir = path.join(__dirname, "Data/Images");
  let count = 0;

  try {
    // Use async file operations
    const files = await fs.readdir(imagesDir);
    count = files.filter((file) => file.startsWith(`${listingKey}-`)).length;
  } catch (error) {
    console.error("Error reading directory:", error);
  }

  res.json({ listingKey, photoCount: count });
});

// Cache status endpoint for debugging
app.get("/api/cache-status", (req, res) => {
  res.json({
    cacheSize: imageCache.size,
    maxSize: CACHE_MAX_SIZE,
    entries: Array.from(imageCache.keys()),
  });
});

app.get("/", (req, res) => {
  console.log("Received request");
  res.json({
    msg: "Welcome to image management app",
    endpoints: {
      images: "/images/:filename?cardImage=true&maxSize=100",
      photoCount: "/api/listings/:listingKey/photo-count",
      cacheStatus: "/api/cache-status",
    },
  });
});

app.listen(PORT, () => {
  console.log(
    `${new Date(Date.now()).toLocaleString()}: Server running on port: ${PORT}`
  );
});
