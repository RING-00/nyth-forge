import { createServiceError, errorResponse } from '@base/service.base';
import type { ErrorCode } from '@types';
import { convertKeysToCamelCase } from '@utils';
import { Elysia } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export const camelCaseHandler = new Elysia({
  name: 'camel-case-handler',
}).onAfterHandle({ as: 'global' }, ({ response, set }) => {
  if (!shouldConvertResponse(response)) {
    return response;
  }

  try {
    return convertKeysToCamelCase(response);
  } catch (error) {
    set.status = StatusCodes.INTERNAL_SERVER_ERROR;
    return handleConversionError(error, response);
  }
});

const shouldConvertResponse = (response: unknown): boolean => {
  return !!(response && typeof response === 'object' && !Buffer.isBuffer(response));
};

const handleConversionError = (error: unknown, response: unknown) => {
  const serviceError = createServiceError(
    'Failed to process response data format',
    'MIDDLEWARE_ERROR' as ErrorCode,
    StatusCodes.INTERNAL_SERVER_ERROR,
    {
      ...(process.env.NODE_ENV === 'development' && {
        hasResponse: !!response,
        responseType: typeof response,
      }),
      middleware: 'camel-case-handler',
      originalError: error instanceof Error ? error.message : String(error),
    },
  );

  console.error('Camel case middleware error:', serviceError.message, {
    code: serviceError.code,
    details: serviceError.details,
  });

  const errorDetails = process.env.NODE_ENV === 'development' ? serviceError.details : undefined;

  return errorResponse(
    serviceError.message,
    StatusCodes.INTERNAL_SERVER_ERROR,
    serviceError.code as ErrorCode,
    errorDetails,
  );
};

export default camelCaseHandler;
