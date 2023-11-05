const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ObjectId } = require('mongodb');

const { dbHandler } = require('../src/db');
const helper = require('../src/helper');

const app = express();
const router = express.Router();

app.use(bodyParser.json());
app.use(cors());

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// A bunch of test API's for poking the server, mongoDB, etc.
// These are disabled in production env.
// To be removed when no longer needed.
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// Test API for the server
router.get('/', (req, res) => {
  res.status(200).json(`I'm here... stop poking me`);
});

// Test API for MongoDB
router.get('/mongodb', (req, res) => {
  console.log("Fetching from mongo DB...");
  let query = { year: 2023, monthName: "November" };
  dbHandler('', query)
  .then(function(value) {
    res.status(201).json(value)
  });
})

// Test API for fetching from MongoDB by ID. Yet to be tested ...
router.get('/prices/:id', (req, res) => {
  if (ObjectId.isValid(req.params.id)) {
    dbHandler('get', {_id: ObjectId(req.params.id)})
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


// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// A set of API's for doing some actual work. Such as:
// Update DB with todays el-spot prices. Populate DB with whole
// month objects if historical data is nedded, etc.
// ToDo: Thess API's shall be protected from public access. 
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// API for performing data validation on existing monthly objects
// in DB. It checks for missing days and mends if needed.
// Works in dev environmet. Need to be adapted for netlify env, but
// it can wait as I don't see a need for it there...yet
router.get('/validate', (req, res) => {
  let msg = "Data ...";
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
        console.log("Data OK or month obj does not exist!");
      }
      res.status(200).json({msg:msg});
    })
  } else {
    res.status(400).send("Bad request");
  };
});


// API for fetching monthly entsoe prices, calculating SEK prices and updating the local DB
router.get('/month', (req, res) => {
  if (req.query.year && req.query.month && ( req.query.month <= 12 && req.query.month > 0)) {
    year = parseInt(req.query.year);
    month = parseInt(req.query.month) - 1; // monthNr 0-11
  } else {
    res.status(400).send("Bad request");
    return;
  };

  resMsg = helper.getAndPopulateOneMonthInDb(year, month)
  .then( (msg) => {
    res.status(200).json({msg:msg});
  });
});


// API for fetching latest (todays) entsoe prices, calculating SEK prices and updating the local DB
router.get('/latest', (req, res) => {
  resMsg = helper.getLatestDailyElSpotPrices()
  .then( (msg) => {
    res.status(200).json({msg:msg});
  });
});


//app.use('/.netlify/functions/api', router);
app.use('/', router);

module.exports.handler = serverless(app);
