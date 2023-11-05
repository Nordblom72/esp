const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const nodeCron = require("node-cron");

const { dbHandler } = require('../src/db');
const entsoe = require('../src/entsoe');
const helper = require('../src/helper');

const app = express();
const router = express.Router();

app.use(bodyParser.json());
app.use(cors());

// Test API for the server
router.get('/', (req, res) => {
  res.status(200).json(`App is running ... `);
});

// Test API for MongoDB
router.get('/mongodb', (req, res) => {
  console.log("Fetching from mongo DB...")
  let query = { year: 2023, monthName: "November" };
  dbHandler('', query)
  .then(function(value) {
    res.status(201).json(value)
  });
})

// Test API for MongoDB. Get by ID
router.get('/prices/:id', (req, res) => {
  if (ObjectId.isValid(req.params.id)) {
    db.collection('monthlyPrices')
      .findOne({_id: ObjectId(req.params.id)})
      .then((doc) => {
        res.status(200).json(doc);
      })
      .catch(err => {
        res.status(500).json({error: 'Could not fetch the document'});
      })
    } else {
      res.status(500).json({error: 'Not a valid ID'});
    }
})



// **********************************************************************
// Test API for fetching monthly entsoe prices and calculating SEK prices
router.get('/validate', (req, res) => {
  let msg = "Data OK";
  if (req.query.year && req.query.month && ( req.query.month <= 12 && req.query.month > 0)) {
    year = parseInt(req.query.year);
    month = parseInt(req.query.month) - 1; // monthNr 0-11
    monthName = helper.monthsAsTextList[month];
    // Check health of month data in DB. Mend if needed ...
    let highestDayNr = parseInt(new Date().getDate()) - 1; // Yesterday
    helper.validateAndRepairMonthObject(year, monthName, highestDayNr)
    .then( (OK) => {
      if (!OK) {
        console.log("Inconsistend data in ",monthName, year);
        msg = "Inconsistend data in DB";
      } else {
        console.log("DATA is OK")
      }
      res.status(200).json({msg:msg})
    })
  } else {
    res.status(400).send("Bad request");
  };
});



// Test API for fetching monthly entsoe prices and calculating SEK prices
router.get('/month', (req, res) => {
  if (req.query.year && req.query.month && ( req.query.month <= 12 && req.query.month > 0)) {
    year = parseInt(req.query.year);
    month = parseInt(req.query.month) - 1; // monthNr 0-11
  } else {
    res.status(400).send("Bad request");
    return;
  };

  resMsg = getAndPopulateOneMonthInDb(year, month)
  .then( (msg) => {
    res.status(200).json({msg:msg});
  })
});

const getAndPopulateOneMonthInDb = async (year, monthNr) => { // monthNr 0-11
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12
  let spotPrices = {};
  spotPrices.year = year;
  spotPrices.monthName = helper.monthsAsTextList[monthNr]; // monthNr  0-11
  console.log('getAndPopulateOneMonthInDb(): ', spotPrices)

  // Go ahead only if there isn't alreay a record of the requested month in the DB
  // Get current month data from DB
  let query = { year: spotPrices.year, monthName: spotPrices.monthName };
  return dbHandler('', query)
  .then( async (dbRsp) => {
    if (dbRsp === null) {
      console.log("Creating and populating month: ", spotPrices.monthName);
      await entsoe.getEntsoeSpotPricesMonth(spotPrices.year, monthNr)
      .then(async function(entsoeRspMonth) {
        spotPrices.days = Object.assign(entsoeRspMonth);
        await helper.addCustomCurrency(spotPrices.days, false)
        .then( async () => {
          await dbHandler('create', spotPrices)
          .then( (acknowledged) => {
            if (!acknowledged) {
              console.log("ERROR: FAILED to create a monthly doc in DB");
              return ("FAILED to create a monthly doc in DB")
            }
            console.log("DB updated with creation of a new month object.");
            return ("DB updated with creation of a new month object.")
          })
        });
      });
    } else {
      console.log("Month obj already exists");
      return("Month obj already exists");
    }
  });
}

