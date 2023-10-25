const { getCurrencyExchangeRate } = require('./exchangerate');

const monthsAsTextList = ['January', 'February', 'Mars', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];


const addCustomCurrency = (srcObj, forceRoundUp=false) => {
  let promises =[];
  Object.values(srcObj).forEach((dayObj) => {
    if (!dayObj.hasOwnProperty('exchangeRates')) {
      dayObj.exchangeRates = {};
    };
    if (!dayObj.exchangeRates.hasOwnProperty('SEK')) {
      let date = new Date(new Date().setDate(new Date(dayObj.date).getDate()-1)); // Day before
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
      //console.log(priceSek);
      priceSek = priceSek.toFixed(numOfDecimals);
      hourObj[`${customCurrencyCode}`] = parseFloat(priceSek);
      //hourObj['sek2'] = parseFloat(((hourObj[`${baseCurrencyCode}`] * exchRate * 100)/1000).toFixed(4));

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

module.exports = { monthsAsTextList, addCustomCurrency };
