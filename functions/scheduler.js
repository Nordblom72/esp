const { dbHandler } = require('../src/db');
const helper = require('../src/helper');

const handler = async (event, context) => {
  console.log("Received event: ", new Date());
  
  await helper.getLatestDailyElSpotPrices() 
  .then((response) => {
    console.log('DAILY:', response);
  })

  console.log("END of the scheduled function");
  return {
    statusCode: 200
  }
};


async function testMongo () {
  console.log("In testMongo func");

  /*return dbHandler('', { year: 2023, monthName: "November" })
  .then(function(value) {
    console.log("WWWW", value);
    return(value);
  });*/

  return dbHandler('create', {test:'test'})
  .then( (acknowledged) => {
    if (!acknowledged) {
      console.log("Failed to create document in DB");
    }
    else {
      console.log("DDDDDDDD")
    }
    return;
  })
}

module.exports.handler = handler;