// Test API for fetching latest (todays) entsoe prices, calculating SEK prices and updating own DB
router.get('/latest', (req, res) => {
  resMsg = helper.getLatestDailyElSpotPrices()
  .then( (msg) => {
    res.status(200).json({msg:msg});
  })
  //res.status(200).json({msg:helper.getLatestDailyElSpotPrices()});
  //res.status(200).json(helper.getLatestDailyElSpotPrices2());
  //res.status(200).json({OK:true})
});

const getLatestDailyElSpotPrices22 = () => {
  // ToDo: Error handling
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12

  let spotPrices = {};
  spotPrices.year = parseInt(new Date().getFullYear());
  spotPrices.monthName = helper.monthsAsTextList[new Date().getMonth()];

  // Check health of current month in DB. Mend if needed ...
  console.log("Check health of current month in DB")
  let highestDayNr = parseInt(new Date().getDate()) - 1; // Yesterday
  if (!helper.validateAndRepairMonthObject(spotPrices.year, spotPrices.monthName, highestDayNr)) {
    console.log("Inconsistend data in ",spotPrices.monthName, spotPrices.year);
    return ("Inconsistend data in ",spotPrices.monthName, spotPrices.year)
  }
  
  console.log("getting today")
  // Check that todays date isn't already present in the DB
  query = { year: spotPrices.year, days: {$elemMatch: {date:(new Date()).toISOString().split('T')[0]}}};
  return dbHandler('get', query)
  .then ( (dbRspExists) => {
    if (dbRspExists === null) {
      // Get Todays ElSpot Prices from entsoe. Prices are in EUR and per MWhr
      entsoe.getEntsoeSpotPricesToday()
      .then(function(entsoeRsp) {
        spotPrices.days = Object.assign(entsoeRsp);

        // Get exchangerate and calculate local price: SEK per KWhr
        helper.addCustomCurrency(entsoeRsp, false)
        .then( () => {
          // Get current month data from DB
          let query = { year: spotPrices.year, monthName: spotPrices.monthName };
          dbHandler('', query)
          .then(function(dbRsp) {
            if (dbRsp != null && dbRsp.monthName === spotPrices.monthName) {
              dbRsp.days.push(entsoeRsp[0]);
              // Store todays data in DB
              let setQuery = {identifier: {_id: dbRsp._id}, data: { $push: { days: entsoeRsp[0] }}};
              dbHandler('update', setQuery)
              .then( (acknowledged) =>  {
                if (!acknowledged) {
                  console.log("Failed to update updated DB");
                  return "Failed to update updated DB"
                }
                return ("Succesfully updated DB with todays prices")
              });
            // Monthly data for current month is not created yet. Probaly because it is the first of the month or is missing ...
            } else if (dbRsp === null) {
              console.log("Creating and populating current month");
              // Incase the month does not exist in DB yet and it isn't first of month: Fetch spot prices for all days until today from entsoe
              entsoe.getEntsoeSpotPricesMonth(spotPrices.year, parseInt(new Date().getMonth()))
              .then(function(entsoeRspMonth) {
                spotPrices.days = Object.assign(entsoeRspMonth);
                helper.addCustomCurrency(spotPrices.days, false)
                .then( () => {
                  dbHandler('create', spotPrices)
                  .then( (acknowledged) => {
                    if (!acknowledged) {
                      console.log("Failed to create month doc in DB");
                      return ("Failed to create month doc in DB")
                    }
                    return ("Succesfully updated DB with mpnthly prices")
                  })
                });
              });
            };
          });
        });
      });
    } else {
      console.log("Document already exists")
      return ("Document already exists")
    };
  })
}


//app.use('/.netlify/functions/api', router);
app.use('/', router);

module.exports.handler = serverless(app);
