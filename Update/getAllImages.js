const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Helper function to add delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to retry fetch with exponential backoff
const fetchWithRetry = async (url, options, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
      console.log(`Retry ${i + 1}/${maxRetries} after ${waitTime}ms...`);
      await delay(waitTime);
    }
  }
};

const getAllImages = async () => {
  // Read listing keys from test.txt
  await getAllPropertiesKeys();
  console.log("All properties keys fetched");
  const listingKeys = JSON.parse(
    fs.readFileSync("Data/allActiveProperties.txt", "utf-8")
  );
  const imagesDir = path.join(__dirname, "../Data/Images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  for (const key of listingKeys) {
    // Check if any images already exist for this key
    const existingImages = fs
      .readdirSync(imagesDir)
      .filter((file) => file.startsWith(key + "-"));

    if (existingImages.length > 0) {
      continue;
    }

    console.log("Downloading images for " + key);

    try {
      const url = `https://query.ampre.ca/odata/Media?$select=MediaURL,PreferredPhotoYN&$filter=ResourceRecordKey eq '${key}' and ImageSizeDescription eq 'Large' and MediaStatus eq 'Active'`;
      const response = await fetchWithRetry(url, {
        headers: {
          Authorization: process.env.BEARER_TOKEN_FOR_API,
        },
      });
      const data = await response.json();

      if (Array.isArray(data.value) && data.value.length > 0) {
        // Sort so PreferredPhotoYN === true come first
        data.value.sort(
          (a, b) =>
            (b.PreferredPhotoYN === true) - (a.PreferredPhotoYN === true)
        );

        for (let i = 0; i < data.value.length; i++) {
          const mediaURL = data.value[i].MediaURL;
          if (mediaURL) {
            const imgRes = await fetchWithRetry(mediaURL);
            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(path.join(imagesDir, `${key}-${i}.jpg`), buffer);
            console.log(`Downloaded image for ${key}-${i}`);
          }
        }
        console.log(`✓ Completed ${key} (${data.value.length} images)`);
      } else {
        console.log(`No images found for ${key}`);
      }

      // Small delay to avoid overwhelming the server
      await delay(100);
    } catch (error) {
      console.error(`Error downloading images for ${key}:`, error.message);
      console.log(`Skipping ${key} and continuing...`);
    }
  }
  console.log("All images downloaded successfully!");
};

const getAllPropertiesKeys = async () => {
  const cities = [
    "Toronto",
    "Mississauga",
    "Brampton",
    "Vaughan",
    "Markham",
    "Richmond Hill",
    "Pickering",
    "Ajax",
    "Whitby",
    "Oshawa",
    "Newmarket",
    "Aurora",
    "King City",
    "Caledon",
    "Milton",
    "Oakville",
    "Burlington",
    "Hamilton",
    "Guelph",
    "Kitchener",
    "Waterloo",
    "Cambridge",
    "Brantford",
    "Barrie",
    "St. Catharines",
    "Niagara Falls",
    "Grimsby",
    "Peterborough",
    "Kingston",
    "Belleville",
    "London",
    "Woodstock",
    "Stratford",
    "Windsor",
  ];

  let allKeys = [];

  // Fetch Sale of Business properties (for Restaurants and Convenience Stores)
  console.log("Fetching Sale of Business properties...");
  const saleOfBusinessKeys = await fetchPropertiesByType(
    "PropertySubType eq 'Sale Of Business'",
    cities
  );
  allKeys.push(...saleOfBusinessKeys);
  console.log(`Found ${saleOfBusinessKeys.length} Sale of Business properties`);

  // Fetch Commercial Lease properties (for Office/Professional spaces)
  console.log("Fetching Commercial Lease properties...");
  const commercialLeaseKeys = await fetchPropertiesByType(
    "PropertyType eq 'Commercial' and TransactionType eq 'For Lease'",
    cities
  );
  allKeys.push(...commercialLeaseKeys);
  console.log(
    `Found ${commercialLeaseKeys.length} Commercial Lease properties`
  );

  // Remove duplicates
  allKeys = [...new Set(allKeys)];
  console.log(`Total unique properties: ${allKeys.length}`);

  fs.writeFileSync("Data/allActiveProperties.txt", JSON.stringify(allKeys));
};

const fetchPropertiesByType = async (typeFilter, cities) => {
  let allKeys = [];
  const citiesSlice = [cities.slice(0, 15), cities.slice(15, cities.length)];

  for (let i = 0; i < citiesSlice.length; i++) {
    const cityFilter = citiesSlice[i]
      .map((city) => `contains(City,'${city}')`)
      .join(" or ");

    let keepGoing = true;
    let lastTimestamp = startDate || "2024-01-01T00:00:00Z";
    let lastListingKey = 0;

    while (keepGoing) {
      let filter = `(${cityFilter}) and ${typeFilter} and (ModificationTimestamp gt ${lastTimestamp} or (ModificationTimestamp eq ${lastTimestamp} and ListingKey gt '${lastListingKey}')) and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;

      const url = `https://query.ampre.ca/odata/Property?$filter=${filter}&$select=ListingKey,ModificationTimestamp&$top=500&$orderby=ModificationTimestamp,ListingKey`;

      const response = await fetch(url, {
        headers: {
          Authorization: process.env.BEARER_TOKEN_FOR_API,
        },
      });

      const data = await response.json();
      if (data.value && data.value.length > 0) {
        allKeys.push(...data.value.map((item) => item.ListingKey));
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
  }

  return allKeys;
};

const [, , startDate, endDate] = process.argv;
getAllImages().catch(console.error);
