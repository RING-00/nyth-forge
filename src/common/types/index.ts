import { StatusCodes } from 'http-status-codes';

export const ErrorCodes = {
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  FORBIDDEN: 'FORBIDDEN',
  HEALTH_CHECK_ERROR: 'HEALTH_CHECK_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_OPERATION: 'INVALID_OPERATION',
  MIDDLEWARE_ERROR: 'MIDDLEWARE_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  MONGO_ERROR: 'MONGO_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  OPERATION_FAILED: 'OPERATION_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type OrderBy = 'asc' | 'desc';

export interface ApiResponse<T = unknown> {
  data: T;
  message: string;
  pagination?: PaginationResult;
  success: true;
  timestamp?: string;
}

export interface ApiErrorResponse {
  error?: {
    code: string;
    details?: unknown;
    timestamp: string;
  };
  errors?: ValidationError[];
  message: string;
  status: StatusCodes;
  success: false;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface PaginationInput {
  limit?: number;
  page?: number;
}

export interface PaginationResult {
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
  page: number;
  totalItems: number;
  totalPages: number;
}

export interface Sorter {
  order: OrderBy;
  sort: string;
}

export interface ServiceError extends Error {
  code: string;
  details?: unknown;
  field?: string;
  status?: StatusCodes;
}

export interface DataFilter<T> {
  fields?: (keyof T)[];
  query?: Record<string, unknown>;
  sorter?: Sorter;
}
