const { MongoClient } = require('mongodb')



let dbConnection;
let uri = 'mongodb+srv://testuser-1:testuser-1@solardb.5cufevf.mongodb.net/?retryWrites=true&w=majority';
//let uri = '';

module.exports = {
  connectToDb: (cb) => {
    MongoClient.connect(uri)
      .then((client) => {
        dbConnection = client.db()
        return cb()
      })
      .catch(err => {
        console.log(err)
        return cb(err)
      })
  },
  getDb: () => dbConnection
}
