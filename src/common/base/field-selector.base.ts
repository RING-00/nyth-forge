import { StatusCodes } from 'http-status-codes';
import { Document, Schema } from 'mongoose';
import { createServiceError } from './service.base';

export interface FieldSelectorOptions {
  allowedFields?: string[];
  nestedFieldSeparator?: string;
  maxDepth?: number;
}

export interface FieldSelectionResult<T> {
  data: T | Partial<T>;
  selectedFields: string[];
}

interface DocumentWithToObject {
  toObject(): Record<string, unknown>;
}

const DEFAULT_SEPARATOR = '.';
const DEFAULT_MAX_DEPTH = 10;
const MAX_KEY_LENGTH = 100;
const MAX_NUMERIC_KEY = 4294967295;

const DANGEROUS_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__noSuchMethod__',
  '__parent__',
  '__count__',
  'eval',
  'arguments',
  'caller',
  'callee',
] as const;

export class FieldSelector<T extends Document> {
  private readonly allowedFields: Set<string> | null;
  private readonly separator: string;
  private readonly maxDepth: number;
  private autoDetectedFields: Set<string> | null = null;

  constructor(options: FieldSelectorOptions = {}) {
    this.allowedFields = options.allowedFields ? new Set(options.allowedFields) : null;
    this.separator = options.nestedFieldSeparator ?? DEFAULT_SEPARATOR;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  public static fromSchema<T extends Document>(
    schema: Schema<T>,
    options: Omit<FieldSelectorOptions, 'allowedFields'> = {},
  ): FieldSelector<T> {
    const allowedFields = this.extractFieldsFromSchema(schema);
    return new FieldSelector<T>({ ...options, allowedFields });
  }

  public static autoDetect<T extends Document>(
    options: Omit<FieldSelectorOptions, 'allowedFields'> = {},
  ): FieldSelector<T> {
    return new FieldSelector<T>(options);
  }

  public selectFields(document: T, requestedFields: string[]): FieldSelectionResult<T> {
    const docObj = this.toPlainObject(document);
    const validFields = this.validateFields(requestedFields, docObj);

    if (validFields.length === 0) {
      return { data: document, selectedFields: [] };
    }

    const selectedData = this.extractFields(docObj, validFields);
    return { data: selectedData as T, selectedFields: validFields };
  }

  public selectFieldsFromArray(documents: T[], requestedFields: string[]): FieldSelectionResult<T[]> {
    if (documents.length === 0) {
      return { data: documents, selectedFields: [] };
    }

    const firstDocObj = this.toPlainObject(documents[0]);
    const validFields = this.validateFields(requestedFields, firstDocObj);

    if (validFields.length === 0) {
      return { data: documents, selectedFields: [] };
    }

    const selectedData = documents.map((doc) => this.extractFields(this.toPlainObject(doc), validFields) as T);
    return { data: selectedData, selectedFields: validFields };
  }

  public getAllowedFields(sampleDocument?: Record<string, unknown>): string[] {
    return Array.from(this.getAvailableFields(sampleDocument));
  }

  public isFieldAllowed(field: string, sampleDocument?: Record<string, unknown>): boolean {
    return this.validateFields([field], sampleDocument).length > 0;
  }

  public resetAutoDetection(): void {
    this.autoDetectedFields = null;
  }

  private toPlainObject(document: T | Record<string, unknown>): Record<string, unknown> {
    return this.hasToObjectMethod(document) ? document.toObject() : (document as Record<string, unknown>);
  }

  private hasToObjectMethod(obj: unknown): obj is DocumentWithToObject {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'toObject' in obj &&
      typeof (obj as DocumentWithToObject).toObject === 'function'
    );
  }

  private validateFields(requestedFields: string[], sampleDocument?: Record<string, unknown>): string[] {
    const availableFields = this.getAvailableFields(sampleDocument);
    if (availableFields.size === 0 && !this.allowedFields) {
      return requestedFields;
    }
    return requestedFields.filter((field) => this.isValidField(field, availableFields));
  }

  private getAvailableFields(sampleDocument?: Record<string, unknown>): Set<string> {
    return this.allowedFields ?? (sampleDocument ? this.autoDetectFields(sampleDocument) : new Set());
  }

  private isValidField(field: string, availableFields: Set<string>): boolean {
    if (availableFields.has(field)) {
      return true;
    }
    const parts = field.split(this.separator);
    return parts.some((_, i) => availableFields.has(parts.slice(0, i + 1).join(this.separator)));
  }

  private autoDetectFields(sampleDocument: Record<string, unknown>): Set<string> {
    if (this.autoDetectedFields) {
      return this.autoDetectedFields;
    }
    const fields = new Set<string>();
    this.extractFieldPaths(sampleDocument, '', fields, 0);
    this.autoDetectedFields = fields;
    return fields;
  }

