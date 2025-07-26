import { connectToDatabase, disconnectFromDatabase, getDatabaseStatus } from './database/mongo.db';
import { apiKeyHandler, createApiKeyMiddleware } from './router/middlewares/api-key.middleware';
import { camelCaseHandler } from './router/middlewares/camel-case.middleware';
import { createRateLimiter, rateLimiterHandler } from './router/middlewares/rate-limiter.middleware';
import { snakeCaseHandler } from './router/middlewares/snake-case.middleware';
import healthCheckRoute from './router/routes/health-check.route';

export const config = {
  database: {
    connect: connectToDatabase,
    disconnect: disconnectFromDatabase,
    getStatus: getDatabaseStatus,
  },
  middlewares: {
    apiKeyHandler,
    snakeCaseHandler,
    camelCaseHandler,
    rateLimiterHandler,
  },
  routes: {
    healthCheck: healthCheckRoute,
  },
} as const;

export { connectToDatabase, disconnectFromDatabase, getDatabaseStatus };

export {
  apiKeyHandler,
  createApiKeyMiddleware,
  snakeCaseHandler,
  camelCaseHandler,
  rateLimiterHandler,
  createRateLimiter,
};

export { healthCheckRoute };
