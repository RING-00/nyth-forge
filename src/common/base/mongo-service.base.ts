import { ServiceError } from '@types';
import { Document, FilterQuery, Model, PipelineStage, ProjectionType } from 'mongoose';
import { createServiceError } from './service.base';
import { createDuplicateError } from './validation.base';

interface MongoError extends Error {
  code?: number;
  keyPattern?: Record<string, number>;
  keyValue?: Record<string, unknown>;
}

interface PaginationResult<T> {
  data: T[];
  total: number;
}

interface QueryOptions<T> {
  projection?: ProjectionType<T>;
  isMany?: boolean;
}

export class MongoService<T extends Document> {
  public readonly schema;
  constructor(protected model: Model<T>) {
    this.schema = model.schema;
  }

  public async create(data: Partial<T>): Promise<T> {
    const operation = async () => {
      const document = new this.model(data);
      return (await document.save()).toJSON() as T;
    };
    return this.executeOperation(operation, 'Failed to create document.');
  }

  public async findAll(filter?: FilterQuery<T>, projection?: ProjectionType<T>): Promise<T[]> {
    const operation = async () => this.buildQuery(filter ?? {}, projection, { isMany: true }).exec() as Promise<T[]>;
    return this.executeOperation(operation, 'Failed to find documents.');
  }

  public async findOne(filter: FilterQuery<T>, projection?: ProjectionType<T>): Promise<T | null> {
    const operation = async () => this.buildQuery(filter, projection, { isMany: false }).exec() as Promise<T | null>;
    return this.executeOperation(operation, 'Failed to find document.');
  }

  public async update(filter: FilterQuery<T>, update: Partial<T>): Promise<T | null> {
    const operation = async () => this.model.findOneAndUpdate(filter, update, { new: true }).lean<T>().exec();
    return this.executeOperation(operation, 'Failed to update document.');
  }

  public async delete(filter: FilterQuery<T>): Promise<T | null> {
    const operation = async () => this.model.findOneAndDelete(filter).lean<T>().exec();
    return this.executeOperation(operation, 'Failed to delete document.');
  }

  public async count(filter?: FilterQuery<T>): Promise<number> {
    const operation = async () => this.model.countDocuments(filter ?? {}).exec();
    return this.executeOperation(operation, 'Failed to count documents.');
  }

  public async findWithPagination(
    filter: FilterQuery<T> = {},
    page = 1,
    limit = 10,
    sort?: Record<string, 1 | -1>,
    projection?: ProjectionType<T>,
  ): Promise<PaginationResult<T>> {
    const operation = async () => {
      const skip = (page - 1) * limit;
      const pipeline = this.buildPaginationPipeline(filter, skip, limit, sort, projection);
      const results = await this.model.aggregate(pipeline).exec();

      const result = results[0] ?? { count: [], data: [] };

      return {
        data: result.data as T[],
        total: result.count[0]?.total || 0,
      };
    };
    return this.executeOperation(operation, 'Failed to find documents with pagination.');
  }

  public async aggregate<R = unknown>(pipeline: PipelineStage[]): Promise<R[]> {
    const operation = async () => this.model.aggregate<R>(pipeline).exec();
    return this.executeOperation(operation, 'Failed to execute aggregation.');
  }

  protected handleError(error: unknown, defaultMessage: string): ServiceError {
    if (!(error instanceof Error)) {
      return createServiceError(defaultMessage, 'DATABASE_ERROR', undefined, { originalError: String(error) });
    }

    const mongoError = error as MongoError;

    if (mongoError.code === 11000 || mongoError.message.includes('E11000')) {
      const fieldName = mongoError.keyPattern ? Object.keys(mongoError.keyPattern)[0] : 'field';
      const fieldValue = this.extractFieldValue(mongoError.keyValue, fieldName);

      try {
        createDuplicateError(this.model.modelName, fieldName, fieldValue, 'unknown');
      } catch (duplicateError) {
        return duplicateError as ServiceError;
      }
    }

    switch (mongoError.name) {
      case 'ValidationError':
        return createServiceError('Document validation failed.', 'VALIDATION_ERROR', undefined, {
          originalError: error.message,
        });
      case 'MongoNetworkError':
      case 'MongoServerError':
        return createServiceError('Database connection error.', 'CONNECTION_ERROR', undefined, {
          errorType: mongoError.name,
          originalError: error.message,
        });
      default:
        return createServiceError(error.message || defaultMessage, 'DATABASE_ERROR', undefined, {
          originalError: error.message,
        });
    }
  }

  private async executeOperation<R>(operation: () => Promise<R>, errorMessage: string): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw this.handleError(error, errorMessage);
    }
  }

  private buildQuery(filter: FilterQuery<T>, projection?: ProjectionType<T>, options: QueryOptions<T> = {}) {
    const { isMany = true } = options;
    const query = isMany ? this.model.find(filter) : this.model.findOne(filter);
    const leanQuery = query.lean();
    return projection ? leanQuery.select(projection) : leanQuery;
  }

  private buildPaginationPipeline(
    filter: FilterQuery<T>,
    skip: number,
    limit: number,
    sort?: Record<string, 1 | -1>,
    projection?: ProjectionType<T>,
  ): PipelineStage[] {
    const pipeline: PipelineStage[] = [{ $match: filter }];

    if (sort && Object.keys(sort).length > 0) {
      pipeline.push({ $sort: sort });
    }

    const projectionStage = projection ? [{ $project: projection as Record<string, unknown> }] : [];

    pipeline.push({
      $facet: {
        count: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: limit },
          ...projectionStage,
        ],
      },
    });

    return pipeline;
  }

  private extractFieldValue(keyValue: Record<string, unknown> | undefined, fieldName: string): unknown {
    if (!keyValue || !Object.prototype.hasOwnProperty.call(keyValue, fieldName)) {
      return 'unknown';
    }

    const descriptor = Object.getOwnPropertyDescriptor(keyValue, fieldName);
    return descriptor ? descriptor.value : 'unknown';
  }
}