  private extractFieldPaths(obj: unknown, currentPath: string, fields: Set<string>, depth: number): void {
    if (depth >= this.maxDepth || obj === null || typeof obj !== 'object') {
      return;
    }

    if (Array.isArray(obj)) {
      if (currentPath) fields.add(currentPath);
      if (obj.length > 0) {
        this.extractFieldPaths(obj[0], currentPath, fields, depth + 1);
      }
      return;
    }

    if (currentPath) {
      fields.add(currentPath);
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('_') && key !== '_id') continue;

      if (this.isDangerousKey(key)) continue;

      const newPath = currentPath ? `${currentPath}${this.separator}${key}` : key;
      fields.add(newPath);
      this.extractFieldPaths(value, newPath, fields, depth + 1);
    }
  }

  private extractFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
    const result = Object.create(null) as Record<string, unknown>;
    for (const field of fields) {
      const value = this.getNestedValue(obj, field);
      if (value !== undefined) {
        this.setNestedValue(result, field, value);
      }
    }
    return result;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(this.separator).reduce<unknown>((current, key) => {
      const sanitizedKey = this.sanitizeKey(key);
      if (!sanitizedKey) {
        return undefined;
      }

      if (typeof current === 'object' && current !== null) {
        const currentObj = current as Record<string, unknown>;
        return this.safeGetProperty(currentObj, sanitizedKey);
      }
      return undefined;
    }, obj);
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split(this.separator);

    if (keys.length === 0) {
      return;
    }

    const lastKey = keys[keys.length - 1];
    const parentKeys = keys.slice(0, -1);

    const sanitizedLastKey = this.sanitizeKey(lastKey);
    if (!sanitizedLastKey) {
      return;
    }

    let current = obj;

    for (const key of parentKeys) {
      const sanitizedKey = this.sanitizeKey(key);
      if (!sanitizedKey) {
        return;
      }

      const currentValue = this.safeGetProperty(current, sanitizedKey);
      if (
        !this.safeHasProperty(current, sanitizedKey) ||
        typeof currentValue !== 'object' ||
        currentValue === null ||
        Array.isArray(currentValue)
      ) {
        const newObj = Object.create(null) as Record<string, unknown>;
        this.safeSetProperty(current, sanitizedKey, newObj);
      }

      const nextValue = this.safeGetProperty(current, sanitizedKey);
      if (typeof nextValue === 'object' && nextValue !== null && !Array.isArray(nextValue)) {
        current = nextValue as Record<string, unknown>;
      } else {
        return;
      }
    }

    this.safeSetProperty(current, sanitizedLastKey, value);
  }

  private safeHasProperty(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  private safeGetProperty(obj: Record<string, unknown>, key: string): unknown {
    const sanitizedKey = this.sanitizeKey(key);
    if (!sanitizedKey) {
      return undefined;
    }
    if (!this.safeHasProperty(obj, sanitizedKey)) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(obj, sanitizedKey);
    return descriptor ? descriptor.value : undefined;
  }

  private safeSetProperty(obj: Record<string, unknown>, key: string, value: unknown): void {
    const sanitizedKey = this.sanitizeKey(key);
    if (!sanitizedKey) {
      return;
    }

    if (Object.isFrozen(obj) || Object.isSealed(obj)) {
      return;
    }

    if (sanitizedKey in Object.prototype) {
      return;
    }

    try {
      Object.defineProperty(obj, sanitizedKey, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } catch {
      return;
    }
  }

  private isDangerousKey(key: string): boolean {
    if (!key || typeof key !== 'string' || key.trim() === '') {
      return true;
    }

    if (key.length > MAX_KEY_LENGTH) {
      return true;
    }

    if (DANGEROUS_KEYS.includes(key as (typeof DANGEROUS_KEYS)[number])) {
      return true;
    }

    const lowerKey = key.toLowerCase();

    if (lowerKey.includes('proto') || lowerKey.includes('constructor') || lowerKey.includes('prototype')) {
      return true;
    }

    if (/^\d+$/.test(key)) {
      const num = parseInt(key, 10);
      if (num >= 0 && num < MAX_NUMERIC_KEY) {
        return true;
      }
    }

    if (/[<>'"&]/.test(key)) {
      return true;
    }

    for (let i = 0; i < key.length; i++) {
      const charCode = key.charCodeAt(i);
      if ((charCode >= 0 && charCode <= 31) || (charCode >= 127 && charCode <= 159)) {
        return true;
      }
    }

    if (key.startsWith('_') && key !== '_id') {
      return true;
    }

    return false;
  }

  private sanitizeKey(key: string): string | null {
    if (this.isDangerousKey(key)) {
      return null;
    }

    const sanitized = key.trim().replace(/[^\w.-]/g, '');

    if (sanitized !== key || this.isDangerousKey(sanitized)) {
      return null;
    }

    return sanitized;
  }

  private static extractFieldsFromSchema(schema: Schema): string[] {
    const fields = new Set<string>();

    const extractNestedPaths = (schemaObj: Schema, prefix = '') => {
      Object.keys(schemaObj.paths).forEach((path) => {
        if (path.startsWith('__')) return;

        const fullPath = prefix ? `${prefix}.${path}` : path;
        fields.add(fullPath);

        const schemaPath = schemaObj.paths[path];
        if (schemaPath && schemaPath.schema) {
          extractNestedPaths(schemaPath.schema, fullPath);
        }
      });
    };

    extractNestedPaths(schema);
    return Array.from(fields);
  }
}

export const validateFieldSelection = (
  requestedFields: string[],
  allowedFields: string[],
  entityName = 'Entity',
): void => {
  const invalidFields = requestedFields.filter((f) => !allowedFields.includes(f));
  if (invalidFields.length > 0) {
    throw createServiceError(
      `Invalid field(s) requested for ${entityName}: ${invalidFields.join(', ')}`,
      'INVALID_INPUT',
      StatusCodes.BAD_REQUEST,
      { invalidFields },
    );
  }
};

export const parseFieldSelection = (
  fieldsParam: string | undefined,
  allowedFields?: string[],
  entityName?: string,
): string[] => {
  if (!fieldsParam) {
    return [];
  }
  const fields = fieldsParam
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  if (allowedFields) {
    validateFieldSelection(fields, allowedFields, entityName);
  }
  return fields;
};

export const createMongoProjection = (fields: string[]): Record<string, 1> | undefined => {
  if (fields.length === 0) {
    return undefined;
  }

  const projection = fields.reduce(
    (acc, field) => {
      Object.defineProperty(acc, field, {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return acc;
    },
    {} as Record<string, 1>,
  );

  if (!fields.includes('_id')) {
    Object.defineProperty(projection, '_id', {
      value: 1,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return projection;
};
