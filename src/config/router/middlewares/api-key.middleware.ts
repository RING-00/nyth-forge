import { createServiceError, errorResponse } from '@base/service.base';
import type { ErrorCode } from '@types';
import { Elysia, type Context } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export interface ApiKeyOptions {
  exclude?: (path: string, method: string) => boolean;
  headerName?: string;
  onUnauthorized?: (request: { ip: string; path: string; method: string }) => void;
}

const DEFAULT_WHITELIST_PATHS = [
  '/',
  '/health',
  '/health/status',
  '/favicon.ico',
  '/robots.txt',
  '/waguri.gif',
  '/test-image',
];

const isDevelopment = process.env.NODE_ENV === 'development';

const getApiKeyFromEnv = (): string => {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.warn('API_KEY environment variable is not set. API key middleware will reject all requests.');
    return '';
  }

  return apiKey;
};

const isWhitelistedPath = (path: string, method: string): boolean => {
  const staticAssetExtensions = ['.gif', '.png', '.jpg', '.jpeg', '.svg', '.css', '.js', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const hasStaticExtension = staticAssetExtensions.some(ext => path.toLowerCase().endsWith(ext));
  
  return DEFAULT_WHITELIST_PATHS.includes(path) || 
         (path === '/' && method === 'GET') || 
         hasStaticExtension;
};

export const createApiKeyMiddleware = (options: ApiKeyOptions = {}) => {
  const fullOptions: Required<ApiKeyOptions> = {
    exclude: isWhitelistedPath,
    headerName: 'x-api-key',
    onUnauthorized: () => {},
    ...options,
  };

  const validApiKey = getApiKeyFromEnv();

  return new Elysia({ name: 'api-key-middleware' }).onBeforeHandle({ as: 'global' }, (context) => {
    try {
      const { request, headers } = context;
      const path = new URL(request.url).pathname;

      if (fullOptions.exclude(path, request.method)) {
        return;
      }

      if (!validApiKey) {
        return handleUnauthorizedAccess(context, fullOptions, 'API key not configured');
      }

      const providedApiKey = extractApiKey(headers, fullOptions.headerName);

      if (!providedApiKey) {
        return handleUnauthorizedAccess(context, fullOptions, 'API key missing');
      }

      if (providedApiKey !== validApiKey) {
        return handleUnauthorizedAccess(context, fullOptions, 'API key invalid');
      }
    } catch (error) {
      return handleInternalError(error, context.set);
    }
  });
};

export const apiKeyHandler = createApiKeyMiddleware({
  exclude: isWhitelistedPath,
  onUnauthorized: () => {},
});

export default apiKeyHandler;

const getClientIp = (headers: Record<string, string | undefined>): string => {
  return (
    headers['x-forwarded-for'] || headers['x-real-ip'] || headers['x-client-ip'] || headers['host'] || 'unknown-ip'
  );
};

const extractApiKey = (headers: Record<string, string | undefined>, headerName: string): string | undefined => {
  const authHeader = headers.authorization || headers[headerName.toLowerCase()];

  if (!authHeader) {
    return undefined;
  }

  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return bearerMatch ? bearerMatch[1] : authHeader;
};

const handleUnauthorizedAccess = (
  context: Context,
  options: Required<ApiKeyOptions>,
  reason: string,
): ReturnType<typeof errorResponse> => {
  const { request, set, headers } = context;
  const path = new URL(request.url).pathname;
  const ip = getClientIp(headers);

  try {
    options.onUnauthorized({ ip, path, method: request.method });
  } catch (callbackError) {
    console.warn('API key middleware onUnauthorized callback error:', callbackError);
  }

  set.status = StatusCodes.UNAUTHORIZED;

  const serviceError = createServiceError(
    'Invalid or missing API key',
    'UNAUTHORIZED' as ErrorCode,
    StatusCodes.UNAUTHORIZED,
    isDevelopment ? { reason, path, method: request.method } : undefined,
  );

  return errorResponse(
    serviceError.message,
    StatusCodes.UNAUTHORIZED,
    serviceError.code as ErrorCode,
    serviceError.details,
  );
};

const handleInternalError = (error: unknown, set: Context['set']) => {
  console.error('API key middleware encountered an unexpected error:', error);
  set.status = StatusCodes.INTERNAL_SERVER_ERROR;

  const serviceError = createServiceError(
    'Authentication service temporarily unavailable',
    'INTERNAL_SERVER_ERROR' as ErrorCode,
    StatusCodes.INTERNAL_SERVER_ERROR,
    isDevelopment ? { originalError: error instanceof Error ? error.message : String(error) } : undefined,
  );

  return errorResponse(
    serviceError.message,
    StatusCodes.INTERNAL_SERVER_ERROR,
    serviceError.code as ErrorCode,
    serviceError.details,
  );
};
