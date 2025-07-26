import { createServiceError, errorResponse } from '@base/service.base';
import type { ErrorCode } from '@types';
import { Elysia, type Context } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export interface RateLimitExceededRequest {
  request: Request;
  ip: string;
  path: string;
  method: string;
  headers: Record<string, string | undefined>;
}

export interface RateLimiterOptions {
  exclude?: (path: string, method: string) => boolean;
  headers?: boolean;
  keyGenerator?: (request: { ip: string; headers: Record<string, string | undefined> }) => string;
  max?: number;
  message?: string;
  onLimitReached?: (request: RateLimitExceededRequest, key: string) => void;
  windowMs?: number;
}

interface RateLimitEntry {
  requests: number[];
  resetTime: number;
}

class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private windowMs: number) {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );
  }

  public get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (entry.resetTime < now) {
      this.store.delete(key);
      return undefined;
    }

    entry.requests = entry.requests.filter((time) => time > now - this.windowMs);
    return entry;
  }

  public set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }
}

export const createRateLimiter = (options: RateLimiterOptions = {}) => {
  const fullOptions: Required<RateLimiterOptions> = {
    max: 100,
    windowMs: 15 * 60 * 1000,
    message: 'Too many requests, please try again later.',
    exclude: () => false,
    keyGenerator: (req) => req.ip,
    headers: true,
    onLimitReached: () => {},
    ...options,
  };

  const store = new RateLimitStore(fullOptions.windowMs);

  return new Elysia({ name: 'rate-limiter' }).onBeforeHandle({ as: 'global' }, (context) => {
    try {
      const { request, set, headers } = context;
      const path = new URL(request.url).pathname;

      if (fullOptions.exclude(path, request.method)) {
        return;
      }

      const now = Date.now();
      const ip = getClientIp(headers);
      const key = fullOptions.keyGenerator({ ip, headers });

      const entry = store.get(key) ?? { requests: [], resetTime: now + fullOptions.windowMs };
      entry.requests.push(now);

      if (entry.requests.length > fullOptions.max) {
        return handleLimitExceeded(context, entry, fullOptions, key);
      }

      store.set(key, entry);

      if (fullOptions.headers) {
        setRateLimitHeaders(set, entry, fullOptions.max, false);
      }
    } catch (error) {
      return handleInternalError(error, context.set);
    }
  });
};

export const rateLimiterHandler = createRateLimiter({
  max: 100,
  windowMs: 15 * 60 * 1000,
  exclude: (path, method) => {
    const excludedPaths = [
      '/health',
      '/favicon.ico',
      '/robots.txt',
    ];
    return excludedPaths.includes(path) || (path === '/' && method === 'GET');
  },
  onLimitReached: (req, key) => {
    console.warn(
      `Rate limit exceeded - Path: ${req.path}, Method: ${req.method}, Key: ${
        process.env.NODE_ENV === 'development' ? key : '[hidden]'
      }`,
    );
  },
});

export default rateLimiterHandler;

const getClientIp = (headers: Record<string, string | undefined>): string => {
  return (
    headers['x-forwarded-for'] || headers['x-real-ip'] || headers['x-client-ip'] || headers['host'] || 'unknown-ip'
  );
};

const setRateLimitHeaders = (set: Context['set'], entry: RateLimitEntry, max: number, isExceeded: boolean): void => {
  set.headers['X-RateLimit-Limit'] = max.toString();
  set.headers['X-RateLimit-Reset'] = Math.ceil(entry.resetTime / 1000).toString();

  if (isExceeded) {
    set.headers['X-RateLimit-Remaining'] = '0';
    set.headers['Retry-After'] = Math.ceil((entry.resetTime - Date.now()) / 1000).toString();
  } else {
    set.headers['X-RateLimit-Remaining'] = Math.max(0, max - entry.requests.length).toString();
  }
};

const handleLimitExceeded = (
  { request, set, headers }: Context,
  entry: RateLimitEntry,
  options: Required<RateLimiterOptions>,
  key: string,
) => {
  const { onLimitReached, message, max, windowMs } = options;
  const path = new URL(request.url).pathname;
  const ip = getClientIp(headers);

  try {
    onLimitReached({ request, ip, path, method: request.method, headers }, key);
  } catch (callbackError) {
    console.warn('Rate limiter onLimitReached callback threw an error:', callbackError);
  }

  if (options.headers) {
    setRateLimitHeaders(set, entry, max, true);
  }

  set.status = StatusCodes.TOO_MANY_REQUESTS;

  const errorDetails =
    process.env.NODE_ENV === 'development' ? { key, limit: max, windowMs } : { limit: max, windowMs };

  const serviceError = createServiceError(
    message,
    'TOO_MANY_REQUESTS' as ErrorCode,
    StatusCodes.TOO_MANY_REQUESTS,
    errorDetails,
  );

  return errorResponse(
    serviceError.message,
    StatusCodes.TOO_MANY_REQUESTS,
    serviceError.code as ErrorCode,
    process.env.NODE_ENV === 'development' ? serviceError.details : undefined,
  );
};

const handleInternalError = (error: unknown, set: Context['set']) => {
  console.error('Rate limiter middleware encountered an unexpected error:', error);
  set.status = StatusCodes.INTERNAL_SERVER_ERROR;

  const serviceError = createServiceError(
    'Rate limiter internal error',
    'MIDDLEWARE_ERROR' as ErrorCode,
    StatusCodes.INTERNAL_SERVER_ERROR,
    { originalError: error instanceof Error ? error.message : String(error) },
  );

  return errorResponse(serviceError.message, StatusCodes.INTERNAL_SERVER_ERROR, serviceError.code as ErrorCode);
};
