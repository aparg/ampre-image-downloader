const fs = require("fs");
const path = require("path");
require("dotenv").config();

const updateImages = async () => {
  const imagesDir = path.join(__dirname, "../Data/Images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Get ISO string for 1 hour ago
  const now = new Date();
  console.log(new Date(now.getTime()).toISOString());
  const oneHourAgo = new Date(now.getTime() - 8 * 60 * 1000).toISOString();
  //the now time is reduced by 3 minutes to account for any delays in the ampre server updates
  //the time covered for each update iteration is 5 minutes total
  const nowTime = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
  const allActivePropertiesPath = path.join(
    __dirname,
    "../Data/allActiveProperties.txt"
  );
  let lastTimestamp = oneHourAgo;
  let lastListingKey = 0;
  let keepGoing = true;
  let recentKeys = [];
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
  console.log(`Downloaded images for ${oneHourAgo} to ${nowTime}`);
  const cityFilter = (cities) =>
    cities.map((city) => `contains(City,'${city}')`).join(" or ");
  while (keepGoing) {
    // Fetch listings modified or with media changed in the last hour
    // let filter = `(ModificationTimestamp gt ${lastTimestamp} or (ModificationTimestamp eq ${lastTimestamp} and ListingKey gt 'X12314516') or MediaChangeTimestamp gt ${oneHourAgo}) and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;
    const citiesSlice = [cities.slice(0, 15), cities.slice(15, cities.length)];
    let data = { value: [] };
    for (let i = 0; i < citiesSlice.length; i++) {
      let filter = `(${cityFilter(
        citiesSlice[i]
      )}) and ((ModificationTimestamp ge ${lastTimestamp} and ModificationTimestamp le ${nowTime}  and ListingKey gt '${lastListingKey}') or (MediaChangeTimestamp gt ${oneHourAgo})) and ContractStatus eq 'Available' and StandardStatus eq 'Active'`;
      const url = `https://query.ampre.ca/odata/Property?$filter=${encodeURIComponent(
        filter
      )}&$select=ListingKey,ModificationTimestamp,MediaChangeTimestamp&$top=500&$orderby=ModificationTimestamp,ListingKey`;
      console.log(url);
      const response = await fetch(url, {
        headers: {
          Authorization: process.env.BEARER_TOKEN_FOR_API,
        },
      });
      const responseJson = await response.json();
      console.log(responseJson);
      data.value = [...data.value, ...responseJson.value];
    }
    if (data.value && data.value.length > 0) {
      console.log("Total data:" + data.value.length);
      for (const item of data.value) {
        console.log("Pushing key " + item.ListingKey + " for download");
        recentKeys.push(item.ListingKey);
        // Remove previous images if MediaChangeTimestamp is within the last hour
        if (
          item.MediaChangeTimestamp &&
          new Date(item.MediaChangeTimestamp) > new Date(oneHourAgo)
        ) {
          // Remove all images for this listing key
          const files = fs.readdirSync(imagesDir);
          files.forEach((file) => {
            if (file.startsWith(item.ListingKey + "-")) {
              fs.unlinkSync(path.join(imagesDir, file));
            }
          });
        }
      }
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

  // Now fetch and save images for these keys
  for (const key of recentKeys) {
    try {
      const url = `https://query.ampre.ca/odata/Media?$select=MediaURL,PreferredPhotoYN&$filter=ResourceRecordKey eq '${key}' and ImageSizeDescription eq 'Large' and MediaStatus eq 'Active'`;
      const response = await fetch(url, {
        headers: {
          Authorization: process.env.BEARER_TOKEN_FOR_API,
        },
      });
      console.log(response);
      const data = await response.json();
      if (Array.isArray(data.value)) {
        // Sort so PreferredPhotoYN === true come first
        data.value.sort(
          (a, b) =>
            (b.PreferredPhotoYN === true) - (a.PreferredPhotoYN === true)
        );
        const allProperties = fs.readFileSync(allActivePropertiesPath);
        const array = JSON.parse(allProperties);
        array.push(key);
        // console.log(array);
        fs.writeFileSync(allActivePropertiesPath, JSON.stringify(array));
        for (let i = 0; i < data.value.length; i++) {
          const mediaURL = data.value[i].MediaURL;

          if (mediaURL) {
            const imgRes = await fetch(mediaURL);
            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(path.join(imagesDir, `${key}-${i}.jpg`), buffer);
            // console.log(allProperties);

            console.log(`Downloaded image for ${key}-${i}`);
          }
        }
        // const data = fs.readFileSync("./Data/Images/allActiveProperties.txt");
      }
    } catch (err) {
      console.log("Error fetching data: " + err);
    }
  }
  console.log(`Downloaded images for ${oneHourAgo} to ${nowTime}`);
};

updateImages();
