import { createServiceError } from '@base/service.base';
import { StatusCodes } from 'http-status-codes';
import { Document, isValidObjectId, Model, Schema, Types } from 'mongoose';

interface SchemaFieldDefinition {
  maxlength?: number;
  minlength?: number;
  ref?: string;
  required?: boolean;
  trim?: boolean;
  type: unknown;
  unique?: boolean;
}

interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

interface ValidationContext {
  isUpdate?: boolean;
  fieldName?: string;
}

const SKIP_FIELDS = [
  'createdAt',
  'updatedAt',
  '_id',
] as const;

export const validateObjectId = (id: string, fieldName = 'ID'): void => {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw createServiceError(
      `${fieldName} is required and cannot be empty.`,
      'INVALID_INPUT',
      StatusCodes.BAD_REQUEST,
      { field: fieldName },
    );
  }

  if (!isValidObjectId(id)) {
    throw createServiceError(`Invalid ${fieldName.toLowerCase()} format.`, 'INVALID_INPUT', StatusCodes.BAD_REQUEST, {
      providedId: id,
    });
  }
};

export const validateRequestBodyObject = (body: unknown): void => {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw createServiceError('Request body must be a non-array object.', 'INVALID_INPUT', StatusCodes.BAD_REQUEST, {
      providedType: typeof body,
    });
  }
};

export const validateCreateData = <T extends Document>(data: Partial<T>, model: Model<T>): void => {
  const schemaObj = getSchemaObject(model);
  const allErrors = Object.entries(schemaObj).flatMap(([fieldName, fieldDef]) => {
    if (shouldSkipField(fieldName)) {
      return [];
    }
    return validateField(fieldName, data[fieldName as keyof T], fieldDef, { isUpdate: false });
  });

  if (allErrors.length > 0) {
    throwValidationErrors(allErrors);
  }
};

export const validateUpdateData = <T extends Document>(data: Partial<T>, model: Model<T>): void => {
  const schemaObj = getSchemaObject(model);
  const allErrors = Object.entries(data).flatMap(([fieldName, fieldValue]) => {
    if (shouldSkipField(fieldName)) {
      return [];
    }

    if (!Object.prototype.hasOwnProperty.call(schemaObj, fieldName)) {
      return [];
    }

    const fieldDef = getFieldDefinition(schemaObj, fieldName);
    if (!fieldDef) {
      return [];
    }

    if (isEmptyValue(fieldValue) || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
      return [
        createValidationError(fieldName, `${fieldName} cannot be set to an empty value during an update.`, fieldValue),
      ];
    }

    return validateField(fieldName, fieldValue, fieldDef, { isUpdate: true });
  });

  if (allErrors.length > 0) {
    throwValidationErrors(allErrors);
  }
};

export const validateForeignKeyReference = async <T>(
  id: string,
  fieldName: string,
  entityName: string,
  findByIdFn: (id: string) => Promise<T | null>,
): Promise<void> => {
  validateObjectId(id, fieldName);

  const entity = await findByIdFn(id);
  if (!entity) {
    throw createServiceError(
      `Referenced ${entityName.toLowerCase()} does not exist.`,
      'NOT_FOUND',
      StatusCodes.NOT_FOUND,
      { fieldName, referencedId: id },
    );
  }
};

export const validateForeignKeyReferences = async <T extends Document>(
  data: Partial<T>,
  model: Model<T>,
  findByIdFunctions: Record<string, (id: string) => Promise<unknown>>,
): Promise<void> => {
  const foreignKeys = getForeignKeyReferences(model);
  const validationPromises = Object.entries(foreignKeys).map(([fieldName, refModel]) => {
    const fieldValue = data[fieldName as keyof T];
    const findByIdFn = findByIdFunctions[fieldName];

    if (!fieldValue || !findByIdFn) {
      return Promise.resolve();
    }

    return validateForeignKeyReference(String(fieldValue), fieldName, refModel, findByIdFn);
  });

  await Promise.all(validationPromises);
};

export const toObjectId = (id: string, fieldName = 'ID'): Types.ObjectId => {
  validateObjectId(id, fieldName);
  return new Types.ObjectId(id);
};

export const parsePaginationParams = (pageStr: string, limitStr: string): { page: number; limit: number } => ({
  page: validatePaginationParam(pageStr, 'Page'),
  limit: validatePaginationParam(limitStr, 'Limit'),
});

