const xml_to_js = require('xml-js');//npm i xml-js
//const helper = require('../src/helper');

const ENTSOE_DEFAULTS = {
  url: 'https://web-api.tp.entsoe.eu/api',
  securitycToken: `${process.env.ENTSOE_API_KEY}`,
  docType: 'A44',
  inDomain: '10Y1001A1001A47J',
  outDoamin: '10Y1001A1001A47J'
}

const convertDateToUTC = (date) => { 
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

// ToDo: move monthsAsTextList & formatDate to helper module
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
  const utcTodayDate = convertDateToUTC(new Date());
  return getEntsoeSpotPricesDay(utcTodayDate);
}

const getEntsoeSpotPricesDay = (utcDateObj) => {
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12
  const day = utcDateObj.getUTCDate();
  const year = utcDateObj.getUTCFullYear();
  const monthNr = utcDateObj.getUTCMonth();

  let periodStartDate = new Date(`${monthsAsTextList[monthNr]}, ${day}, ${year}`);
  let periodEndDate   = new Date(`${monthsAsTextList[monthNr]}, ${day}, ${year}`);
  periodStartDate.setHours(0, 0, 0)
  periodEndDate.setHours(23, 0, 0);

  //periodStartDate = periodStartDate.toLocaleString("se-SE", {timeZone: "Europe/Stockholm"});
  //periodEndDate   = periodEndDate.toLocaleString("se-SE", {timeZone: "Europe/Stockholm"});

  console.log("*DAY-START: ", periodStartDate);
  console.log("*DAY-END:   ", periodEndDate);
  console.log( `${monthsAsTextList[monthNr]}, ${day}, ${year}`);

  return getEntsoeSpotPrices(formatDate(periodStartDate), formatDate(periodEndDate, monthNr))
  .then(function(rspObj) {
    if (Object.keys(rspObj).length === 2) {
      delete rspObj['1']; // Don't care about tomorrow data
      console.log('getEntsoeSpotPricesDay(): deleted tomorrow')
    }
    console.log("Returning from entsoe.getEntsoeSpotPricesDay() ")
    return (rspObj);
  })
  .catch((error) => {
    console.log('Error:', error);
  });
}

const convertFromUtcToLocalDate = (utcDateObj) => {
  const offset = utcDateObj.getTimezoneOffset();
  return new Date(utcDateObj.getTime() - offset * 60000);
}

const getEntsoeSpotPricesMonth = (year, monthNr) => { // monthNr: 0-11
  // entsoe month numbering is 0-11
  // Date() month numbering is 1-12
  const todayUtcDate = convertDateToUTC(new Date());
  const currentYear = todayUtcDate.getUTCFullYear();
  const numDaysInMonth = new Date(year, monthNr + 1, 0).getDate(); // Don't use UtcDate here
  console.log('numDaysInMonth', numDaysInMonth)

  // Define period START DATE
  let periodStartDate = new Date(monthsAsTextList[monthNr] + ', 1, ' + year); // month, day, year
  periodStartDate.setHours(0, 0, 0)

  // Define period END DATE
  let periodEndDate;
  if ( (year < currentYear) || (year === currentYear && monthNr < todayUtcDate.getUTCMonth()) ) {
    periodEndDate = new Date(`${monthsAsTextList[monthNr]}, ${numDaysInMonth}, ${year}`);
    console.log("...It is in the past...");
  } else if (year === currentYear && monthNr === todayUtcDate.getUTCMonth()) {
    periodEndDate = new Date(`${monthsAsTextList[monthNr]}, ${todayUtcDate.getUTCDate()+1}, ${year}`); //todo: +1 ???
    console.log(`It is present date: requested month = ${monthNr},  todayMonth = ${todayUtcDate.getUTCMonth()}` )
  } else {
    // ToDo: reject request... raise error ...
    console.log("...it's a future date...");
  }
  periodEndDate.setHours(23, 0, 0);

  console.log("MONTH-START: ", periodStartDate);
  console.log("MONTH-END:   ", periodEndDate);
  console.log( `${monthsAsTextList[monthNr]}, ${numDaysInMonth}, ${year}`);
  return getEntsoeSpotPrices(formatDate(periodStartDate), formatDate(periodEndDate), monthNr)
  .then(function(rspObj) {
    return rspObj})
  .catch((error) => {
    console.log('Error:', error);
  });
}

