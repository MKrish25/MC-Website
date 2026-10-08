const app = require('./app');
const config = require('./config');
const host = process.env.HOST || '0.0.0.0';
app.listen(config.port, host, () => console.log(`MEDIA CLUB running on http://${host}:${config.port}  (admin: /admin)`));
