import { AppEventData, AppEvents, eventBus } from '@base/events.base';
import { MongoService } from '@base/mongo-service.base';
import { createServiceError, executeServiceOperation } from '@base/service.base';
import {
  createDuplicateError,
  prepareObjectIdFields,
  toObjectId,
  validateCreateData,
  validateObjectId,
  validateUpdateData,
} from '@base/validation.base';
import type { ErrorCode } from '@types';
import {
  calculateOperatorStatsFromResults,
  getDefaultOperatorStats,
  type OperatorStats,
  type ResultData,
} from '@utils';
import { StatusCodes } from 'http-status-codes';
import { Types, type FilterQuery, type SortOrder } from 'mongoose';
import { OperatorModel, type OperatorDocument } from './model.operator';

interface OperatorAnalytics {
  total_operators: number;
  active_operators: number;
  average_pass_rate: number;
  total_test_sessions: number;
}

interface RecalculationResult {
  updated_operators: number;
  operators: (OperatorDocument | { operator_id: Types.ObjectId; operator_name: string; error: string })[];
}

interface StatsCacheEntry {
  stats: OperatorStats;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const THROTTLE_DELAY_MS = 1000;
const DEFAULT_OPERATOR_LIMIT = 10;

export class OperatorService extends MongoService<OperatorDocument> {
  private static instance: OperatorService | null = null;
  private statsCache = new Map<string, StatsCacheEntry>();
  private updateThrottleMap = new Map<string, NodeJS.Timeout>();
  private eventListenersInitialized = false;

  private constructor() {
    super(OperatorModel);
    this.initializeEventListeners();
  }

  public static getInstance(): OperatorService {
    if (!OperatorService.instance) {
      OperatorService.instance = new OperatorService();
    }
    return OperatorService.instance;
  }

  private initializeEventListeners = (): void => {
    if (this.eventListenersInitialized) {
      return;
    }

    const events = [
      AppEvents.RESULT_CREATED,
      AppEvents.RESULT_UPDATED,
      AppEvents.RESULT_DELETED,
    ];
    events.forEach((event) => eventBus.on(event, this.handleResultEvent));

    this.eventListenersInitialized = true;
  };

  cleanup = (): void => {
    this.updateThrottleMap.forEach(clearTimeout);
    this.updateThrottleMap.clear();

    const events = [
      AppEvents.RESULT_CREATED,
      AppEvents.RESULT_UPDATED,
      AppEvents.RESULT_DELETED,
    ];
    events.forEach((event) => eventBus.off(event));

    this.eventListenersInitialized = false;
  };

  create = async (data: Partial<OperatorDocument>): Promise<OperatorDocument> => {
    return executeServiceOperation(
      async () => {
        validateCreateData(data, OperatorModel);

        const trimmedName = validateNonEmptyString(data.operator_name, 'Operator name');
        const existingOperator = await this.findOne({ operator_name: trimmedName });
        if (existingOperator) {
          createDuplicateError('Operator', 'name', trimmedName, existingOperator._id);
        }

        const preparedData = prepareObjectIdFields(data, OperatorModel);
        return super.create(preparedData);
      },
      'Failed to create operator',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'createOperator', resourceType: 'Operator' },
    );
  };

