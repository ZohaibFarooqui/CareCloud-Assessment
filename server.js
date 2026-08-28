// Local development entrypoint. Vercel uses api/index.js instead.
require('dotenv').config();

const app = require('./src/app');

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('carecloud-patient-intake listening on http://localhost:' + port);
  console.log('  dashboard -> http://localhost:' + port + '/dashboard');
});
