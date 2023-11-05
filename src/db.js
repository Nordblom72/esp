const { MongoClient, ServerApiVersion  } = require('mongodb')

const MONGODB_DEFAULTS = {
  url: 'mongodb+srv://' + `${process.env.MONGODB_USER}` + ':' + `${process.env.MONGODB_PSWD}` + `${process.env.MONGODB_URI}`,
  database: `${process.env.MONGODB_DATABASE}`
}


const mongoClient = new MongoClient(MONGODB_DEFAULTS.url, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

//{ maxIdleTimeMS : 270000, minPoolSize : 2, maxPoolSize : 4 }

const dbHandler = async (opType, context) => {
  //console.log("inside dbHandler. opType: ", opType, JSON.stringify(context, null, 2) );
  console.log("inside dbHandler. opType: ", opType);
  let rsp;
  try {
    const clientPromise = await mongoClient.connect({ maxIdleTimeMS : 270000, minPoolSize : 2, maxPoolSize : 4 });
    // Send a ping to confirm a successful connection
    //await mongoClient.db("admin").command({ ping: 1 });
    //console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const database = clientPromise.db(MONGODB_DEFAULTS.database);
    //const collection = database.collection('elspot-prices');
    const collection = database.collection('monthlyPrices');
    
    if (opType === 'update') {
      rsp = await collection.updateOne(context.identifier, context.data);
      //return(rsp.acknowledged);
      rsp = rsp.acknowledged;
    } else if (opType === 'create') { 
      rsp = await collection.insertOne(context);
      //return(rsp.acknowledged);
    } else { //get
      rsp = await collection.findOne(context);
      //return (rsp);
    }
  } catch (error) {
    console.log("Error fetching data from DB!");
    console.log(error.toString());
    //return ({});
  } finally {
    // Ensures that the client will close when you finish/error
    await mongoClient.close();
    console.log("Successfully dis-connected from MongoDB!");
    return (rsp);
  } 
}

//const clientPromise = mongoClient.connect();
const dbHandler2 = async (opType, context) => {
  try {
      const database = (await clientPromise).db(MONGODB_DEFAULTS.database);
      //const collection = database.collection('elspot-prices');
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

//[[redirects]]
//  to="/.netlify/functions/api/:splat"
//  from="/*"
//  status=200