const getEntsoeSpotPrices = (startDate, endDate, monthNr) => {
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
  console.log("ENTSOE URI: ", apiUrl)
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
        //console.log("Parsing xml to JSON")
        var json_result = xml_to_js.xml2json(xml, {compact: true, spaces: 2});
        const jsonObj = JSON.parse(json_result);
        //console.log("parsed from xml to json: ", jsonObj)
        if (validateResponse(jsonObj)) {
          const parsedObj = parseResponse(jsonObj, monthNr);
          return (parsedObj);
        }})
      .catch((error) => {
        console.log('Error:', error);
    });
}

function validateResponse (jsonObj) {
  // ToDo: Some sanity checks
  // console.log(JSON.stringify(jsonObj, null, 2))
  
  //console.log(jsonObj.hasOwnProperty('TimeSeries'))
  return (true);
}

const parseResponse = (jsonObj, monthNr) => {
  // Assumption: The request is for timeseries within same month.
  // Thus, we only handle timeseries within the same month.
  // Requests towards entsoe some hours after noon will also include day-ahead timeseries.
  // We don't want day-ahead prices so we strip those.
  let rspObj = [];
  let dayObj = {};
  let date;
  let finished = false;
  if (!monthNr) {
    monthNr = new Date().getUTCMonth();
  }

  if (jsonObj.Publication_MarketDocument.TimeSeries.length > 1) { //It's an array
    console.log("It's an array of objects!!!");
    Object.values(jsonObj.Publication_MarketDocument.TimeSeries).forEach(val => {
      date = getDateFromTimeInerval(val.Period.timeInterval.start._text, val.Period.timeInterval.end._text, monthNr);
      if (!date) {
        finished = true;
      }
      
      if (!finished) {
        dayObj.date=date;
        dayObj.spotPrices = [];
        val.Period.Point.forEach((hour) => {
          dayObj.spotPrices.push({eur: parseFloat(Object.values(hour)[1]._text)}); // Array
        });
      
        if ((new Date(dayObj.date).getUTCDate() <= new Date().getUTCDate()) || (new Date(dayObj.date).getUTCMonth() < new Date().getUTCMonth())) {
          rspObj.push( Object.assign({}, dayObj));
        } else {
          console.log("it is tomorrow");
        }
      }
    });
  } else { //It's an object. Only one instance of timeSeries
    console.log("It's a single object!!!");
    startDate = jsonObj.Publication_MarketDocument.TimeSeries.Period.timeInterval.start._text;
    date = getDateFromTimeInerval(jsonObj.Publication_MarketDocument.TimeSeries.Period.timeInterval.start._text, 
                                  jsonObj.Publication_MarketDocument.TimeSeries.Period.timeInterval.end._text,
                                  monthNr);
    if (date) {
      dayObj.date=date;
      dayObj.spotPrices = [];
      jsonObj.Publication_MarketDocument.TimeSeries.Period.Point.forEach((hour) => {
        dayObj.spotPrices.push({eur: parseFloat(Object.values(hour)[1]._text)}); // Array
      });
      if (new Date(dayObj.date).getUTCDate() <= new Date().getUTCDate()) {
        rspObj.push(Object.assign({}, dayObj));
      }
    }
  }
  return (rspObj);
}

const getDateFromTimeInerval = (startDate, endDate, monthNr, date) =>{
  startDateObj = new Date(startDate);
  endDateObj = new Date(endDate); 
  if ((startDateObj.getUTCMonth() < monthNr) && (endDateObj.getUTCMonth() === monthNr)) {
    //console.log("First day of month");
    return(endDate.split("T")[0]);
  }  else if  ((startDateObj.getUTCMonth() === monthNr) && (endDateObj.getUTCMonth() > monthNr)) {
    //console.log("First day of next month");
    return(null);
  } else {
    // Start & End date have same month nr
    return(endDate.split("T")[0]);
  }
}


module.exports = { getEntsoeSpotPrices, getEntsoeSpotPricesMonth, getEntsoeSpotPricesToday, getEntsoeSpotPricesDay };
