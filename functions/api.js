const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');

const { connectToDb, getDb } = require('../src/db');
const entsoe = require('../src/entsoe');
const helper = require('../src/helper')

const app = express();
const router = express.Router();

app.use(bodyParser.json());
app.use(cors());

let db;
connectToDb((err) => {
  if (!err) {
    console.log('CONNECTED TO DB');
    db = getDb();
  }
  else {
    console.log(err);
  }
});


router.get('/', (req, res) => {
  res.send(`App is running ... `);
  
  //res.send(`App is running ... `);
  //res.json(spotPricesDB);
});




router.get('/month', (req, res) => {
  let year;
  let month;
  let spotPricesDB = {
    year: '',
    months: {}
  };

  if (req.query.year && req.query.month) {
    year = parseInt(req.query.year);
    month = parseInt(req.query.month);
    // ToDo: Add range checks
  } else {
    res.status(400).send("Bad request");
    return
  };
  
  spotPricesDB.year = year;

  entsoe.getEntsoeSpotPricesMonth(year, month)
  .then(function(value) {
    spotPricesDB.months[month] = Object.assign(value);
    helper.addCustomCurrency(spotPricesDB.months[month], false)
    .then( () => {
      res.status(200).json(spotPricesDB);
    })
  });
});

router.get('/latest', (req, res) => {
  let year;
  let month;
  let spotPricesDB = {};


  entsoe.getEntsoeSpotPricesToday()
  .then(function(value) {
    spotPricesDB = Object.assign(value);
    //console.log(spotPricesDB)
    helper.addCustomCurrency(spotPricesDB, false)
    .then( () => {
      res.status(200).json(spotPricesDB);
    })
  });
});



app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);
