const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ObjectId } = require('mongodb');

//const { connectToDb, getDb } = require('../src/db');
const { dbHandler } = require('../src/db');
const entsoe = require('../src/entsoe');
const helper = require('../src/helper');

const app = express();
const router = express.Router();

app.use(bodyParser.json());
app.use(cors());

let tempDb={};

/*let db2;
connectToDb((err) => {
  if (!err) {
    console.log('CONNECTED TO DB2');
    db2 = getDb();
  }
  else {
    console.log(err);
  }
});*/


router.get('/', (req, res) => {
  //res.send(`App is running ... `);
  res.status(200).json(tempDb);
  
  //res.send(`App is running ... `);
  //res.json(spotPricesDB);
});



router.get('/prices', (req, res) => {
  let months = []
  let query = { year: 2023, monthName: "October" };

  //console.log("DANNE    DB = ", db)
  dbHandler('', query)
  .then(function(value) {
    console.log(value);
    res.status(201).json(value)
  });
  
})

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

router.get('/latest', (req, res) => {
  
  res.status(200).json(getLatestDailyElSpotPrices());
});

const getLatestDailyElSpotPrices = () => {
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
    }); 
  } else { // It's the first day of month. The document needs to be created...or use asert in above use case ?
    // ToDo: Implement me 
  }
  console.log('DONE')
}



app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);
