const fs = require("fs");
const path = require("path");
require("dotenv").config();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url, options, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, i) * 1000;
      console.log(`Retry ${i + 1}/${maxRetries} after ${waitTime}ms...`);
      await delay(waitTime);
    }
  }
};

const getAllImages = async () => {
  // Get all listing keys
  await getAllPropertiesKeys();
  console.log("✅ All properties keys fetched.");

  const listingKeys = JSON.parse(
    fs.readFileSync("Data/allActiveProperties.txt", "utf-8")
  );

  const imagesDir = path.join(__dirname, "../Data/Images");
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  for (const key of listingKeys) {
    try {
      // Fetch image metadata for the listing
      const url = `https://query.ampre.ca/odata/Media?$select=MediaURL,PreferredPhotoYN&$filter=ResourceRecordKey eq '${key}' and ImageSizeDescription eq 'Large' and MediaStatus eq 'Active'`;
      const response = await fetchWithRetry(url, {
        headers: {
          Authorization: process.env.BEARER_TOKEN_FOR_API,
        },
      });
      const data = await response.json();

      if (!Array.isArray(data.value) || data.value.length === 0) {
        console.log(`⚠️ No images found for ${key}`);
        continue;
      }

      // Sort preferred photos first
      data.value.sort(
        (a, b) => (b.PreferredPhotoYN === true) - (a.PreferredPhotoYN === true)
      );

      // Check how many images already exist for this key
      const existingImages = fs
        .readdirSync(imagesDir)
        .filter((file) => file.startsWith(key + "-") && file.endsWith(".jpg"));

      // Skip if we already have all images
      if (existingImages.length >= data.value.length) {
        console.log(
          `🟢 All ${existingImages.length} images already exist for ${key}`
        );
        continue;
      }

      console.log(
        `⬇️ Downloading ${
          data.value.length - existingImages.length
        } missing images for ${key}`
      );

      // Download only missing images
      for (let i = 0; i < data.value.length; i++) {
        const mediaURL = data.value[i].MediaURL;
        const filePath = path.join(imagesDir, `${key}-${i}.jpg`);

        if (fs.existsSync(filePath)) continue; // skip existing

        try {
          const imgRes = await fetchWithRetry(mediaURL);
          const arrayBuffer = await imgRes.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
          console.log(`✅ Downloaded ${key}-${i}`);
        } catch (err) {
          console.error(`❌ Failed ${key}-${i}: ${err.message}`);
        }

        await delay(100); // avoid flooding
      }

      console.log(`🏁 Completed ${key}`);
      await delay(200); // short delay between listings
    } catch (error) {
      console.error(`🚨 Error with ${key}: ${error.message}`);
      continue;
    }
  }

  console.log("🎉 All available images downloaded successfully!");
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
    "Clarington",
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

  // Sale of Business
  console.log("Fetching Sale of Business properties...");
  const saleOfBusinessKeys = await fetchPropertiesByType(
    "PropertySubType eq 'Sale Of Business'",
    cities
  );
  allKeys.push(...saleOfBusinessKeys);
  console.log(
    `Found ${saleOfBusinessKeys.length} Sale of Business properties.`
  );

  // Commercial Lease
  console.log("Fetching Commercial Lease properties...");
  const commercialLeaseKeys = await fetchPropertiesByType(
    "PropertyType eq 'Commercial' and TransactionType eq 'For Lease'",
    cities
  );
  allKeys.push(...commercialLeaseKeys);
  console.log(
    `Found ${commercialLeaseKeys.length} Commercial Lease properties.`
  );

  allKeys = [...new Set(allKeys)]; // remove duplicates
  console.log(`Total unique properties: ${allKeys.length}`);

  fs.writeFileSync("Data/allActiveProperties.txt", JSON.stringify(allKeys));
};

const fetchPropertiesByType = async (typeFilter, cities) => {
  let allKeys = [];
  const citiesSlice = [cities.slice(0, 15), cities.slice(15)];

  for (let i = 0; i < citiesSlice.length; i++) {
    const cityFilter = citiesSlice[i]
      .map((city) => `contains(City,'${city}')`)
      .join(" or ");

    let keepGoing = true;
    let lastTimestamp = "2020-01-01T00:00:00Z";
    let lastListingKey = 0;

    while (keepGoing) {
      let filter = `(${cityFilter}) and ${typeFilter} and (ModificationTimestamp gt ${lastTimestamp} or (ModificationTimestamp eq ${lastTimestamp} and ListingKey gt '${lastListingKey}')) and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;

      const url = `https://query.ampre.ca/odata/Property?$filter=${filter}&$select=ListingKey,ModificationTimestamp&$top=500&$orderby=ModificationTimestamp,ListingKey`;

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: process.env.BEARER_TOKEN_FOR_API,
          },
        });
        const data = await response.json();

        if (data.value && data.value.length > 0) {
          allKeys.push(...data.value.map((item) => item.ListingKey));
          if (data.value.length < 500) keepGoing = false;
          else {
            const lastItem = data.value[data.value.length - 1];
            lastListingKey = lastItem.ListingKey;
            lastTimestamp = lastItem.ModificationTimestamp;
          }
        } else {
          keepGoing = false;
        }
      } catch (err) {
        console.error("Error fetching properties:", err.message);
        keepGoing = false;
      }
    }
  }

  return allKeys;
};

const [, , startDate, endDate] = process.argv;
getAllImages().catch(console.error);
