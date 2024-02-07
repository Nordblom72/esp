const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ObjectId } = require('mongodb');

const { dbHandler } = require('../src/db');
const helper = require('../src/helper');

const app = express();
const router = express.Router();

app.use(bodyParser.json());
app.use(cors());

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// A bunch of test API's for poking the server, mongoDB, etc.
// These are disabled in production env.
// To be removed when no longer needed.
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// Test API for the server
router.get('/', (req, res) => {
  res.status(200).json(`I'm here... stop poking me`);
});




//app.use('/.netlify/functions/api', router);
app.use('/', router);

module.exports.handler = serverless(app);
