const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const apiRouter = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// За обратным прокси (nginx, Render) IP клиента берется из X-Forwarded-For – нужно для rate limit
app.set('trust proxy', 1);

// Безопасность: заголовки HTTP (helmet), CORS только для адресов клиента
app.use(helmet());
app.use(cors({ origin: config.clientUrl, exposedHeaders: ['Location', 'RateLimit'] }));
app.use(express.json({ limit: '100kb' }));
if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Документация API (OpenAPI 3) – http://localhost:3000/api/docs
const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));
app.get('/api/openapi.json', (req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'EventHub API' }));

app.use('/api/v1', apiRouter);
// healthcheck контейнера Docker
app.get('/health', require('./controllers/health.controller'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
