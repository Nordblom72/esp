const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ObjectId } = require('mongodb');

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
  let query = { year: 2023, monthName: "October" };
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

// ????
router.post('/monthlyPrices', (req, res) => {
  const month = req.body
  db.collection('monthlyPrices')
    .insertOne(month)
    .then(result => {
      res.status(201).json(result)
    })
    .catch(err => {
      res.status(500).json({err: 'Could not create a new document'})
    })
})

// Test API for fetching monthly entsoe prices and calculating SEK prices
router.get('/month', (req, res) => {
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12
  let year;
  let days;
  let spotPricesDB = {};

  if (req.query.year && req.query.month) {
    year = parseInt(req.query.year);
    month = parseInt(req.query.month) - 1;
    // ToDo: Add range checks
  } else {
    res.status(400).send("Bad request");
    return
  };
  
  spotPricesDB.year = year;
  spotPricesDB.monthName = helper.monthsAsTextList[month];

  entsoe.getEntsoeSpotPricesMonth(year, month)
  .then(function(value) {
    spotPricesDB.days = Object.assign(value);
    helper.addCustomCurrency(spotPricesDB.days, false)
    .then( () => {
      res.status(200).json(spotPricesDB);
      //console.log(JSON.stringify(spotPricesDB, null, 2))
    })
  });
 //res.status(200).json(spotPricesDB);
});


// Test API for fetching latest (todays) entsoe prices, calculating SEK prices and updating own DB
router.get('/latest', (req, res) => {
  
  res.status(200).json(getLatestDailyElSpotPrices());
});

// Refactor....
// 1st request should go to entsoe
// 2nd request should go to exchangerate
// and do the mongodb requests at the end
const getLatestDailyElSpotPrices2 = () => {
  // ToDo: Error handling
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12

  let spotPricesDB = {};
  let spotPrices = {};
  spotPrices.year = new Date().getFullYear();
  spotPrices.monthName = helper.monthsAsTextList[new Date().getMonth()];

  if (new Date().getDate() > 1) { // If it isn't the first day of month ...
    // Get currently available data for current month from DB
    const query = { year: spotPrices.year, monthName: spotPrices.monthName };
    dbHandler('', query)
    .then(function(dbRsp) {
      if (dbRsp != null && dbRsp.monthName === spotPrices.monthName) {
        //console.log(dbRsp);
        console.log('GOT good rsp from DB')
        // Here we need to call a function to validate that the rsp contains days untill yesterday
        // For now, we assume no holes in the returned response
        // Get todays prices from entsoe
        entsoe.getEntsoeSpotPricesToday()
        .then(function(entsoeRsp) {
          spotPrices.days = Object.assign(entsoeRsp);
          helper.addCustomCurrency(entsoeRsp, false)
          .then( () => {
            dbRsp.days.push(entsoeRsp[0]);
            const setQuery = {identifier: {_id: dbRsp._id}, data: { $push: { days: entsoeRsp[0] }}};
            dbHandler('update', setQuery)
            .then(function(acknowledged) {
              if (acknowledged) {
                console.log("Succesfully updated DB");
                //return
              }else {
                console.log("hmmmmmmm")
              }
            })
          })
        });
      }
      else {
        console.log("NIT")
      }
    }); 
  } else { // It's the first day of month. The document needs to be created.
    // ToDo: Implement me 
    console.log("MONTH DATA NOT IN DB")
  }
  console.log('DONE')
}


const getLatestDailyElSpotPrices = () => {
  // ToDo: Error handling
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12

  let spotPrices = {};
  spotPrices.year = parseInt(new Date().getFullYear());
  spotPrices.monthName = helper.monthsAsTextList[new Date().getMonth()];

  // Get Todays ElSpot Prices from entsoe. Prices are in EUR
  entsoe.getEntsoeSpotPricesToday()
  .then(function(entsoeRsp) {
    spotPrices.days = Object.assign(entsoeRsp);
    // Get exchangerate and calculate local price
    helper.addCustomCurrency(entsoeRsp, false)
    .then( () => {
      //dbRsp.days.push(entsoeRsp[0]);
      // Get current month data from DB
      let query = { year: spotPrices.year, monthName: spotPrices.monthName };
      dbHandler('', query)
      .then(function(dbRsp) {
        if (dbRsp != null && dbRsp.monthName === spotPrices.monthName) {
          // Check for any potential holes in the data series, i.e. missing days. Fix data series if needed

          // Check that todays date isn't already present in the DB
          query = { _id: dbRsp._id, days: {$elemMatch: {date:(new Date()).toISOString().split('T')[0]}} }
          dbHandler('get', query)
          .then ( (dbRspExists) => {
            if (dbRspExists === null) {
              // Store todays data in DB
              let setQuery = {identifier: {_id: dbRsp._id}, data: { $push: { days: entsoeRsp[0] }}};
              dbHandler('update', setQuery)
              .then( (acknowledged) =>  {
                if (!acknowledged) {
                  console.log("Failed to update updated DB");
                }
              });
            };
          })
        } else if (dbRsp === null) {
          // Monthly data for current month is not created yet. Probaly becasue it is first of the month
          console.log("Creating and populating current month");
          entsoe.getEntsoeSpotPricesMonth(spotPrices.year, parseInt(new Date().getMonth()))
          .then(function(entsoeRspMonth) {
            spotPrices.days = Object.assign(entsoeRspMonth);
            helper.addCustomCurrency(spotPrices.days, false)
            .then( () => {
              dbHandler('create', spotPrices)
              .then( (acknowledged) => {
                if (!acknowledged) {
                  console.log("Failed to create month doc in DB");
                }
              })
            });
          });
        };
      });
    });
  });
}


app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);
