// Vercel entrypoint. vercel.json rewrites every path here, and Express does the
// routing from that point on, so the whole app is one serverless function.
require('dotenv').config();

module.exports = require('../src/app');
