const xml_to_js = require('xml-js');//npm i xml-js

const ENTSOE_DEFAULTS = {
  url: 'https://web-api.tp.entsoe.eu/api',
  securitycToken: '3a95457c-4ded-4404-ba14-6bcb05e97b8b',
  docType: 'A44',
  inDomain: '10Y1001A1001A47J',
  outDoamin: '10Y1001A1001A47J'
}

const monthsAsTextList = ['January', 'February', 'Mars', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(date) {
  // Return date in format: YYYYMMDDHHMM

  // input is a Date Object. Expected format is: YYYY-MM-DDTHH:MM:SS.DDDZ
  if (typeof date.getMonth === 'function') { 
    return(date.toISOString().slice(-24).replace(/\D/g,'').slice(0, 12));
  }
  // Input is not a Date object. Tt's a string
  else if (date.length === 19) { // Expected format is: YYYY-MM-DD HH:MM:SS
    return(date.slice(-24).replace(/\D/g,'').slice(0, 12));
  }
}

const getEntsoeSpotPricesToday = () => {
  const todayDate = new Date();
  const todayDay = todayDate.getUTCDate();
  const year = todayDate.getUTCFullYear();
  const monthNr = todayDate.getUTCMonth();

  let periodStartDate = new Date(`${monthsAsTextList[monthNr]}, ${todayDay}, ${year}`);
  periodStartDate = periodStartDate.toLocaleString("se-SE", {timeZone: "Europe/Stockholm"});
  let periodEndDate   = new Date(`${monthsAsTextList[monthNr]}, ${todayDay + 1}, ${year}`);
  periodEndDate = periodEndDate.toLocaleString("se-SE", {timeZone: "Europe/Stockholm"});

  console.log("START: ", periodStartDate)
  console.log("END:   ", periodEndDate)
  console.log( `${monthsAsTextList[monthNr]}, ${todayDay}, ${year}`);

  return getEntsoeSpotPrices(formatDate(periodStartDate), formatDate(periodEndDate))
  .then(function(rspObj) {
    if (Object.keys(rspObj).length === 2) {
      delete rspObj['1']; // Don't care about tomorrow data
    }
    return (rspObj);
  })
  .catch((error) => {
    console.error('Error:', error);
  });
}


const getEntsoeSpotPricesMonth = (year, monthNr) => {
  const todayDate = new Date();
  const todayDay = todayDate.getUTCDate();
  const currentYear = todayDate.getUTCFullYear();
  const numDaysInMonth = new Date(year, monthNr, 0).getDate();
  let periodStartDate = new Date(monthsAsTextList[monthNr] + ', 1, ' + year);
  console.log("BEFORE: ", periodStartDate)
  periodStartDate = periodStartDate.toLocaleString("se-SE", {timeZone: "Europe/Stockholm"});
  console.log("AFTER: ", periodStartDate)
  let periodEndDate = '';

  console.log("todayDate = ", todayDate);
  console.log("todayDay =", todayDay);

  if ( (year < currentYear) || (year === currentYear && monthNr < todayDate.getMonth()) ) {
    periodEndDate = new Date(`${monthsAsTextList[monthNr]}, ${numDaysInMonth}, ${year}`);
    console.log("...It is in the past...")
  } else if (year === currentYear && monthNr === todayDate.getMonth()) {
    periodEndDate = new Date(`${monthsAsTextList[monthNr]}, ${todayDate.getDate()+1}, ${year}`);
    console.log(`It is present date: requested month = ${monthNr},  todayMonth = ${todayDate.getMonth()}` )
  } else {
    // ToDo: reject request... raise error ...
    console.log("...it's a future date...")
  }
  periodEndDate = periodEndDate.toLocaleString("se-SE", {timeZone: "Europe/Stockholm"});
  
  console.log("START: ", periodStartDate)
  console.log("END:   ", periodEndDate)
  console.log( `${monthsAsTextList[monthNr]}, ${numDaysInMonth}, ${year}`);
  return getEntsoeSpotPrices(formatDate(periodStartDate), formatDate(periodEndDate))
  .then(function(rspObj) {
    return rspObj})
  .catch((error) => {
    console.error('Error:', error);
  });
}

const getEntsoeSpotPrices = (startDate, endDate) => {
  console.log("START DATE: ",startDate);
  console.log("END DATE: ",endDate)
  const apiUrl =  ENTSOE_DEFAULTS.url + 
                  '?securityToken=' + ENTSOE_DEFAULTS.securitycToken + 
                  '&documentType=' + ENTSOE_DEFAULTS.docType + 
                  '&in_domain=' + ENTSOE_DEFAULTS.inDomain + 
                  '&out_Domain=' + ENTSOE_DEFAULTS.outDoamin + 
                  '&periodStart=' + startDate + 
                  '&periodEnd=' + endDate;
  let headers = {
      "Content-Type": "text/xml",
      'User-Agent': '*'
  }
  return fetch(apiUrl, {
      method: 'GET',
      headers: headers})
      .then(function(response){
          if (response.status !== 200) {
            console.log(`ERROR: Got status code ${response.status} from entsoe`);
            //ToDo: Handle error codes ...
            return {};
          }
          else {
            return response.text();
          }
        })
      .then(function(xml) {
        //convert to workable json
        var json_result = xml_to_js.xml2json(xml, {compact: true, spaces: 2});
        const jsonObj = JSON.parse(json_result);
        if (validateResponse(jsonObj)) {
          const parsedObj = parseResponse(jsonObj);
          return (parsedObj);
        }})
      .catch((error) => {
        console.error('Error:', error);
    });
}

function validateResponse (jsonObj) {
  // ToDo: Some sanity checks
  // console.log(JSON.stringify(jsonObj, null, 2))
  
  //console.log(jsonObj.hasOwnProperty('TimeSeries'))
  return (true);
}

const parseResponse = (jsonObj) => {
  let rspObj = {};
  let dayObj = {};
  let hourIdx = 0;
  let startDate = "";
  let endDate = "";
  let resolution = "";
  let dayIdx = 0;
  if (jsonObj.Publication_MarketDocument.TimeSeries.length > 1) { //It's an array
    console.log("It's an array of objects!!!");
    Object.values(jsonObj.Publication_MarketDocument.TimeSeries).forEach(val => {
      startDate = val.Period.timeInterval.start._text;
      endDate = val.Period.timeInterval.end._text;
      resolution = val.Period.resolution._text;
      dayObj.date=startDate;
      dayObj.spotPrices = {};
      
      hourIdx = 0;
      val.Period.Point.forEach((hour) => {
        dayObj.spotPrices[hourIdx] = {eur: parseFloat(Object.values(hour)[1]._text, 10)};
        hourIdx++;
      });
      rspObj[dayIdx] = Object.assign({}, dayObj);
      dayIdx++;
    });
  } else { //It's a object
    console.log("It's a single object!!!");
    startDate = jsonObj.Publication_MarketDocument.TimeSeries.Period.timeInterval.start._text;
    endDate = jsonObj.Publication_MarketDocument.TimeSeries.Period.timeInterval.end._text;
    resolution = jsonObj.Publication_MarketDocument.TimeSeries.Period.resolution._text;
    dayObj.date=startDate;
    dayObj.spotPrices = {};
    jsonObj.Publication_MarketDocument.TimeSeries.Period.Point.forEach((hour) => {
      dayObj.spotPrices[hourIdx] = {eur: Object.values(hour)[1]._text};
      hourIdx++;
    });
    rspObj[dayIdx] = Object.assign({}, dayObj);
  }
  return (rspObj);
}

module.exports = { getEntsoeSpotPrices, getEntsoeSpotPricesMonth, getEntsoeSpotPricesToday };
