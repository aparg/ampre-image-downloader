const express = require("express");
const cors = require("cors");

const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
require("dotenv").config();

//make images available
app.use(
  "/images",
  cors(),
  express.static(path.join(__dirname, "./Data/Images"), {
    maxAge: "2d", // 2 days in Express format
    etag: true,
    lastModified: true,
    index: false, // Don't serve directory listings
    setHeaders: (res, path, stat) => {
      // Set aggressive caching for 2 days
      res.set({
        "Cache-Control": "public, max-age=172800", // 2 days in seconds
        Expires: new Date(Date.now() + 172800000).toUTCString(), // 2 days from now
      });
    },
  })
);

app.get("/api/listings/:listingKey/photo-count", (req, res) => {
  const { listingKey } = req.params;
  const imagesDir = path.join(__dirname, "Data/Images");
  let count = 0;
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    count = files.filter((file) => file.startsWith(`${listingKey}-`)).length;
  }
  res.json({ listingKey, photoCount: count });
});

app.listen(PORT, () => {
  console.log(
    `${new Date(Date.now()).toLocaleString()}: Server running on port: ${PORT}`
  );
});
