const { getCurrencyExchangeRate } = require('./exchangerate');
const { dbHandler } = require('../src/db');
const entsoe = require('../src/entsoe');

const monthsAsTextList = ['January', 'February', 'Mars', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];


const addCustomCurrency = (srcObj, forceRoundUp=false) => {
  let promises =[];
  Object.values(srcObj).forEach((dayObj) => {
    if (!dayObj.hasOwnProperty('exchangeRates')) {
      dayObj.exchangeRates = {};
    };
    if (!dayObj.exchangeRates.hasOwnProperty('SEK')) {
      let date = new Date(dayObj.date);
      date = new Date(date.setDate(date.getDate() - 1)); // Day before
      date = date.toISOString().split('T')[0];
      promises.push(getCurrencyExchangeRate(date, 'EUR', 'SEK'));
    }
  });

  return Promise.all(promises)
    .then(promise => {
      let idx = 0;
      Object.values(srcObj).forEach((dayObj) => {
        if (!dayObj.exchangeRates.hasOwnProperty('SEK') && promise[idx].hasOwnProperty("rates")) {
          dayObj.exchangeRates.SEK = promise[idx].rates.SEK;
          updateCustomCurrencyDay(dayObj, "eur", "sek", forceRoundUp);
          idx++;
        }
      });
      return true
    })
    .catch((error) => {
      console.log('Error:', error);
      return false
    });
}


// Convert from baseCurrencyCode to customCurrencyCode
// The base price is per 1MWh 
// Divide by 1000 to get the price per kWh
const updateCustomCurrencyDay = (dayObj, baseCurrencyCode, customCurrencyCode, forceRoundUp) => {
  //console.log(dayObj)
  let exchRate;
  const numOfDecimals = 2;
  if (dayObj.hasOwnProperty('exchangeRates')) {
    if (dayObj.exchangeRates.hasOwnProperty(customCurrencyCode.toUpperCase())) {
      exchRate = dayObj.exchangeRates[`${customCurrencyCode}`.toUpperCase()];
    }
  } else {
    // ToDo: Some error handling
    return;
  }

  Object.values(dayObj.spotPrices).forEach((hourObj) => {
    if (hourObj.hasOwnProperty(baseCurrencyCode)) {
      let priceSek;
      if (forceRoundUp) {
        priceSek = alwaysRoundUp(((hourObj[`${baseCurrencyCode}`] * exchRate * 100)/1000), numOfDecimals);
      } else {
        priceSek = ((hourObj[`${baseCurrencyCode}`] * exchRate * 100)/1000);
      }
      priceSek = priceSek.toFixed(numOfDecimals);
      hourObj[`${customCurrencyCode}`] = parseFloat(priceSek);
    }
    else {
      // ToDo: Some error hadling
      return;
    }
  });
}


function alwaysRoundUp (num, nrOfDecimals) {
  if (Math.sign(num) === 1) {
    return (Math.ceil(num*100)/100);
  } else if (Math.sign(num) === -1) {
    let a = Math.abs(num);
    return ((Math.ceil(a*100)/100)*-1);
  } else {
    return 0
  }
}

const validateAndRepairMonthObject = (year, montName, highestDayNr) => {
  let promises = [];
  // Get the month object from DB
  let query = { year: year, monthName: montName };
  dbHandler('', query)
  .then((dbMonthObj) => {
    if (dbMonthObj !== null) {
      // Check for any potential holes in the data series, i.e. missing days. Fix the data series order if needed
      let sortedDays = Object.assign(sortDayObjectsInArray(dbMonthObj.days, highestDayNr));

      // Check for 'holes' in the sorted array
      const missingDays = getMissingDays(sortedDays, highestDayNr);
      if (missingDays.length !== 0) { // > 0 means some days are missing. Go and get them from entsoe ...
        for (let i = 0; i < missingDays.length; i++) {
          date = new Date(year.toString() + '-' + (monthsAsTextList.indexOf(montName)+1).toString() + '-' + missingDays[i].toString());
          promises.push(entsoe.getEntsoeSpotPricesDay(date));
        };
        Promise.all(promises)
        .then(promise => {
          for (let i = 0; i < promise.length; i++) {
            let dayNr = (promise[i][0].date).split('-')[2];
            sortedDays[dayNr-1] = (promise[i][0]);
          }
          addCustomCurrency(sortedDays, false)
          .then( () => {
            dbMonthObj.days = sortedDays;
            dbHandler('update', { identifier: {_id: dbMonthObj._id}, data: { $set: { days: dbMonthObj.days }}});
          })
        })
        .catch((error) => {
          console.log('Error:', error);
          return false
        });
      }
    }
  })
  .catch((error) => {
    console.log('Error:', error);
  });
  return true;
}

// This function returns an array of mising days.
// The array must be sorted and padded before calling this function
const getMissingDays = (daysArr) => {
  let missingDays = [];
  for (let i = 0; i < daysArr.length; i++) {
    if ( (typeof(daysArr[i]) === 'object' && !daysArr[i].hasOwnProperty('date')) || typeof(daysArr[i]) !== 'object'  ) {
      missingDays.push(i+1);
    }
  }
  return (missingDays);
}

// This functions checks that the dayObject's dates in the array are in ascending order.
// It does not check for any day gaps in the array.
// Returns true or false
const areDayObjectsInArraySorted = (daysArr=[]) => {
  let prevVal = 0;
  for (let i = 0; i < daysArr.length; i++) { 
    if (typeof(daysArr[i]) === 'object' && daysArr[i].hasOwnProperty('date')) {
      dayNr = parseInt(daysArr[i].date.split('-')[2]);
      if (dayNr > prevVal) {
        prevVal = dayNr;
      } else {
        return (false);
      }
    }
  };
  return (true);
}

const sortDayObjectsInArray = (daysArr, highestDayNr) => {
  let newArr = [];
  daysArr.forEach((dayObj) => {
    dayNr = parseInt(dayObj.date.split('-')[2]);
    newArr[dayNr-1] = dayObj;
  });
  // Loop again and set empty objets in undefined places
  for (let i = 0; i < highestDayNr; i++) {
    if (typeof(newArr[i]) !== 'object') {
      newArr[i] = {};
    };
  };
  // Truncate array if highestDayNr is less than in daysArr
  return (newArr.slice(0, highestDayNr));
}


const getLatestDailyElSpotPrices = () => {
  // ToDo: Error handling
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12

  let spotPrices = {};
  spotPrices.year = parseInt(new Date().getFullYear());
  spotPrices.monthName = monthsAsTextList[new Date().getMonth()];

  // Check health of current month in DB. Mend if needed ...
  let highestDayNr = parseInt(new Date().getDate()) - 1; // Yesterday
  if (!validateAndRepairMonthObject(spotPrices.year, spotPrices.monthName, highestDayNr)) {
    console.log("Inconsistend data in ",spotPrices.monthName, spotPrices.year);
    return ("Inconsistend data in DB")
  }
  
  console.log("getting today: ", new Date())
  // Check that todays date isn't already present in the DB
  query = { year: spotPrices.year, days: {$elemMatch: {date:(new Date()).toISOString().split('T')[0]}}};
  console.log(JSON.stringify(query, null, 2));
  return dbHandler('get', query)
  .then ( (dbRspExists) => {
    console.log('dbRspExists: ',dbRspExists);
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
                    return ("Succesfully updated DB with monthly-object prices")
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


module.exports = { monthsAsTextList, addCustomCurrency, areDayObjectsInArraySorted, sortDayObjectsInArray, validateAndRepairMonthObject, getLatestDailyElSpotPrices };
