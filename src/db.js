const { MongoClient } = require('mongodb')

const MONGODB_DEFAULTS = {
  url: 'mongodb+srv://' + `${process.env.MONGODB_USER}` + ':' + `${process.env.MONGODB_PSWD}` + `${process.env.MONGODB_URI}`,
  database: `${process.env.MONGODB_DATABASE}`
}

const mongoClient = new MongoClient(MONGODB_DEFAULTS.url);
const clientPromise = mongoClient.connect();

const dbHandler = async (opType, context) => {
    try {
        const database = (await clientPromise).db(MONGODB_DEFAULTS.database);
        const collection = database.collection('monthlyPrices');

        if (opType === 'update') {
          const rsp = await collection.updateOne(context.identifier, context.data);
          return(rsp.acknowledged);
        } else if (opType === 'create') { 
          const rsp = await collection.insertOne(context);
          return(rsp.acknowledged);
        } else { //get}
          const results = await collection.findOne(context);
          return (results);
        }
    } catch (error) {
        console.log("Error fetching data from DB!");
        console.log(error.toString());
        return ({});
    }
}

module.exports = { dbHandler }
