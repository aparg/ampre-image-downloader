const fs = require("fs");
const path = require("path");
require("dotenv").config();

const deleteOldImages = async () => {
  // Read all active listings
  const allActivePath = path.join(__dirname, "../Data/allActiveProperties.txt");
  let allActiveListings = JSON.parse(fs.readFileSync(allActivePath, "utf-8"));

  // Calculate date 3 months ago
  const now = new Date();
  const threeMonthsAgo = new Date(
    now.setMonth(now.getMonth() - 3)
  ).toISOString();
  console.log("Deleting images for properties older than:", threeMonthsAgo);
  const allActivePropertiesPath = path.join(
    __dirname,
    "../Data/allActiveProperties.txt"
  );

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

  let recentKeys = [];

  // Fetch Sale of Business properties (for Restaurants and Convenience Stores)
  console.log("Fetching active Sale of Business properties...");
  const saleOfBusinessKeys = await fetchActivePropertiesByType(
    "PropertySubType eq 'Sale Of Business'",
    cities,
    threeMonthsAgo
  );
  recentKeys.push(...saleOfBusinessKeys);
  console.log(`Found ${saleOfBusinessKeys.length} Sale of Business properties`);

  // Fetch Commercial Lease properties (for Office/Professional spaces)
  console.log("Fetching active Commercial Lease properties...");
  const commercialLeaseKeys = await fetchActivePropertiesByType(
    "PropertyType eq 'Commercial' and TransactionType eq 'For Lease'",
    cities,
    threeMonthsAgo
  );
  recentKeys.push(...commercialLeaseKeys);
  console.log(
    `Found ${commercialLeaseKeys.length} Commercial Lease properties`
  );

  // Remove duplicates
  recentKeys = [...new Set(recentKeys)];
  console.log(`Total active properties: ${recentKeys.length}`);

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
          if (fs.existsSync(path.join(imagesDir, file)))
            fs.unlinkSync(path.join(imagesDir, file));
          console.log(`Deleted image for ${file}`);
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

const fetchActivePropertiesByType = async (
  typeFilter,
  cities,
  threeMonthsAgo
) => {
  let recentKeys = [];
  const citiesSlice = [cities.slice(0, 15), cities.slice(15, cities.length)];

  for (let i = 0; i < citiesSlice.length; i++) {
    const cityFilter = citiesSlice[i]
      .map((city) => `contains(City,'${city}')`)
      .join(" or ");

    let keepGoing = true;
    let lastTimestamp = threeMonthsAgo;
    let lastListingKey = 0;

    while (keepGoing) {
      let filter = `(${cityFilter}) and ${typeFilter} and ModificationTimestamp ge ${lastTimestamp} and ListingKey ge '${lastListingKey}' and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;

      const url = `https://query.ampre.ca/odata/Property?$filter=${filter}&$select=ListingKey,ModificationTimestamp&$top=500&$orderby=ModificationTimestamp,ListingKey`;
      console.log(url);

      const response = await fetch(url, {
        headers: {
          Authorization: process.env.BEARER_TOKEN_FOR_API,
        },
      });
      const data = await response.json();

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
  }

  return recentKeys;
};

deleteOldImages();
