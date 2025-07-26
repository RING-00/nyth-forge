import { ApiErrorResponse, ApiResponse, ErrorCode, PaginationInput, ServiceError, ValidationError } from '@types';
import { Elysia } from 'elysia';
import { StatusCodes } from 'http-status-codes';
import { Document, FilterQuery } from 'mongoose';
import { createMongoProjection, FieldSelector, parseFieldSelection } from './field-selector.base';
import { buildMongoFilter, getMongoSort, parseSorter } from './filter.base';
import { MongoService } from './mongo-service.base';
import { createPaginationResult, validatePaginationInput } from './pagination.base';
import {
  createServiceError,
  errorResponse,
  internalServerErrorResponse,
  successResponse,
  validationErrorResponse,
} from './service.base';
import { parsePaginationParams, validateObjectId, validateRequestBodyObject } from './validation.base';

interface CrudControllerOptions<T extends Document> {
  allowedFilterFields: (keyof T)[];
  allowedSelectFields?: string[];
  entityName: string;
  messages?: {
    created?: string;
    updated?: string;
    deleted?: string;
    retrieved?: string;
    listed?: string;
  };
  routePrefix: string;
  service: MongoService<T> & { findById?: (id: string) => Promise<T | null> };
  fieldSelector?: FieldSelector<T>;
  additionalRoutes?: (
    controller: Elysia<string>,
    helpers: {
      handleRoute: typeof handleRoute;
      handlePaginatedRoute: typeof handlePaginatedRoute;
      buildMongoFilter: typeof buildMongoFilter;
      parseSorter: typeof parseSorter;
      getMongoSort: typeof getMongoSort;
      fieldSelector?: FieldSelector<T>;
    },
  ) => Elysia<string>;
}

interface ListRequestResult<T> {
  data: T[];
  total: number;
}

interface DeleteRequestResult {
  id: string;
  deleted: boolean;
}

interface MongoValidationError extends Error {
  errors: Record<string, { path: string; message: string; value: unknown }>;
}

const ERROR_STATUS_MAP: Record<ErrorCode, StatusCodes> = {
  CONNECTION_ERROR: StatusCodes.SERVICE_UNAVAILABLE,
  DATABASE_ERROR: StatusCodes.INTERNAL_SERVER_ERROR,
  DOCUMENT_NOT_FOUND: StatusCodes.NOT_FOUND,
  DUPLICATE_RESOURCE: StatusCodes.CONFLICT,
  FORBIDDEN: StatusCodes.FORBIDDEN,
  HEALTH_CHECK_ERROR: StatusCodes.INTERNAL_SERVER_ERROR,
  INTERNAL_SERVER_ERROR: StatusCodes.INTERNAL_SERVER_ERROR,
  INVALID_INPUT: StatusCodes.BAD_REQUEST,
  INVALID_OPERATION: StatusCodes.BAD_REQUEST,
  MIDDLEWARE_ERROR: StatusCodes.INTERNAL_SERVER_ERROR,
  MISSING_REQUIRED_FIELD: StatusCodes.BAD_REQUEST,
  MONGO_ERROR: StatusCodes.INTERNAL_SERVER_ERROR,
  NOT_FOUND: StatusCodes.NOT_FOUND,
  OPERATION_FAILED: StatusCodes.UNPROCESSABLE_ENTITY,
  SERVICE_UNAVAILABLE: StatusCodes.SERVICE_UNAVAILABLE,
  TOO_MANY_REQUESTS: StatusCodes.TOO_MANY_REQUESTS,
  UNAUTHORIZED: StatusCodes.UNAUTHORIZED,
  VALIDATION_ERROR: StatusCodes.BAD_REQUEST,
};