export const prepareObjectIdFields = <T extends Document>(data: Partial<T>, model: Model<T>): Partial<T> => {
  const schemaObj = getSchemaObject(model);

  return Object.entries(data).reduce((acc, [key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(schemaObj, key)) {
      acc[key as keyof T] = value as T[keyof T];
      return acc;
    }

    const fieldDef = getFieldDefinition(schemaObj, key);
    if (fieldDef?.type === Schema.Types.ObjectId && typeof value === 'string') {
      acc[key as keyof T] = toObjectId(value, key) as T[keyof T];
    } else {
      acc[key as keyof T] = value as T[keyof T];
    }

    return acc;
  }, {} as Partial<T>);
};

export const getForeignKeyReferences = <T extends Document>(model: Model<T>): Record<string, string> => {
  return Object.entries(getSchemaObject(model)).reduce(
    (acc, [fieldName, fieldDef]) => {
      if (fieldDef.type === Schema.Types.ObjectId && fieldDef.ref) {
        acc[fieldName] = fieldDef.ref;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
};

export const createDuplicateError = (
  resourceType: string,
  fieldName: string,
  fieldValue: unknown,
  existingId: unknown,
): never => {
  throw createServiceError(
    `${resourceType} with this ${fieldName} already exists.`,
    'DUPLICATE_RESOURCE',
    StatusCodes.CONFLICT,
    {
      existingId,
      [`${resourceType.toLowerCase()}_${fieldName}`]: fieldValue,
    },
  );
};

const validatePaginationParam = (value: string, paramName: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createServiceError(`${paramName} must be a positive integer.`, 'INVALID_INPUT', StatusCodes.BAD_REQUEST, {
      providedValue: value,
    });
  }
  return parsed;
};

const createValidationError = (field: string, message: string, value?: unknown): ValidationError => ({
  field,
  message,
  value,
});

const getSchemaObject = <T extends Document>(model: Model<T>): Record<string, SchemaFieldDefinition> =>
  model.schema.obj as Record<string, SchemaFieldDefinition>;

const getFieldDefinition = (
  schemaObj: Record<string, SchemaFieldDefinition>,
  fieldName: string,
): SchemaFieldDefinition | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(schemaObj, fieldName);
  return descriptor?.value;
};

const isEmptyValue = (value: unknown): boolean => value == null || value === '';

const shouldSkipField = (fieldName: string): boolean => SKIP_FIELDS.includes(fieldName as (typeof SKIP_FIELDS)[number]);

const throwValidationErrors = (errors: ValidationError[]): never => {
  const errorMessage = errors.map((e) => e.message).join(', ');
  throw createServiceError(`Validation failed: ${errorMessage}`, 'VALIDATION_ERROR', StatusCodes.BAD_REQUEST, {
    validationErrors: errors,
  });
};

const validateField = (
  fieldName: string,
  fieldValue: unknown,
  fieldDef: SchemaFieldDefinition,
  context: ValidationContext = {},
): ValidationError[] => {
  const { isUpdate = false } = context;

  if (isUpdate && fieldValue === undefined) {
    return [];
  }

  if (fieldDef.required && isEmptyValue(fieldValue)) {
    return [createValidationError(fieldName, `${fieldName} is required.`, fieldValue)];
  }

  if (isEmptyValue(fieldValue)) {
    return [];
  }

  if (fieldDef.type === Schema.Types.ObjectId) {
    return validateObjectIdField(fieldName, fieldValue);
  }

  if (fieldDef.type === String) {
    return validateStringField(fieldName, fieldValue, fieldDef);
  }

  return [];
};

const validateObjectIdField = (fieldName: string, fieldValue: unknown): ValidationError[] => {
  if (!Types.ObjectId.isValid(fieldValue as string)) {
    return [createValidationError(fieldName, `${fieldName} must be a valid ObjectId.`, fieldValue)];
  }
  return [];
};

const validateStringField = (
  fieldName: string,
  fieldValue: unknown,
  fieldDef: SchemaFieldDefinition,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (typeof fieldValue !== 'string') {
    return [createValidationError(fieldName, `${fieldName} must be a string.`, fieldValue)];
  }

  const trimmedValue = fieldDef.trim ? fieldValue.trim() : fieldValue;

  if (fieldDef.trim && trimmedValue.length === 0 && fieldValue.length > 0) {
    errors.push(createValidationError(fieldName, `${fieldName} cannot be only whitespace.`, fieldValue));
  }

  if (fieldDef.minlength && trimmedValue.length < fieldDef.minlength) {
    const plural = fieldDef.minlength > 1 ? 's' : '';
    errors.push(
      createValidationError(
        fieldName,
        `${fieldName} must be at least ${fieldDef.minlength} character${plural} long.`,
        fieldValue,
      ),
    );
  }

  if (fieldDef.maxlength && trimmedValue.length > fieldDef.maxlength) {
    errors.push(
      createValidationError(fieldName, `${fieldName} cannot exceed ${fieldDef.maxlength} characters.`, fieldValue),
    );
  }

  return errors;
};
