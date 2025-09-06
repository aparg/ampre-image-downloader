const express = require("express");
const cors = require("cors");
// const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
require("dotenv").config();

// Middleware to handle image quality reduction
const imageQualityMiddleware = (req, res, next) => {
  // return next();
  const isCardImage = req.query.cardImage === "true";

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
    "Content-Type": `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}`,
  });

  const transformer = sharp(imagePath);

  transformer
    .jpeg({ quality: 20 })
    .toBuffer()
    .then((buffer) => {
      res.send(buffer);
    })
    .catch((err) => {
      console.error("Error processing image:", err);
      transformer.destroy(); // Clean up Sharp instance
      next();
    })
    .finally(() => {
      // Ensure cleanup happens
      if (transformer) {
        transformer.destroy();
      }
    });
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

app.get("/", (req, res) => {
  console.log("Received request");
  res.json({ msg: "Welcome to image management app" });
});

app.listen(PORT, () => {
  console.log(
    `${new Date(Date.now()).toLocaleString()}: Server running on port: ${PORT}`
  );
});
