import { ApiErrorResponse, ApiResponse, ErrorCode, PaginationResult, ServiceError, ValidationError } from '@types';
import { StatusCodes } from 'http-status-codes';
import { Document, FilterQuery, Types } from 'mongoose';

interface DocumentWithId extends Document {
  _id: Types.ObjectId;
}

interface ServiceOperationContext {
  operationName?: string;
  resourceType?: string;
  resourceId?: string;
}

export const successResponse = <T>(
  data: T,
  message = 'Operation completed successfully',
  pagination?: PaginationResult,
): ApiResponse<T> => ({
  success: true,
  message,
  data,
  ...(pagination && { pagination }),
});

export const errorResponse = (
  message: string,
  status = StatusCodes.INTERNAL_SERVER_ERROR,
  code: ErrorCode = 'INTERNAL_SERVER_ERROR',
  details?: unknown,
  validationErrors?: ValidationError[],
): ApiErrorResponse => {
  return createErrorResponse(message, status, code, details, validationErrors);
};

export const notFoundResponse = (resource = 'Resource', id?: string): ApiErrorResponse => {
  const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found.`;
  return createErrorResponse(message, StatusCodes.NOT_FOUND, 'NOT_FOUND');
};

export const conflictResponse = (message = 'Resource already exists.', field?: string): ApiErrorResponse => {
  return createErrorResponse(
    message,
    StatusCodes.CONFLICT,
    'DUPLICATE_RESOURCE',
    field ? { conflictField: field } : undefined,
  );
};

export const validationErrorResponse = (
  errors: ValidationError[],
  message = 'Validation failed.',
): ApiErrorResponse => {
  return createErrorResponse(message, StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', undefined, errors);
};

export const internalServerErrorResponse = (
  message = 'An internal server error occurred.',
  details?: unknown,
): ApiErrorResponse => {
  return createErrorResponse(message, StatusCodes.INTERNAL_SERVER_ERROR, 'INTERNAL_SERVER_ERROR', details);
};

export const createServiceError = (
  message: string,
  code: ErrorCode = 'INTERNAL_SERVER_ERROR',
  status?: StatusCodes,
  details?: unknown,
): ServiceError => {
  const error = new Error(message) as ServiceError;
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
};

export const executeServiceOperation = async <T>(
  operation: () => Promise<T>,
  errorMessage: string,
  errorCode: ErrorCode = 'OPERATION_FAILED',
  context?: ServiceOperationContext,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      throw error;
    }

    throw createServiceError(errorMessage, errorCode, StatusCodes.INTERNAL_SERVER_ERROR, {
      context,
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
};

export const checkForDuplicateName = async <T extends DocumentWithId>(
  currentName: string,
  currentFilter: FilterQuery<T>,
  findByNameFn: (name: string) => Promise<T | null>,
  findOneFn: (filter: FilterQuery<T>) => Promise<T | null>,
  resourceType: string,
): Promise<void> => {
  const existingDoc = await findByNameFn(currentName);

  if (existingDoc) {
    const currentDoc = await findOneFn(currentFilter);

    if (!currentDoc || existingDoc._id.toString() !== currentDoc._id.toString()) {
      throw createServiceError(
        `${resourceType} with this name already exists.`,
        'DUPLICATE_RESOURCE',
        StatusCodes.CONFLICT,
        { name: currentName, existingId: existingDoc._id },
      );
    }
  }
};

const createErrorResponse = (
  message: string,
  status: StatusCodes,
  code: ErrorCode,
  details?: unknown,
  validationErrors?: ValidationError[],
): ApiErrorResponse => ({
  success: false,
  message,
  status,
  ...(validationErrors?.length && { errors: validationErrors }),
  error: {
    code,
    details,
    timestamp: getCurrentTimestamp(),
  },
});

const getCurrentTimestamp = (): string => new Date().toISOString();