  update = async (
    filter: FilterQuery<OperatorDocument>,
    data: Partial<OperatorDocument>,
  ): Promise<OperatorDocument | null> => {
    return executeServiceOperation(
      async () => {
        validateUpdateData(data, OperatorModel);

        if (data.operator_name) {
          const { checkForDuplicateName } = await import('@base/service.base');
          await checkForDuplicateName(
            data.operator_name,
            filter,
            this.findByName.bind(this),
            this.findOne.bind(this),
            'Operator',
          );
        }

        const preparedData = prepareObjectIdFields(data, OperatorModel);
        const result = await super.update(filter, preparedData);

        if (!result) {
          throw createServiceError('Operator not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }
        return result;
      },
      'Failed to update operator',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'updateOperator', resourceType: 'Operator' },
    );
  };

  delete = async (filter: FilterQuery<OperatorDocument>): Promise<OperatorDocument | null> => {
    return executeServiceOperation(
      async () => {
        const operator = await this.findOne(filter);
        if (!operator) {
          throw createServiceError('Operator not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { filter });
        }

        const { ResultService } = await import('@modules/result/service.result');
        const resultService = ResultService.getInstance();
        const resultsCount = await resultService.countByOperatorId(operator._id.toString());

        if (resultsCount > 0) {
          throw createServiceError(
            `Cannot delete operator as it is associated with ${resultsCount} result(s).`,
            'INVALID_OPERATION',
            StatusCodes.CONFLICT,
            {
              operatorId: operator._id.toString(),
              resultsCount,
            },
          );
        }

        return super.delete(filter);
      },
      'Failed to delete operator',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'deleteOperator', resourceType: 'Operator' },
    );
  };

  findById = async (id: string): Promise<OperatorDocument | null> => {
    return executeServiceOperation(
      async () => {
        validateObjectId(id, 'Operator ID');
        return this.findOne({ _id: id });
      },
      'Failed to find operator by ID',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findOperatorById', resourceType: 'Operator', resourceId: id },
    );
  };

  findByName = async (operatorName: string): Promise<OperatorDocument | null> => {
    return executeServiceOperation(
      () => {
        const trimmedName = validateNonEmptyString(operatorName, 'Operator name');
        return this.findOne({ operator_name: trimmedName });
      },
      'Failed to find operator by name',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'findOperatorByName', resourceType: 'Operator' },
    );
  };

  getAllOperators = async (): Promise<OperatorDocument[]> => {
    return executeServiceOperation(() => this.findAll({}), 'Failed to retrieve all operators', 'DATABASE_ERROR');
  };

