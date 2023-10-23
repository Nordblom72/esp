const { MongoClient } = require('mongodb')




let uri = 'mongodb+srv://testuser-1:testuser-1@solardb.5cufevf.mongodb.net/?retryWrites=true&w=majority';

const mongoClient = new MongoClient(uri);
const clientPromise = mongoClient.connect();

const dbHandler = async (opType, context) => {
    try {
        const database = (await clientPromise).db('solardb');
        const collection = database.collection('monthlyPrices');

        if (opType === 'update') {
          const rsp = await collection.updateOne(context.identifier, context.data);
          return(rsp.acknowledged);
        } else { //get}
          const results = await collection.findOne(context);
          return (results)
        }
    } catch (error) {
        console.log("Error fetching data from DB!");
        console.log(error.toString());
        return ({});
    }
}

module.exports = { dbHandler }
