import { createServiceError, errorResponse, successResponse } from '@base/service.base';
import { redisService } from '@config';
import type { ErrorCode } from '@types';
import { Elysia, type Context } from 'elysia';
import { StatusCodes } from 'http-status-codes';
import { getDatabaseStatus } from '../../database/mongo.db';

const healthCheckRoute = new Elysia({
  prefix: '/health',
  tags: ['Health'],
})

  .get('/', ({ set }) => {
    try {
      const dbStatus = getDatabaseStatus();
      const redisStatus = redisService.getConnectionStatus();

      const isHealthy = dbStatus.isConnected && redisStatus;

      if (!isHealthy) {
        set.status = StatusCodes.SERVICE_UNAVAILABLE;
        return errorResponse(
          'Service is not healthy due to service dependencies failure.',
          StatusCodes.SERVICE_UNAVAILABLE,
          'SERVICE_UNAVAILABLE' as ErrorCode,
          createUnhealthyData(dbStatus, redisStatus),
        );
      }

      return successResponse(createHealthData(dbStatus, redisStatus), 'System health check successful.');
    } catch (error) {
      return handleHealthCheckError(error, set, '/health');
    }
  })

  .get('/status', ({ set }) => {
    try {
      const dbStatus = getDatabaseStatus();
      const redisStatus = redisService.getConnectionStatus();

      return successResponse(
        {
          status: dbStatus.isConnected && redisStatus ? 'ok' : 'error',
          database: dbStatus.status,
          redis: redisStatus ? 'connected' : 'disconnected',
          timestamp: new Date().toISOString(),
        },
        'Quick status check completed.',
      );
    } catch (error) {
      return handleHealthCheckError(error, set, '/health/status');
    }
  });

export default healthCheckRoute;

const createHealthData = (dbStatus: ReturnType<typeof getDatabaseStatus>, redisStatus: boolean) => ({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  version: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  services: {
    api: { status: 'operational', version: 'v1' },
    database: {
      status: dbStatus.status,
      isConnected: dbStatus.isConnected,
      readyState: dbStatus.readyState,
      databaseName: dbStatus.databaseName,
    },
    redis: {
      status: redisStatus ? 'operational' : 'error',
      isConnected: redisStatus,
    },
  },
});

const createUnhealthyData = (dbStatus: ReturnType<typeof getDatabaseStatus>, redisStatus: boolean) => ({
  timestamp: new Date().toISOString(),
  services: {
    database: {
      status: dbStatus.status,
      isConnected: dbStatus.isConnected,
      readyState: dbStatus.readyState,
    },
    redis: {
      status: redisStatus ? 'operational' : 'error',
      isConnected: redisStatus,
    },
  },
});

const handleHealthCheckError = (error: unknown, set: Context['set'], endpoint: string) => {
  set.status = StatusCodes.INTERNAL_SERVER_ERROR;

  const errorDetails = {
    endpoint,
    originalError: error instanceof Error ? error.message : String(error),
    ...(process.env.NODE_ENV === 'development' && {
      stack: error instanceof Error ? error.stack : undefined,
    }),
  };

  const serviceError = createServiceError(
    `Health check operation failed at endpoint: ${endpoint}`,
    'HEALTH_CHECK_ERROR' as ErrorCode,
    StatusCodes.INTERNAL_SERVER_ERROR,
    errorDetails,
  );

  console.error(`Health check failed at ${endpoint}:`, {
    message: serviceError.message,
    details: serviceError.details,
  });

  const responseDetails = process.env.NODE_ENV === 'development' ? serviceError.details : undefined;

  return errorResponse(
    serviceError.message,
    StatusCodes.INTERNAL_SERVER_ERROR,
    serviceError.code as ErrorCode,
    responseDetails,
  );
};
