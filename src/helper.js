const { getCurrencyExchangeRate } = require('./exchangerate');
const { dbHandler } = require('../src/db');
const entsoe = require('../src/entsoe');

const monthsAsTextList = ['January', 'February', 'Mars', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const convertDateToUTC = (date) => { 
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

const convertFromUtcToLocalDate = (utcDateObj) => {
  const offset = utcDateObj.getTimezoneOffset();
  return new Date(utcDateObj.getTime() - offset * 60000);
}

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
    };
  });

  return Promise.all(promises)
    .then(promise => {
      let idx = 0;
      Object.values(srcObj).forEach((dayObj) => {
        if (!dayObj.exchangeRates.hasOwnProperty('SEK') && promise[idx].hasOwnProperty("rates")) {
          dayObj.exchangeRates.SEK = promise[idx].rates.SEK;
          updateCustomCurrencyDay(dayObj, "eur", "sek", forceRoundUp);
          idx++;
        };
      });
      return true;
    })
    .catch((error) => {
      console.log('Error:', error);
      return false;
    });
}


// Convert from baseCurrencyCode to customCurrencyCode
// The base price is per 1MWh 
// Convert it to the price per kWh
// ToDo: Remove the roundUp ability
const updateCustomCurrencyDay = (dayObj, baseCurrencyCode, customCurrencyCode, forceRoundUp) => {
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
    };
  });
}

function alwaysRoundUp (num, nrOfDecimals) {
  if (Math.sign(num) === 1) {
    return (Math.ceil(num*100)/100);
  } else if (Math.sign(num) === -1) {
    let a = Math.abs(num);
    return ((Math.ceil(a*100)/100)*-1);
  } else {
    return 0;
  }
}

const validateAndRepairMonthObject = (year, montName, highestDayNr) => {
  let promises = [];
  // Get the month object from DB
  let query = { year: year, monthName: montName };
  return dbHandler('get', query)
  .then((dbMonthObj) => {
    if (dbMonthObj !== null) {
      // Check for any potential holes in the data series, i.e. missing days. Fix the data series order if needed
      let sortedDays = Object.assign(sortDayObjectsInArray(dbMonthObj.days, highestDayNr));

      // Check for 'holes' in the sorted array
      const missingDays = getMissingDays(sortedDays, highestDayNr);
      if (missingDays.length !== 0) { // > 0 means some days are missing. Go and get them from entsoe ...
        console.log(`  helper.validateAndRepairMonthObject(), Found missing days for ${montName}, ${year}. missing day(s): `, missingDays);
        for (let i = 0; i < missingDays.length; i++) {
          // Creating a new Date() object that is in the past will initiate it to 00:00:00 hours.
          // Converting it to UTC can shift that day by - 1 days.
          // So, make sure the clock is somewhere around noon.
          date = convertDateToUTC(new Date((new Date(year.toString() + '-' + (monthsAsTextList.indexOf(montName)+1).toString() + '-' + missingDays[i].toString())).setHours(12, 0, 0)));
          promises.push(entsoe.getEntsoeSpotPricesDay(date));
        };
        return Promise.all(promises)
        .then(promise => {
          for (let i = 0; i < promise.length; i++) {
            let dayNr = (promise[i][0].date).split('-')[2];
            sortedDays[dayNr-1] = (promise[i][0]);
          }
          return addCustomCurrency(sortedDays, false)
          .then( async () => {
            dbMonthObj.days = sortedDays;
            let OK = await dbHandler('update', { identifier: {_id: dbMonthObj._id}, data: { $set: { days: dbMonthObj.days }}})
            if (OK) {
              return true; // Doc mended.
            } else {
              console.log(`ERROR: helper.validateAndRepairMonthObject(), Failed to update missing days in DB for ${montName}, ${year}. missing days: `, missingDays)
              return false;
            }
          })
        })
        .catch((error) => {
          console.log('Error:', error);
          return false;
        });
      }
    }
    return true; // Doc is either OK or not found in DB, so if it does not exist it can not have flaus
  })
  .catch((error) => {
    console.log('Error:', error);
    return false; // Something wen't wrong
  });
}

// This function returns an array of mising days.
// The array must be sorted and padded with empty objects where days are missing, before calling this function
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

// Returns a new array of sorted day objects. And the arrey is padded where days are missing
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