export const createCrudController = <T extends Document>(options: CrudControllerOptions<T>): Elysia<string> => {
  const {
    service,
    allowedFilterFields,
    allowedSelectFields = [],
    routePrefix,
    entityName,
    additionalRoutes,
    messages = {},
  } = options;

  const defaultMessages = createDefaultMessages(entityName, messages);

  let fieldSelector: FieldSelector<T>;
  let allowedFields: string[] = [];
  if ('schema' in service && service.schema) {
    fieldSelector = FieldSelector.fromSchema<T>(service.schema);
    allowedFields = fieldSelector.getAllowedFields();
  } else if (allowedSelectFields.length > 0) {
    fieldSelector = new FieldSelector<T>({ allowedFields: allowedSelectFields });
    allowedFields = allowedSelectFields;
  } else {
    fieldSelector = FieldSelector.autoDetect<T>();
    allowedFields = [];
  }

  const applyFieldSelection = (data: T | T[], selectedFields: string[]): T | T[] => {
    if (selectedFields.length === 0) {
      return data;
    }
    if (Array.isArray(data)) {
      return fieldSelector.selectFieldsFromArray(data, selectedFields).data as T[];
    }
    return fieldSelector.selectFields(data, selectedFields).data as T;
  };

  const handleListRequest = async (query: Record<string, string>): Promise<ListRequestResult<T>> => {
    const { sort, order, fields, ...filterParams } = query;
    const filter = buildMongoFilter(filterParams, allowedFilterFields);
    const mongoSort = getMongoSort(parseSorter({ sort, order }));
    const selectedFields = parseFieldSelection(fields, allowedFields, entityName);
    const projection = createMongoProjection(selectedFields);
    const { page, limit } = parsePaginationParams(query.page || '1', query.limit || '10');

    const result = await service.findWithPagination(filter, page, limit, mongoSort, projection);
    const data = applyFieldSelection(result.data, selectedFields) as T[];

    return { data, total: result.total };
  };

  const handleGetByIdRequest = async (id: string, query: Record<string, string>): Promise<T> => {
    validateObjectId(id, entityName);
    const selectedFields = parseFieldSelection(query.fields, allowedFields, entityName);
    const projection = createMongoProjection(selectedFields);

    const document = service.findById
      ? await service.findById(id)
      : await service.findOne({ _id: id } as FilterQuery<T>, projection);

    const foundDocument = ensureEntityExists(document, entityName, id);
    return applyFieldSelection(foundDocument, selectedFields) as T;
  };

  const handleCreateRequest = (body: unknown): Promise<T> => {
    validateRequestBodyObject(body);
    return service.create(body as Partial<T>);
  };

  const handleUpdateRequest = async (id: string, body: unknown): Promise<T> => {
    validateObjectId(id, entityName);
    validateRequestBodyObject(body);

    const document = await service.update({ _id: id } as FilterQuery<T>, body as Partial<T>);
    return ensureEntityExists(document, entityName, id);
  };

  const handleDeleteRequest = async (id: string): Promise<DeleteRequestResult> => {
    validateObjectId(id, entityName);
    const document = await service.delete({ _id: id } as FilterQuery<T>);
    ensureEntityExists(document, entityName, id);
    return { id, deleted: true };
  };

  const controller = new Elysia({ prefix: routePrefix })
    .get('/', ({ query }) => {
      const paginationInput = { page: Number(query.page || '1'), limit: Number(query.limit || '10') };
      return handlePaginatedRoute(
        () => handleListRequest(query as Record<string, string>),
        paginationInput,
        defaultMessages.listed,
      );
    })
    .get('/:id', ({ params, query }) =>
      handleRoute(() => handleGetByIdRequest(params.id, query as Record<string, string>), defaultMessages.retrieved),
    )
    .post('/', ({ body }) => handleRoute(() => handleCreateRequest(body), defaultMessages.created))
    .put('/:id', ({ params, body }) => handleRoute(() => handleUpdateRequest(params.id, body), defaultMessages.updated))
    .delete('/:id', ({ params }) => handleRoute(() => handleDeleteRequest(params.id), defaultMessages.deleted));

  return additionalRoutes
    ? additionalRoutes(controller, {
        handleRoute,
        handlePaginatedRoute,
        buildMongoFilter,
        parseSorter,
        getMongoSort,
        fieldSelector,
      })
    : controller;
};

const isServiceError = (error: unknown): error is ServiceError => {
  return error instanceof Error && 'code' in error && typeof (error as ServiceError).code === 'string';
};

const createDefaultMessages = (entityName: string, customMessages: Record<string, string> = {}) => ({
  created: `${entityName} created successfully.`,
  deleted: `${entityName} deleted successfully.`,
  listed: `${entityName} list retrieved successfully.`,
  retrieved: `${entityName} retrieved successfully.`,
  updated: `${entityName} updated successfully.`,
  ...customMessages,
});

const ensureEntityExists = <T>(document: T | null, entityName: string, id: string): T => {
  if (!document) {
    throw createServiceError(`${entityName} with ID '${id}' not found.`, 'NOT_FOUND', StatusCodes.NOT_FOUND);
  }
  return document;
};

export const handleServiceError = (error: unknown, context: string): ApiErrorResponse => {
  if (isServiceError(error)) {
    const status = error.status ?? ERROR_STATUS_MAP[error.code as ErrorCode] ?? StatusCodes.INTERNAL_SERVER_ERROR;
    return errorResponse(error.message, status, error.code as ErrorCode, error.details);
  }

  if (error instanceof Error && error.name === 'ValidationError') {
    const mongoError = error as MongoValidationError;
    const validationErrors: ValidationError[] = Object.values(mongoError.errors).map(({ path, message, value }) => ({
      field: path,
      message,
      value,
    }));
    return validationErrorResponse(validationErrors, 'Validation failed.');
  }

  console.error(`Unexpected error in ${context}:`, error);
  const errorDetails = process.env.NODE_ENV === 'development' ? { details: String(error) } : undefined;
  return internalServerErrorResponse('An unexpected error occurred.', errorDetails);
};

export const handleRoute = async <T>(
  fn: () => Promise<T>,
  successMessage?: string,
): Promise<ApiResponse<T> | ApiErrorResponse> => {
  try {
    const data = await fn();
    return successResponse(data, successMessage);
  } catch (error) {
    return handleServiceError(error, 'handleRoute');
  }
};

export const handlePaginatedRoute = async <T>(
  fn: () => Promise<ListRequestResult<T>>,
  paginationInput: PaginationInput,
  successMessage?: string,
): Promise<ApiResponse<T[]> | ApiErrorResponse> => {
  try {
    const validation = validatePaginationInput(paginationInput);
    if (!validation.isValid) {
      return validationErrorResponse(
        validation.errors.map((message) => ({ field: 'pagination', message })),
        'Invalid pagination parameters.',
      );
    }

    const { data, total } = await fn();
    const pagination = createPaginationResult(paginationInput, total);
    return successResponse(data, successMessage, pagination);
  } catch (error) {
    return handleServiceError(error, 'handlePaginatedRoute');
  }
};

export { isServiceError, ERROR_STATUS_MAP, ensureEntityExists };
