const fs = require("fs");
const path = require("path");
require("dotenv").config();

const deleteOldImages = async () => {
  // Read all active listings
  const allActivePath = path.join(__dirname, "../Data/allActiveProperties.txt");
  let allActiveListings = JSON.parse(fs.readFileSync(allActivePath, "utf-8"));

  // Calculate date 3 months ago
  const now = new Date();
  // const threeMonthsAgo = new Date(
  //   now.setMonth(now.getMonth() - 3)
  // ).toISOString();
  // console.log(threeMonthsAgo);
  const threeMonthsAgo = "2025-08-01T08:00:00Z";
  // Fetch listing keys from last 3 months
  let lastTimestamp = threeMonthsAgo;
  let lastListingKey = 0;
  let keepGoing = true;
  let recentKeys = [];
  let limit = 0;
  const allActivePropertiesPath = path.join(
    __dirname,
    "../Data/allActiveProperties.txt"
  );
  while (keepGoing) {
    let filter = `ModificationTimestamp ge ${lastTimestamp} and ListingKey ge '${lastListingKey}' and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;
    console.log(filter);
    const url = `https://query.ampre.ca/odata/Property?$filter=${encodeURIComponent(
      filter
    )}&$select=ListingKey,ModificationTimestamp&$top=500&$orderby=MediaChangeTimestamp,ListingKey`;
    // console.log(url);
    const response = await fetch(url, {
      headers: {
        Authorization: process.env.BEARER_TOKEN_FOR_API,
      },
    });
    const data = await response.json();
    // console.log(data.value.length);
    // console.log(
    //   data.value[data.value.length - 1].ListingKey,
    //   data.value[data.value.length - 1].ModificationTimestamp
    // );

    //check if this is there is a last element here as we are only getting 500 listings in each request
    if (data.value && data.value.length > 0) {
      recentKeys.push(...data.value.map((item) => item.ListingKey));
      if (data.value.length < 500) {
        keepGoing = false;
      } else {
        const lastItem = data.value[data.value.length - 1];
        lastListingKey = lastItem.ListingKey;
        lastTimestamp = lastItem.ModificationTimestamp;
      }
    } else {
      keepGoing = false;
    }
  }

  // Remove images and update allActiveListings
  const imagesDir = path.join(__dirname, "../Data/Images");
  const files = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
  const recentSet = new Set(recentKeys);
  console.log(recentSet);
  const updatedActiveListings = allActiveListings.filter((key) =>
    recentSet.has(key)
  );
  for (const key of allActiveListings) {
    if (!recentSet.has(key)) {
      // Remove images for this listing
      const allProperties = fs.readFileSync(allActivePropertiesPath);
      const array = JSON.parse(allProperties);
      // array.pop(key);
      // fs.writeFileSync(allActivePropertiesPath, JSON.stringify(array));
      files.forEach((file) => {
        // console.log(file);
        if (file.startsWith(key + "-")) {
          if (path.join(imagesDir, file))
            fs.unlinkSync(path.join(imagesDir, file));
        }
      });
    }
  }
  console.log(updatedActiveListings);
  // Save updated active listings
  fs.writeFileSync(allActivePath, JSON.stringify(updatedActiveListings));
  console.log(
    "Cleanup complete. Updated active listings and removed old images."
  );
};

deleteOldImages();
