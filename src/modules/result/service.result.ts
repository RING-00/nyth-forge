import { AppEvents, eventBus } from '@base/events.base';
import { MongoService } from '@base/mongo-service.base';
import { createServiceError, executeServiceOperation } from '@base/service.base';
import {
  prepareObjectIdFields,
  toObjectId,
  validateCreateData,
  validateForeignKeyReferences,
  validateObjectId,
  validateUpdateData,
} from '@base/validation.base';
import { OperatorService } from '@modules/operator/service.operator';
import { TemplateService } from '@modules/template/service.template';
import type { ErrorCode } from '@types';
import { StatusCodes } from 'http-status-codes';
import { type FilterQuery } from 'mongoose';
import { ResultModel, type ResultDocument } from './model.result';

type ForeignKeyValidator = (id: string) => Promise<unknown>;

type ResultEventKey = 'RESULT_CREATED' | 'RESULT_UPDATED' | 'RESULT_DELETED';

export class ResultService extends MongoService<ResultDocument> {
  private static instance: ResultService | null = null;

  private constructor() {
    super(ResultModel);
  }

  public static getInstance(): ResultService {
    if (!ResultService.instance) {
      ResultService.instance = new ResultService();
    }
    return ResultService.instance;
  }

  create = async (data: Partial<ResultDocument>): Promise<ResultDocument> => {
    return executeServiceOperation(
      async () => {
        validateCreateData(data, ResultModel);
        const validators = this.getForeignKeyValidators(data);
        await validateForeignKeyReferences(data, ResultModel, validators);

        const resultData = prepareObjectIdFields(data, ResultModel);
        const result = await super.create(resultData);

        if (result.operator_id) {
          await this.emitResultEvent('RESULT_CREATED', result);
        }
        return result;
      },
      'Failed to create test result',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'createResult', resourceType: 'Result' },
    );
  };

  update = async (
    filter: FilterQuery<ResultDocument>,
    data: Partial<ResultDocument>,
  ): Promise<ResultDocument | null> => {
    return executeServiceOperation(
      async () => {
        validateUpdateData(data, ResultModel);
        const validators = this.getForeignKeyValidators(data);
        if (Object.keys(validators).length > 0) {
          await validateForeignKeyReferences(data, ResultModel, validators);
        }

        const updateData = prepareObjectIdFields(data, ResultModel);
        const result = await super.update(filter, updateData);

        if (!result) {
          throw createServiceError('Test result not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }

        if (result.operator_id) {
          await this.emitResultEvent('RESULT_UPDATED', result);
        }
        return result;
      },
      'Failed to update test result',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'updateResult', resourceType: 'Result' },
    );
  };

  delete = async (filter: FilterQuery<ResultDocument>): Promise<ResultDocument | null> => {
    return executeServiceOperation(
      async () => {
        const result = await this.findOne(filter);
        if (!result) {
          throw createServiceError('Test result not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }

        const deletedResult = await super.delete(filter);
        if (deletedResult?.operator_id) {
          await this.emitResultEvent('RESULT_DELETED', result);
        }
        return deletedResult;
      },
      'Failed to delete test result',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'deleteResult', resourceType: 'Result' },
    );
  };

  findById = async (id: string): Promise<ResultDocument | null> => {
    return executeServiceOperation(
      async () => {
        validateObjectId(id, 'Result ID');
        return this.findOne({ _id: id });
      },
      'Failed to find result by ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findResultById', resourceType: 'Result', resourceId: id },
    );
  };

  findByOperatorId = async (operatorId: string): Promise<ResultDocument[]> => {
    return executeServiceOperation(
      () => this.findAll({ operator_id: toObjectId(operatorId) }),
      'Failed to find results by operator ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findResultsByOperatorId', resourceType: 'Result', resourceId: operatorId },
    );
  };

  findByOperatorIdWithPagination = async (
    operatorId: string,
    page: number,
    limit: number,
  ): Promise<{ data: ResultDocument[]; total: number }> => {
    return executeServiceOperation(
      () =>
        this.findWithPagination({ operator_id: toObjectId(operatorId) }, page, limit, {
          createdAt: -1,
        }),
      'Failed to find results by operator ID with pagination',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findResultsByOperatorIdWithPagination', resourceType: 'Result', resourceId: operatorId },
    );
  };

  findBySerialNumber = async (serialNumber: string): Promise<ResultDocument | null> => {
    return executeServiceOperation(
      () => {
        const trimmedSerialNumber = validateNonEmptyString(serialNumber, 'Serial number');
        return this.findOne({ serial_number: trimmedSerialNumber });
      },
      'Failed to find result by serial number',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findResultBySerialNumber', resourceType: 'Result' },
    );
  };

  getResultsByProduct = async (
    product: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: ResultDocument[]; total: number }> => {
    return executeServiceOperation(
      () => {
        const trimmedProduct = validateNonEmptyString(product, 'Product name');
        return this.findWithPagination({ product: trimmedProduct }, page, limit, { createdAt: -1 });
      },
      'Failed to retrieve results by product',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getResultsByProduct', resourceType: 'Result' },
    );
  };

  getLatestResultsByOperator = async (operatorId: string, limit = 10): Promise<ResultDocument[]> => {
    return executeServiceOperation(
      () =>
        this.model
          .find({ operator_id: toObjectId(operatorId) })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
      'Failed to retrieve latest results by operator',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getLatestResultsByOperator', resourceType: 'Result', resourceId: operatorId },
    );
  };

  getLatestResultsByTemplate = async (templateId: string, limit = 10): Promise<ResultDocument[]> => {
    return executeServiceOperation(
      () =>
        this.model
          .find({ template_id: toObjectId(templateId) })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
      'Failed to retrieve latest results by template',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getLatestResultsByTemplate', resourceType: 'Result', resourceId: templateId },
    );
  };

  countByTemplateId = async (templateId: string): Promise<number> => {
    return executeServiceOperation(
      () => {
        validateObjectId(templateId, 'Template ID');
        return this.model.countDocuments({ template_id: toObjectId(templateId) });
      },
      'Failed to count results by template ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'countByTemplateId', resourceType: 'Result', resourceId: templateId },
    );
  };

  countByOperatorId = async (operatorId: string): Promise<number> => {
    return executeServiceOperation(
      () => {
        validateObjectId(operatorId, 'Operator ID');
        return this.model.countDocuments({ operator_id: toObjectId(operatorId) });
      },
      'Failed to count results by operator ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'countByOperatorId', resourceType: 'Result', resourceId: operatorId },
    );
  };

  getResultAnalytics = async (): Promise<{
    total_results: number;
    unique_operators: number;
    unique_templates: number;
    unique_products: number;
    latest_result_date: Date | null;
  }> => {
    return executeServiceOperation(
      async () => {
        const [
          total_results,
          uniqueCountsResult,
          latestResult,
        ] = await Promise.all([
          this.model.countDocuments({}),
          this.model.aggregate([
            {
              $group: {
                _id: null,
                uniqueOperators: { $addToSet: '$operator_id' },
                uniqueProducts: { $addToSet: '$product' },
                uniqueTemplates: { $addToSet: '$template_id' },
              },
            },
            {
              $project: {
                _id: 0,
                uniqueOperators: { $size: '$uniqueOperators' },
                uniqueProducts: { $size: '$uniqueProducts' },
                uniqueTemplates: { $size: '$uniqueTemplates' },
              },
            },
          ]),
          this.model.findOne({}).sort({ createdAt: -1 }).select('createdAt').lean(),
        ]);

        const counts = uniqueCountsResult[0] || { uniqueOperators: 0, uniqueProducts: 0, uniqueTemplates: 0 };

        return {
          total_results,
          unique_operators: counts.uniqueOperators,
          unique_templates: counts.uniqueTemplates,
          unique_products: counts.uniqueProducts,
          latest_result_date: latestResult?.createdAt ?? null,
        };
      },
      'Failed to retrieve result analytics',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getResultAnalytics', resourceType: 'Result' },
    );
  };

  private emitResultEvent = async (event: ResultEventKey, result: ResultDocument): Promise<void> => {
    const resultId = result._id.toString();
    const operatorId = result.operator_id.toString();

    if (!resultId || !operatorId) {
      console.warn('Cannot emit event: missing resultId or operatorId.', { resultId, operatorId });
      return;
    }

    try {
      const action = event.toLowerCase().replace('result_', '');
      let eventToEmit: string;
      switch (event) {
        case 'RESULT_CREATED':
          eventToEmit = AppEvents.RESULT_CREATED;
          break;
        case 'RESULT_UPDATED':
          eventToEmit = AppEvents.RESULT_UPDATED;
          break;
        case 'RESULT_DELETED':
          eventToEmit = AppEvents.RESULT_DELETED;
          break;
        default:
          console.warn(`Unknown event type: ${String(event)}`);
          return;
      }
      await eventBus.emit(eventToEmit, { resultId, operatorId, action });
    } catch (error) {
      console.warn(`Failed to emit result event ${event}:`, error);
    }
  };

  private validateForeignKey = async (serviceName: 'Operator' | 'Template', id: string): Promise<unknown> => {
    switch (serviceName) {
      case 'Operator': {
        const operatorService = OperatorService.getInstance();
        return operatorService.findById(id);
      }
      case 'Template': {
        const templateService = TemplateService.getInstance();
        return templateService.findById(id);
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

  private getForeignKeyValidators = (data: Partial<ResultDocument>): Record<string, ForeignKeyValidator> => {
    const validatorMap: { [key in 'operator_id' | 'template_id']?: ForeignKeyValidator } = {
      operator_id: (id) => this.validateForeignKey('Operator', id),
      template_id: (id) => this.validateForeignKey('Template', id),
    };

    return Object.keys(validatorMap)
      .filter((key) => key in data)
      .reduce((acc, key) => ({ ...acc, [key]: validatorMap[key as keyof typeof validatorMap] }), {});
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