const getAndPopulateOneMonthInDb = async (year, monthNr) => { // monthNr 0-11
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12
  let spotPrices = {};
  spotPrices.year = year;
  spotPrices.monthName = monthsAsTextList[monthNr]; // monthNr  0-11
  console.log('  helper.getAndPopulateOneMonthInDb(), ', spotPrices)

  // Go ahead only if there isn't alreay a record of the requested month in the DB
  // Get current month data from DB
  let query = { year: spotPrices.year, monthName: spotPrices.monthName };
  return dbHandler('', query)
  .then( async (dbRsp) => {
    if (dbRsp === null) {
      console.log("  helper.getAndPopulateOneMonthInDb(), Creating and populating month: ", spotPrices.monthName);
      await entsoe.getEntsoeSpotPricesMonth(spotPrices.year, monthNr)
      .then(async function(entsoeRspMonth) {
        spotPrices.days = Object.assign(entsoeRspMonth);
        await addCustomCurrency(spotPrices.days, false)
        .then( async () => {
          await dbHandler('create', spotPrices)
          .then( (acknowledged) => {
            if (!acknowledged) {
              console.log("  ERROR: helper.getAndPopulateOneMonthInDb(), FAILED to create a monthly doc in DB");
              return ("FAILED to create a monthly doc in DB");
            }
            console.log("  helper.getAndPopulateOneMonthInDb(), DB updated with creation of a new month object.");
            return ("DB updated with creation of a new month object.");
          })
        });
      });
    } else {
      console.log("  helper.getAndPopulateOneMonthInDb(), Month obj already exists");
      return("Month obj already exists");
    }
  });
}

const getLatestDailyElSpotPrices = async () => {
  // ToDo: Error handling
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12

  let spotPrices = {};
  spotPrices.year = parseInt(new Date().getFullYear());
  spotPrices.monthName = monthsAsTextList[new Date().getMonth()];

  // Check health of current month in DB. Mend if needed ...
  console.log("Performing health check of this months document in dB");
  let highestDayNr = parseInt(new Date().getDate()) - 1; // Yesterday
  if (! await validateAndRepairMonthObject(spotPrices.year, spotPrices.monthName, highestDayNr)) {
    console.log("  helper.getLatestDailyElSpotPrices(), Inconsistent data in ",spotPrices.monthName, spotPrices.year);
    return ("Inconsistent data in DB");
  }

  todayDateUTC = convertDateToUTC(new Date());
  console.log("  helper.getLatestDailyElSpotPrices(), getting today: ", new Date(), " UTC: ", todayDateUTC);
  // Check that todays date isn't already present in the DB
  query = { year: spotPrices.year, days: {$elemMatch: {date:todayDateUTC.toISOString().split('T')[0]}}};
  return dbHandler('get', query)
  .then( async (dbRspExists) => {
    if (dbRspExists === null) {
      // Get Todays ElSpot Prices from entsoe. Prices are in EUR and per MWhr
      await entsoe.getEntsoeSpotPricesToday()
      .then(async function (entsoeRsp) {
        spotPrices.days = Object.assign(entsoeRsp);

        // Get exchangerate and calculate local price: SEK per KWhr
        await addCustomCurrency(entsoeRsp, false)
        .then( async () => {
          // Get current month data from DB
          let query = { year: spotPrices.year, monthName: spotPrices.monthName };
          await dbHandler('get', query)
          .then(async function (dbRsp) {
            if (dbRsp != null && dbRsp.monthName === spotPrices.monthName) {
              dbRsp.days.push(entsoeRsp[0]);
              // Store todays data in DB
              let setQuery = { identifier: { _id: dbRsp._id }, data: { $push: { days: entsoeRsp[0] } } };
              await dbHandler('update', setQuery)
              .then((acknowledged) => {
                if (!acknowledged) {
                  console.log("ERROR:   helper.getLatestDailyElSpotPrices(), FAILED to update DB eith todays el-spot prices");
                  return "FAILED to update DB eith todays el-spot prices";
                }
                console.log("  helper.getLatestDailyElSpotPrices(), DB updated with insertion of todays elspot prices");
                return ("DB updated with insertion of todays elspot prices");
              });
            } else if (dbRsp === null) {
              console.log("  helper.getLatestDailyElSpotPrices(), Creating and populating current month");
              // Incase the month does not exist in DB yet and it isn't first of month: Fetch spot prices for all days until today from entsoe
              await entsoe.getEntsoeSpotPricesMonth(spotPrices.year, parseInt(new Date().getMonth()))
              .then(async function (entsoeRspMonth) {
                spotPrices.days = Object.assign(entsoeRspMonth);
                await addCustomCurrency(spotPrices.days, false)
                .then( async () => {
                  await dbHandler('create', spotPrices)
                  .then((acknowledged_1) => {
                    if (!acknowledged_1) {
                      console.log("ERROR:   helper.getLatestDailyElSpotPrices(), FAILED to create a monthly doc in DB");
                      return ("FAILED to create a monthly doc in DB");
                    }
                    console.log("  helper.getLatestDailyElSpotPrices(), DB updated with creation of a new month object, containing says until today.");
                    return ("DB updated with creation of a new month object, containing says until today.");
                  });
                });
              });
            };
          });
        });
      });
    } else {
      console.log("  helper.getLatestDailyElSpotPrices(), Document already exists");
      return ("Document already exists");
    }
  });
}


module.exports =  { monthsAsTextList, addCustomCurrency, areDayObjectsInArraySorted,
                    sortDayObjectsInArray, validateAndRepairMonthObject, getLatestDailyElSpotPrices,
                    convertDateToUTC, getAndPopulateOneMonthInDb, convertFromUtcToLocalDate
                  };
