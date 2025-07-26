import { executeServiceOperation } from '@base/service.base';
import { OperatorModel } from '@modules/operator/model.operator';
import { ResultModel } from '@modules/result/model.result';
import {
  DEFAULT_WEBSOCKET_STATS,
  generateWebSocketStatsData,
  type OperatorAggregateData,
  type ResultAggregateData,
  type WebSocketStatsData,
} from '@utils';
import type { WebSocketCacheInfo } from './types.websocket';

type FetchOptions = 'operators' | 'results' | 'both';

const CACHE_TTL_MS = 30 * 1000;

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private statsCache: WebSocketStatsData | null = null;
  private lastCacheUpdate = 0;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public getAggregatedStats = async (topProductsLimit = 1, forceRefresh = false): Promise<WebSocketStatsData> => {
    return executeServiceOperation(
      async () => {
        if (this.shouldUseCachedData(forceRefresh)) {
          return this.statsCache || DEFAULT_WEBSOCKET_STATS;
        }

        const statsData = await this.fetchAndGenerateStats('both', topProductsLimit);
        this.updateCache(statsData);

        return statsData;
      },
      'Failed to get aggregated statistics',
      'DATABASE_ERROR',
      { operationName: 'getAggregatedStats', resourceType: 'WebSocket' },
    );
  };

  public getTopOperators = async (limit = 10): Promise<WebSocketStatsData['stats']['topOperators']> => {
    return executeServiceOperation(
      async () => {
        const { stats } = await this.fetchAndGenerateStats('operators');
        return stats.topOperators.slice(0, limit);
      },
      'Failed to get top operators',
      'DATABASE_ERROR',
      { operationName: 'getTopOperators', resourceType: 'WebSocket' },
    );
  };

  public getTopProducts = async (limit = 1): Promise<WebSocketStatsData['stats']['topProducts']> => {
    return executeServiceOperation(
      async () => {
        const { stats } = await this.fetchAndGenerateStats('results', limit);
        return stats.topProducts;
      },
      'Failed to get top products',
      'DATABASE_ERROR',
      { operationName: 'getTopProducts', resourceType: 'WebSocket' },
    );
  };

  public getAllProducts = async (): Promise<WebSocketStatsData['stats']['products']> => {
    return executeServiceOperation(
      async () => {
        const { stats } = await this.fetchAndGenerateStats('results');
        return stats.products;
      },
      'Failed to get all products',
      'DATABASE_ERROR',
      { operationName: 'getAllProducts', resourceType: 'WebSocket' },
    );
  };

  public getGlobalStats = async (): Promise<
    Omit<WebSocketStatsData['stats'], 'topOperators' | 'topProducts' | 'products'>
  > => {
    return executeServiceOperation(
      async () => {
        const { stats } = await this.fetchAndGenerateStats('both');

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { topOperators, topProducts, products, ...globalStats } = stats;
        return globalStats;
      },
      'Failed to get global statistics',
      'DATABASE_ERROR',
      { operationName: 'getGlobalStats', resourceType: 'WebSocket' },
    );
  };

  public clearCache = (): void => {
    if (this.statsCache !== null) {
      this.statsCache = null;
      this.lastCacheUpdate = 0;
    }
  };

  public getCacheInfo = (): WebSocketCacheInfo => {
    const now = Date.now();
    const cache_age = this.statsCache ? now - this.lastCacheUpdate : 0;
    return {
      is_cached: this.statsCache !== null,
      cache_age,
      is_expired: cache_age > CACHE_TTL_MS,
      ttl: CACHE_TTL_MS,
    };
  };

  public static getDefaultStats = (): WebSocketStatsData => {
    return DEFAULT_WEBSOCKET_STATS;
  };

  public static isValidStatsData = (data: unknown): data is WebSocketStatsData => {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;
    if (!obj.stats || typeof obj.stats !== 'object') {
      return false;
    }

    const stats = obj.stats as Record<string, unknown>;
    const requiredKeys: (keyof WebSocketStatsData['stats'])[] = [
      'topOperators',
      'topProducts',
      'products',
      'latestOperatorId',
      'latestTestSessionId',
      'averageDuration',
      'averagePassRate',
      'totalOperators',
      'totalProducts',
      'totalFailedTests',
      'totalPassedTests',
      'totalTestSessions',
    ];

    return requiredKeys.every((key) => key in stats);
  };

  private shouldUseCachedData = (forceRefresh: boolean): boolean => {
    return !forceRefresh && this.statsCache !== null && Date.now() - this.lastCacheUpdate < CACHE_TTL_MS;
  };

  private updateCache = (statsData: WebSocketStatsData): void => {
    this.statsCache = statsData;
    this.lastCacheUpdate = Date.now();
  };

  private fetchAndGenerateStats = async (option: FetchOptions, topProductsLimit = 0): Promise<WebSocketStatsData> => {
    const fetchOperators = option === 'operators' || option === 'both';
    const fetchResults = option === 'results' || option === 'both';

    const [operators, results] = await Promise.all([
      fetchOperators ? this.getOperatorAggregateData() : Promise.resolve([]),
      fetchResults ? this.getResultAggregateData() : Promise.resolve([]),
    ]);

    return generateWebSocketStatsData(operators, results, topProductsLimit);
  };

  private getOperatorAggregateData = async (): Promise<OperatorAggregateData[]> => {
    return executeServiceOperation(
      () =>
        OperatorModel.find({})
          .select('_id operator_name stats createdAt updatedAt')
          .sort({ 'stats.total_test_sessions': -1 })
          .lean<OperatorAggregateData[]>()
          .exec(),
      'Failed to fetch operator aggregate data',
      'DATABASE_ERROR',
      { operationName: 'getOperatorAggregateData', resourceType: 'WebSocket' },
    );
  };

  private getResultAggregateData = async (): Promise<ResultAggregateData[]> => {
    return executeServiceOperation(
      () =>
        ResultModel.find({})
          .select('_id operator_id product serial_number template_id createdAt summary')
          .sort({ createdAt: -1 })
          .lean<ResultAggregateData[]>()
          .exec(),
      'Failed to fetch result aggregate data',
      'DATABASE_ERROR',
      { operationName: 'getResultAggregateData', resourceType: 'WebSocket' },
    );
  };
}
