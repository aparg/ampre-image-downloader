const fs = require("fs");
const path = require("path");
require("dotenv").config();

const getAllImages = async () => {
  // Read listing keys from test.txt
  await getAllPropertiesKeys();
  const listingKeys = JSON.parse(
    fs.readFileSync("Data/allActiveProperties.txt", "utf-8")
  );
  const imagesDir = path.join(__dirname, "../Data/Images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  for (const key of listingKeys) {
    console.log("Fetching media request for " + key);
    const url = `https://query.ampre.ca/odata/Media?$select=MediaURL,PreferredPhotoYN&$filter=ResourceRecordKey eq '${key}' and ImageSizeDescription eq 'Large' and MediaStatus eq 'Active'`;
    const response = await fetch(url, {
      headers: {
        Authorization: process.env.BEARER_TOKEN_FOR_API,
      },
    });
    const data = await response.json();
    if (Array.isArray(data.value)) {
      // Sort so PreferredPhotoYN === true come first
      data.value.sort(
        (a, b) => (b.PreferredPhotoYN === true) - (a.PreferredPhotoYN === true)
      );
      console.log(data.value.map((item) => item.PreferredPhotoYN));
      for (let i = 0; i < data.value.length; i++) {
        const mediaURL = data.value[i].MediaURL;
        if (mediaURL) {
          const imgRes = await fetch(mediaURL);
          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          fs.writeFileSync(path.join(imagesDir, `${key}-${i}.jpg`), buffer);
          console.log(`Downloaded image for ${key}-${i}`);
        }
      }
    }
  }
};

const getAllPropertiesKeys = async () => {
  const cities = [
    "Toronto",
    "Mississauga",
    "Brampton",
    "Vaughan",
    "Markham",
    "Pickering",
    "Ajax",
    "Oshawa",
    "Burlington",
    "Richmond Hill",
    "Hamilton",
    "Guelph",
    "Barrie",
    "St. Catharines",
    "Niagara Falls",
    "Brantford",
    "Kitchener",
    "Cambridge",
  ];
  const cityFilter = cities.map((city) => `City eq '${city}'`).join(" or ");
  let lastTimestamp = startDate;
  let lastListingKey = 0;
  let allKeys = [];
  let keepGoing = true;

  while (keepGoing) {
    let filter = `(${cityFilter}) and (ModificationTimestamp gt ${lastTimestamp} or (ModificationTimestamp eq ${lastTimestamp} and ListingKey gt '${lastListingKey}')) and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;
    console.log(filter);
    const url = `https://query.ampre.ca/odata/Property?$filter=${encodeURIComponent(
      filter
    )}&$select=ListingKey,ModificationTimestamp&$top=500&$orderby=ModificationTimestamp,ListingKey`;
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
        // Set lastListingKey and lastTimestamp to the last item's values
        const lastItem = data.value[data.value.length - 1];
        lastListingKey = lastItem.ListingKey;
        lastTimestamp = lastItem.ModificationTimestamp;
      }
    } else {
      keepGoing = false;
    }
  }
  fs.writeFileSync("Data/allActiveProperties.txt", JSON.stringify(allKeys));
};

const [, , startDate, endDate] = process.argv;
getAllImages().catch(console.error);
