import { Types } from 'mongoose';

type CaseConverter = (str: string) => string;

interface ConversionContext {
  visited: WeakSet<object>;
}

const CIRCULAR_REFERENCE_MARKER = '[Circular]';
const CAMEL_CASE_REGEX = /_([a-z])/g;
const SNAKE_CASE_REGEX = /([A-Z])/g;

export const toCamelCase = (str: string): string => {
  return str.replace(CAMEL_CASE_REGEX, (_, letter) => letter.toUpperCase());
};

export const toSnakeCase = (str: string): string => {
  return str.replace(SNAKE_CASE_REGEX, '_$1').toLowerCase();
};

export const convertKeysToCamelCase = <T>(obj: T): T => {
  return convertObjectKeys(obj, toCamelCase);
};

export const convertKeysToSnakeCase = <T>(obj: T): T => {
  return convertObjectKeys(obj, toSnakeCase);
};

export const convertObjectKeys = <T>(
  obj: T,
  converter: CaseConverter,
  context: ConversionContext = { visited: new WeakSet<object>() },
): T => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (isObjectId(obj)) {
    return obj.toString() as T;
  }

  if (context.visited.has(obj as object)) {
    return CIRCULAR_REFERENCE_MARKER as T;
  }

  if (Array.isArray(obj) || isPlainObject(obj)) {
    context.visited.add(obj as object);

    try {
      if (Array.isArray(obj)) {
        return obj.map((item) => convertObjectKeys(item, converter, context)) as T;
      }

      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          converter(key),
          convertObjectKeys(value, converter, context),
        ]),
      ) as T;
    } finally {
      context.visited.delete(obj as object);
    }
  }

  return obj;
};

const isObjectId = (value: unknown): value is Types.ObjectId => {
  return value instanceof Types.ObjectId;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
