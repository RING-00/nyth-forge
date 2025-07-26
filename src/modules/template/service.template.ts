import { MongoService } from '@base/mongo-service.base';
import { checkForDuplicateName, createServiceError, executeServiceOperation } from '@base/service.base';
import {
  createDuplicateError,
  prepareObjectIdFields,
  toObjectId,
  validateCreateData,
  validateForeignKeyReferences,
  validateObjectId,
  validateUpdateData,
} from '@base/validation.base';
import { CategoryService } from '@modules/category/service.category';
import type { ErrorCode } from '@types';
import { StatusCodes } from 'http-status-codes';
import type { FilterQuery } from 'mongoose';
import { TemplateModel, type TemplateDocument } from './model.template';

type ForeignKeyValidator = (id: string) => Promise<unknown>;

export class TemplateService extends MongoService<TemplateDocument> {
  private static instance: TemplateService | null = null;

  private constructor() {
    super(TemplateModel);
  }

  public static getInstance(): TemplateService {
    if (!TemplateService.instance) {
      TemplateService.instance = new TemplateService();
    }
    return TemplateService.instance;
  }

  create = async (data: Partial<TemplateDocument>): Promise<TemplateDocument> => {
    return executeServiceOperation(
      async () => {
        validateCreateData(data, TemplateModel);

        const trimmedName = validateNonEmptyString(data.template_name, 'Template name');
        const existingTemplate = await this.findOne({ template_name: trimmedName });
        if (existingTemplate) {
          createDuplicateError('Template', 'name', trimmedName, existingTemplate._id);
        }

        const validators = this.getForeignKeyValidators(data);
        await validateForeignKeyReferences(data, TemplateModel, validators);

        const templateData = prepareObjectIdFields(data, TemplateModel);
        return super.create(templateData);
      },
      'Failed to create template',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'createTemplate', resourceType: 'Template' },
    );
  };

  update = async (
    filter: FilterQuery<TemplateDocument>,
    data: Partial<TemplateDocument>,
  ): Promise<TemplateDocument | null> => {
    return executeServiceOperation(
      async () => {
        validateUpdateData(data, TemplateModel);

        if (data.template_name) {
          await checkForDuplicateName(data.template_name, filter, this.findByName, this.findOne, 'Template');
        }

        const validators = this.getForeignKeyValidators(data);
        if (Object.keys(validators).length > 0) {
          await validateForeignKeyReferences(data, TemplateModel, validators);
        }

        const templateData = prepareObjectIdFields(data, TemplateModel);
        const result = await super.update(filter, templateData);

        if (!result) {
          throw createServiceError('Template not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }
        return result;
      },
      'Failed to update template',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'updateTemplate', resourceType: 'Template' },
    );
  };

  delete = async (filter: FilterQuery<TemplateDocument>): Promise<TemplateDocument | null> => {
    return executeServiceOperation(
      async () => {
        const template = await this.findOne(filter);
        if (!template) {
          throw createServiceError('Template not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }

        const { ResultService } = await import('@modules/result/service.result');
        const resultService = ResultService.getInstance();
        const resultsCount = await resultService.countByTemplateId(template._id.toString());

        if (resultsCount > 0) {
          throw createServiceError(
            `Cannot delete template as it is associated with ${resultsCount} result(s).`,
            'INVALID_OPERATION',
            StatusCodes.CONFLICT,
            {
              templateId: template._id.toString(),
              resultsCount,
            },
          );
        }

        return super.delete(filter);
      },
      'Failed to delete template',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'deleteTemplate', resourceType: 'Template' },
    );
  };

  findById = async (id: string): Promise<TemplateDocument | null> => {
    return executeServiceOperation(
      () => {
        validateObjectId(id, 'Template ID');
        return this.findOne({ _id: id });
      },
      'Failed to find template by ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findTemplateById', resourceType: 'Template', resourceId: id },
    );
  };

  findByName = async (templateName: string): Promise<TemplateDocument | null> => {
    return executeServiceOperation(
      () => {
        const trimmedName = validateNonEmptyString(templateName, 'Template name');
        return this.findOne({ template_name: trimmedName });
      },
      'Failed to find template by name',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findTemplateByName', resourceType: 'Template' },
    );
  };

  findByCategoryId = async (categoryId: string): Promise<TemplateDocument[]> => {
    return executeServiceOperation(
      () => {
        validateObjectId(categoryId, 'Category ID');
        return this.model
          .find({ category_id: toObjectId(categoryId) })
          .sort({ template_name: 1 })
          .lean();
      },
      'Failed to find templates by category ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findTemplatesByCategoryId', resourceType: 'Template', resourceId: categoryId },
    );
  };

  findByCategoryIdWithPagination = async (
    categoryId: string,
    page: number,
    limit: number,
  ): Promise<{ data: TemplateDocument[]; total: number }> => {
    return executeServiceOperation(
      () => {
        validateObjectId(categoryId, 'Category ID');
        return this.findWithPagination({ category_id: toObjectId(categoryId) }, page, limit, {
          template_name: 1,
        });
      },
      'Failed to find templates by category ID with pagination',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findTemplatesByCategoryIdWithPagination', resourceType: 'Template', resourceId: categoryId },
    );
  };

  getAllTemplates = async (): Promise<TemplateDocument[]> => {
    return executeServiceOperation(
      () => this.findAll({}),
      'Failed to retrieve all templates',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getAllTemplates', resourceType: 'Template' },
    );
  };

  private validateForeignKey = async (serviceName: 'Category', id: string): Promise<unknown> => {
    switch (serviceName) {
      case 'Category': {
        const categoryService = CategoryService.getInstance();
        return categoryService.findById(id);
      }
      default: {
        const exhaustiveCheck: never = serviceName;
        throw createServiceError(
          `Unknown service: ${String(exhaustiveCheck)}`,
          'INVALID_INPUT',
          StatusCodes.BAD_REQUEST,
        );
      }
    }
  };

  private getForeignKeyValidators = (data: Partial<TemplateDocument>): Record<string, ForeignKeyValidator> => {
    const validators: { [key in 'category_id']?: ForeignKeyValidator } = {
      category_id: (id) => this.validateForeignKey('Category', id),
    };

    return Object.keys(validators)
      .filter((key) => key in data)
      .reduce((acc, key) => ({ ...acc, [key]: validators[key as keyof typeof validators] }), {});
  };
}

const validateNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw createServiceError(`${fieldName} must be a non-empty string.`, 'INVALID_INPUT', StatusCodes.BAD_REQUEST, {
      [fieldName]: value,
    });
  }
  return value.trim();
};
