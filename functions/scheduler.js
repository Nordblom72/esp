const helper = require('../src/helper');

const handler = async (event, context) => {
  console.log("ENTERING scheduled function: ", new Date());
  
  await helper.getLatestDailyElSpotPrices() 
  .then((response) => {
    console.log('DAILY EL-SPOT PRICE UPDATE:', response);
  });

  console.log("END of the scheduled function");
  return {
    statusCode: 200
  };
};

module.exports.handler = handler;