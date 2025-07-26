import { createServiceError } from '@base/service.base';
import type { ErrorCode } from '@types';
import { convertKeysToSnakeCase } from '@utils';
import { Elysia } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export const snakeCaseHandler = new Elysia({
  name: 'snake-case-handler',
}).onTransform({ as: 'global' }, (context) => {
  try {
    const { body, query, params } = context;

    if (shouldConvertRequestPart(body)) {
      context.body = convertKeysToSnakeCase(body);
    }
    if (shouldConvertRequestPart(query)) {
      context.query = convertKeysToSnakeCase(query);
    }
    if (shouldConvertRequestPart(params)) {
      context.params = convertKeysToSnakeCase(params);
    }
  } catch (error) {
    handleConversionError(error, context);
  }
});

const shouldConvertRequestPart = (data: unknown): boolean => {
  return !!(data && typeof data === 'object' && !Array.isArray(data) && !Buffer.isBuffer(data));
};

const handleConversionError = (
  error: unknown,
  context: { body?: unknown; query?: unknown; params?: unknown },
): never => {
  const serviceError = createServiceError(
    'Failed to process request data format',
    'MIDDLEWARE_ERROR' as ErrorCode,
    StatusCodes.BAD_REQUEST,
    {
      ...(process.env.NODE_ENV === 'development' && {
        hasBody: !!context.body,
        bodyType: typeof context.body,
        hasQuery: !!context.query,
        queryType: typeof context.query,
        hasParams: !!context.params,
        paramsType: typeof context.params,
      }),
      middleware: 'snake-case-handler',
      originalError: error instanceof Error ? error.message : String(error),
    },
  );

  console.error('Snake case middleware error:', serviceError.message, {
    code: serviceError.code,
    details: serviceError.details,
  });

  throw serviceError;
};

export default snakeCaseHandler;
