import { MongoService } from '@base/mongo-service.base';
import { checkForDuplicateName, createServiceError, executeServiceOperation } from '@base/service.base';
import {
  createDuplicateError,
  prepareObjectIdFields,
  validateCreateData,
  validateObjectId,
  validateUpdateData,
} from '@base/validation.base';
import type { ErrorCode } from '@types';
import { StatusCodes } from 'http-status-codes';
import type { FilterQuery } from 'mongoose';
import { CategoryModel, type CategoryDocument } from './model.category';

export class CategoryService extends MongoService<CategoryDocument> {
  private static instance: CategoryService | null = null;

  private constructor() {
    super(CategoryModel);
  }

  public static getInstance(): CategoryService {
    if (!CategoryService.instance) {
      CategoryService.instance = new CategoryService();
    }
    return CategoryService.instance;
  }

  create = async (data: Partial<CategoryDocument>): Promise<CategoryDocument> => {
    return executeServiceOperation(
      async () => {
        validateCreateData(data, CategoryModel);

        const trimmedName = validateNonEmptyString(data.category_name, 'Category name');
        const existingCategory = await this.findOne({ category_name: trimmedName });

        if (existingCategory) {
          createDuplicateError('Category', 'name', trimmedName, existingCategory._id);
        }

        const categoryData = prepareObjectIdFields(data, CategoryModel);
        return super.create(categoryData);
      },
      'Failed to create category',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'createCategory', resourceType: 'Category' },
    );
  };

  update = async (
    filter: FilterQuery<CategoryDocument>,
    data: Partial<CategoryDocument>,
  ): Promise<CategoryDocument | null> => {
    return executeServiceOperation(
      async () => {
        validateUpdateData(data, CategoryModel);

        if (data.category_name) {
          await checkForDuplicateName(data.category_name, filter, this.findByName, this.findOne, 'Category');
        }

        const categoryData = prepareObjectIdFields(data, CategoryModel);
        const result = await super.update(filter, categoryData);

        if (!result) {
          throw createServiceError('Category not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }
        return result;
      },
      'Failed to update category',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'updateCategory', resourceType: 'Category' },
    );
  };

  delete = async (filter: FilterQuery<CategoryDocument>): Promise<CategoryDocument | null> => {
    return executeServiceOperation(
      async () => {
        const category = await this.findOne(filter);
        if (!category) {
          throw createServiceError('Category not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }

        const { TemplateService } = await import('@modules/template/service.template');
        const templateService = TemplateService.getInstance();
        const templates = await templateService.findByCategoryId(category._id.toString());

        if (templates.length > 0) {
          throw createServiceError(
            `Cannot delete category as it is associated with ${templates.length} template(s).`,
            'INVALID_OPERATION',
            StatusCodes.CONFLICT,
            {
              categoryId: category._id.toString(),
              templateCount: templates.length,
            },
          );
        }

        return super.delete(filter);
      },
      'Failed to delete category',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'deleteCategory', resourceType: 'Category' },
    );
  };

  findById = async (id: string): Promise<CategoryDocument | null> => {
    return executeServiceOperation(
      () => {
        validateObjectId(id, 'Category ID');
        return this.findOne({ _id: id });
      },
      'Failed to find category by ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findCategoryById', resourceType: 'Category', resourceId: id },
    );
  };

  findByName = async (categoryName: string): Promise<CategoryDocument | null> => {
    return executeServiceOperation(
      () => {
        const trimmedName = validateNonEmptyString(categoryName, 'Category name');
        return this.findOne({ category_name: trimmedName });
      },
      'Failed to find category by name',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findCategoryByName', resourceType: 'Category' },
    );
  };

  getAllCategories = async (): Promise<CategoryDocument[]> => {
    return executeServiceOperation(
      () => this.findAll({}),
      'Failed to retrieve all categories',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getAllCategories', resourceType: 'Category' },
    );
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