  calculateOperatorStats = async (operatorId: string): Promise<OperatorStats> => {
    return executeServiceOperation(
      async () => {
        const cached = this.statsCache.get(operatorId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          return cached.stats;
        }

        const { ResultModel } = await import('@modules/result/model.result');
        const results = await ResultModel.find({
          operator_id: toObjectId(operatorId),
        }).lean<ResultData[]>();

        const stats = results.length > 0 ? calculateOperatorStatsFromResults(results) : getDefaultOperatorStats();
        this.statsCache.set(operatorId, { stats, timestamp: Date.now() });

        return stats;
      },
      'Failed to calculate operator statistics',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'calculateOperatorStats', resourceType: 'Operator', resourceId: operatorId },
    );
  };

  updateOperatorStats = async (operatorId: string): Promise<OperatorDocument | null> => {
    return executeServiceOperation(
      async () => {
        const stats = await this.calculateOperatorStats(operatorId);
        this.clearStatsCache(operatorId);

        const updatedOperator = await this.update({ _id: toObjectId(operatorId) }, { stats });
        if (!updatedOperator) {
          throw createServiceError('Operator not found', 'NOT_FOUND', StatusCodes.NOT_FOUND, { operatorId });
        }

        await eventBus.emit(AppEvents.OPERATOR_STATS_UPDATED, { operatorId, stats });
        return updatedOperator;
      },
      'Failed to update operator statistics',
      'OPERATION_FAILED' as ErrorCode,
      { operationName: 'updateOperatorStats', resourceType: 'Operator', resourceId: operatorId },
    );
  };

  recalculateAllOperatorStats = async (): Promise<RecalculationResult> => {
    return executeServiceOperation(
      async () => {
        this.statsCache.clear();
        const operators = await this.findAll({});
        if (operators.length === 0) {
          return { updated_operators: 0, operators: [] };
        }

        const updates = await Promise.allSettled(operators.map((op) => this.updateOperatorStats(op._id.toString())));

        const results = updates.map((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            return result.value;
          }
          const op = operators.find((_, i) => i === index) ?? null;
          if (!op) {
            return {
              operator_id: new Types.ObjectId(),
              operator_name: 'Unknown',
              error: 'Operator not found',
            };
          }
          const error = result.status === 'rejected' ? (result.reason as Error).message : 'Update failed';
          return { operator_id: op._id, operator_name: op.operator_name, error };
        });

        const updated_operators = results.filter((r) => 'stats' in r).length;
        return { updated_operators, operators: results };
      },
      'Failed to recalculate all operator statistics',
      'OPERATION_FAILED' as ErrorCode,
    );
  };

  clearStatsCache = (operatorId?: string): void => {
    if (operatorId) {
      this.statsCache.delete(operatorId);
    } else {
      this.statsCache.clear();
    }
  };

  getTopPerformingOperators = async (limit = DEFAULT_OPERATOR_LIMIT): Promise<OperatorDocument[]> => {
    return executeServiceOperation(
      () => getSortedOperators({ 'stats.average_pass_rate': -1 }, limit),
      'Failed to retrieve top performing operators',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getTopPerformingOperators', resourceType: 'Operator' },
    );
  };

  getMostActiveOperators = async (limit = DEFAULT_OPERATOR_LIMIT): Promise<OperatorDocument[]> => {
    return executeServiceOperation(
      () => getSortedOperators({ 'stats.total_test_sessions': -1 }, limit),
      'Failed to retrieve most active operators',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getMostActiveOperators', resourceType: 'Operator' },
    );
  };

  getRecentlyActiveOperators = async (limit = DEFAULT_OPERATOR_LIMIT): Promise<OperatorDocument[]> => {
    const filter = { 'stats.last_test_date': { $ne: null } };
    return executeServiceOperation(
      () => getSortedOperators({ 'stats.last_test_date': -1 }, limit, filter),
      'Failed to retrieve recently active operators',
      'DATABASE_ERROR' as ErrorCode,
      { operationName: 'getRecentlyActiveOperators', resourceType: 'Operator' },
    );
  };

  getOperatorAnalytics = async (): Promise<OperatorAnalytics> => {
    return executeServiceOperation(
      async () => {
        const [
          total_operators,
          active_operators,
          analytics,
        ] = await Promise.all([
          this.model.countDocuments({}),
          this.model.countDocuments({ 'stats.total_test_sessions': { $gt: 0 } }),
          this.model.aggregate([
            { $match: { 'stats.total_test_sessions': { $gt: 0 } } },
            {
              $group: {
                _id: null,
                avgPassRate: { $avg: '$stats.average_pass_rate' },
                totalSessions: { $sum: '$stats.total_test_sessions' },
              },
            },
          ]),
        ]);

        const stats = analytics[0] || { avgPassRate: 0, totalSessions: 0 };

        return {
          total_operators,
          active_operators,
          average_pass_rate: Math.round(stats.avgPassRate * 100) / 100,
          total_test_sessions: stats.totalSessions,
        };
      },
      'Failed to retrieve operator analytics',
      'DATABASE_ERROR' as ErrorCode,
    );
  };

  private handleResultEvent = (
    data: AppEventData[
      | typeof AppEvents.RESULT_CREATED
      | typeof AppEvents.RESULT_UPDATED
      | typeof AppEvents.RESULT_DELETED],
  ): void => {
    try {
      const { operatorId } = data;

      if (this.updateThrottleMap.has(operatorId)) {
        clearTimeout(this.updateThrottleMap.get(operatorId));
      }

      this.clearStatsCache(operatorId);

      const timeout = setTimeout(() => {
        void (async () => {
          try {
            await this.updateOperatorStats(operatorId);
          } catch (error) {
            console.warn(`Failed to update operator stats for ${operatorId}:`, error);
          } finally {
            this.updateThrottleMap.delete(operatorId);
          }
        })();
      }, THROTTLE_DELAY_MS);

      this.updateThrottleMap.set(operatorId, timeout);
    } catch (error) {
      console.warn(`Failed to handle result event:`, error);
    }
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

const getSortedOperators = async (
  sort: { [key: string]: SortOrder },
  limit: number,
  filter: FilterQuery<OperatorDocument> = {},
): Promise<OperatorDocument[]> => {
  return OperatorModel.find(filter).sort(sort).limit(limit).lean<OperatorDocument[]>();
};
