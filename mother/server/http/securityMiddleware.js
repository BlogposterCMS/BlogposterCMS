'use strict';

const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const httpsRedirect = require('../../utils/httpsRedirect');

function mountSecurityMiddleware(app, { isProduction }) {
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()));
  } else {
    app.set('trust proxy', false);
  }

  app.use(helmet());

  if (isProduction) {
    app.use(httpsRedirect);
  }

  const bodyLimit = process.env.BODY_LIMIT || '20mb';
  app.use(bodyParser.json({ limit: bodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));
  app.use(cookieParser());
}

module.exports = {
  mountSecurityMiddleware
};
