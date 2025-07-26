import { ApiErrorResponse, ErrorCode } from '@types';
import { StatusCodes } from 'http-status-codes';

export const MESSAGES = {
  ERROR: {
    CONFLICT: 'Resource already exists.',
    DATABASE: 'Database operation failed.',
    DEFAULT: 'An unexpected error occurred.',
    FORBIDDEN: 'Access denied.',
    INTERNAL: 'An internal server error occurred.',
    NOT_FOUND: 'Resource not found.',
    UNAUTHORIZED: 'Authentication required.',
    VALIDATION: 'Invalid input provided.',
  },
  SUCCESS: {
    CREATED: 'Resource created successfully.',
    DELETED: 'Resource deleted successfully.',
    OPERATION_COMPLETED: 'Operation completed successfully.',
    RETRIEVED: 'Resource retrieved successfully.',
    UPDATED: 'Resource updated successfully.',
  },
} as const;

export const STANDARD_ERRORS = {
  get FORBIDDEN(): ApiErrorResponse {
    return createStandardError('FORBIDDEN', MESSAGES.ERROR.FORBIDDEN, StatusCodes.FORBIDDEN);
  },
  get INTERNAL_SERVER_ERROR(): ApiErrorResponse {
    return createStandardError('INTERNAL_SERVER_ERROR', MESSAGES.ERROR.INTERNAL, StatusCodes.INTERNAL_SERVER_ERROR);
  },
  get NOT_FOUND(): ApiErrorResponse {
    return createStandardError('NOT_FOUND', MESSAGES.ERROR.NOT_FOUND, StatusCodes.NOT_FOUND);
  },
  get UNAUTHORIZED(): ApiErrorResponse {
    return createStandardError('UNAUTHORIZED', MESSAGES.ERROR.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
  },
  get VALIDATION_ERROR(): ApiErrorResponse {
    return createStandardError('VALIDATION_ERROR', MESSAGES.ERROR.VALIDATION, StatusCodes.BAD_REQUEST);
  },
} as const;

export const DEFAULT_ERROR_MESSAGE = MESSAGES.ERROR.DEFAULT;

export const INTERNAL_SERVER_ERROR = STANDARD_ERRORS.INTERNAL_SERVER_ERROR;

const getCurrentTimestamp = (): string => new Date().toISOString();

const createStandardError = (code: ErrorCode, message: string, status: StatusCodes): ApiErrorResponse => ({
  success: false,
  message,
  status,
  error: {
    code,
    timestamp: getCurrentTimestamp(),
  },
});
