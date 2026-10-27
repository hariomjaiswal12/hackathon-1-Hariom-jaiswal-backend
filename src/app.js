const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const corsOptions = require('./config/cors');
const requestLogger = require('./middleware/requestLogger');
const apiLimiter = require('./middleware/rateLimiter');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const v1Routes = require('./routes');
const APP = require('./constants/app');
const openApiSpec = require('./docs/swagger');

const app = express();

app.disable('x-powered-by');
app.use(requestLogger);
app.use(cors(corsOptions));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

// API Documentation (OpenAPI / Swagger UI)
app.get(['/api/docs/spec.json', `${APP.API_PREFIX}/docs/spec.json`], (_req, res) => {
  res.json(openApiSpec);
});
app.use(['/api/docs', `${APP.API_PREFIX}/docs`], swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use('/api', apiLimiter);
app.use(APP.API_PREFIX, v1Routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
