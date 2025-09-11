const express = require("express");
const cors = require("cors");
const sharp = require("sharp");
const fs = require("fs").promises; // Use promises version
const fsSync = require("fs"); // Keep sync version for specific cases if needed
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
require("dotenv").config();

// Middleware to handle image quality reduction
const imageQualityMiddleware = async (req, res, next) => {
  // return next();
  const isCardImage = req.query.cardImage === "true";

  if (!isCardImage) {
    return next(); // Continue to static middleware for normal quality
  }

  // Get the requested file path
  const imagePath = path.join(__dirname, "./Data/Images", req.path);

  try {
    // Non-blocking file existence check using fs.promises.access
    await fs.access(imagePath, fsSync.constants.F_OK);
  } catch (error) {
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
    "Content-Type": `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}`,
  });

  let transformer;

  try {
    // Create Sharp instance from file path (Sharp handles file reading asynchronously)
    transformer = sharp(imagePath);

    const buffer = await transformer.jpeg({ quality: 20 }).toBuffer();

    res.send(buffer);
  } catch (err) {
    console.error("Error processing image:", err);
    // If Sharp fails, try to serve the original file
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

  try {
    const files = await fs.readdir(imagesDir);
    count = files.filter((file) => file.startsWith(`${listingKey}-`)).length;
  } catch (error) {
    // Directory doesn't exist or other error - count remains 0
    if (error.code !== "ENOENT") {
      console.error("Error reading images directory:", error);
    }
  }

  res.json({ listingKey, photoCount: count });
});

app.get("/", (req, res) => {
  console.log("Received request");
  res.json({ msg: "Welcome to image management app" });
});

app.listen(PORT, () => {
  console.log(
    `${new Date(Date.now()).toLocaleString()}: Server running on port: ${PORT}`
  );
});
