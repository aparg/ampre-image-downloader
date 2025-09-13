const express = require("express");
const cors = require("cors");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
require("dotenv").config();

// Enhanced middleware to handle image quality reduction with size limit
const imageQualityMiddleware = async (req, res, next) => {
  const isCardImage = req.query.cardImage === "true";
  const maxSizeKB = parseInt(req.query.maxSize) || 100; // Allow custom size via query param

  if (!isCardImage) {
    return next(); // Continue to static middleware for normal quality
  }

  // Get the requested file path
  const imagePath = path.join(__dirname, "./Data/Images", req.path);

  // Check if file exists
  if (!fs.existsSync(imagePath)) {
    return res.status(404).send("Image not found");
  }

  // Check if it's an image file
  const ext = path.extname(imagePath).toLowerCase();
  const supportedFormats = [".jpg", ".jpeg", ".png", ".webp"];

  if (!supportedFormats.includes(ext)) {
    return next(); // Not an image, continue to static middleware
  }

  // Set cache headers for low quality images
  res.set({
    "Cache-Control": "public, max-age=3600",
    Expires: new Date(Date.now() + 3600 * 1000).toUTCString(),
    "Content-Type": `image/jpeg`, // Always output as JPEG for consistency
  });

  let transformer = null;

  try {
    transformer = sharp(imagePath);
    const maxSizeBytes = maxSizeKB * 1024;
    let quality = 80; // Start with higher quality
    let buffer;
    let attempts = 0;
    const maxAttempts = 8;

    // Get original image metadata
    const metadata = await transformer.metadata();
    let width = metadata.width;
    let height = metadata.height;

    console.log(
      `Processing ${req.path} - Original: ${width}x${height}, Target: ${maxSizeKB}KB`
    );

    do {
      // Create buffer with current settings
      buffer = await sharp(imagePath)
        .resize(width, height)
        .jpeg({
          quality,
          progressive: true,
          mozjpeg: true, // Better compression if available
        })
        .toBuffer();

      const currentSizeKB = (buffer.length / 1024).toFixed(2);
      console.log(
        `Attempt ${
          attempts + 1
        }: Quality ${quality}, Size: ${width}x${height}, File: ${currentSizeKB}KB`
      );

      if (buffer.length <= maxSizeBytes) {
        break; // Success!
      }

      attempts++;

      // Strategy: reduce quality first, then dimensions if needed
      if (quality > 30) {
        quality = Math.max(20, quality - 15); // Reduce quality
      } else {
        // If quality is already low, reduce dimensions
        const scaleFactor = 0.85;
        width = Math.floor(width * scaleFactor);
        height = Math.floor(height * scaleFactor);
        quality = Math.max(15, quality - 5); // Still reduce quality slightly
      }
    } while (buffer.length > maxSizeBytes && attempts < maxAttempts);

    // Final check - if still too large, do aggressive resize
    if (buffer.length > maxSizeBytes) {
      console.log(
        `Still too large after ${maxAttempts} attempts, doing aggressive resize...`
      );

      const targetScaleFactor = Math.sqrt((maxSizeBytes / buffer.length) * 0.9); // 90% of target for safety
      const finalWidth = Math.floor(metadata.width * targetScaleFactor);
      const finalHeight = Math.floor(metadata.height * targetScaleFactor);

      buffer = await sharp(imagePath)
        .resize(finalWidth, finalHeight)
        .jpeg({ quality: 15 })
        .toBuffer();

      console.log(
        `Final aggressive resize: ${finalWidth}x${finalHeight}, Size: ${(
          buffer.length / 1024
        ).toFixed(2)}KB`
      );
    }

    res.send(buffer);
  } catch (err) {
    console.error("Error processing image:", err);
    // Fallback: serve original file or return error
    next();
  } finally {
    // Clean up Sharp instance
    if (transformer) {
      transformer.destroy();
    }
  }
};

// Updated route with quality middleware
app.use(
  "/images",
  cors(),
  imageQualityMiddleware, // Add this before the static middleware
  express.static(path.join(__dirname, "./Data/Images"))
);

app.get("/api/listings/:listingKey/photo-count", async (req, res) => {
  const { listingKey } = req.params;
  const imagesDir = path.join(__dirname, "Data/Images");
  let count = 0;
  if (fs.existsSync(imagesDir)) {
    const files = await fs.promises.readdir(imagesDir);
    count = files.filter((file) => file.startsWith(`${listingKey}-`)).length;
  }
  res.json({ listingKey, photoCount: count });
});

// Health check endpoint
app.get("/", (req, res) => {
  console.log("Received request");
  res.json({
    msg: "Welcome to image management app",
    endpoints: {
      images: "/images/:filename?cardImage=true&maxSize=100",
      photoCount: "/api/listings/:listingKey/photo-count",
    },
  });
});

app.listen(PORT, () => {
  console.log(
    `${new Date(Date.now()).toLocaleString()}: Server running on port: ${PORT}`
  );
});
