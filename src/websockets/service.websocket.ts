import { executeServiceOperation } from '@base/service.base';
import { redisService } from '@config';
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
const CACHE_KEY_PREFIX = 'websocket:stats';

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private fallbackCache: WebSocketStatsData | null = null;
  private lastFallbackUpdate = 0;

  private constructor() {
    this.initializeRedis();
  }

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private async initializeRedis(): Promise<void> {
    try {
      await redisService.connect();
    } catch (error) {
      console.warn('Redis connection failed, falling back to memory cache:', error);
    }
  }

  public getAggregatedStats = async (topProductsLimit = 1, forceRefresh = false): Promise<WebSocketStatsData> => {
    return executeServiceOperation(
      async () => {
        if (!forceRefresh) {
          const cachedData = await this.getCachedData();
          if (cachedData) {
            return cachedData;
          }
        }

        const statsData = await this.fetchAndGenerateStats('both', topProductsLimit);
        await this.setCachedData(statsData);

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

  public clearCache = async (): Promise<void> => {
    try {
      if (redisService.getConnectionStatus()) {
        await redisService.del(CACHE_KEY_PREFIX);
      }
    } catch (error) {
      console.warn('Failed to clear Redis cache:', error);
    }

    this.fallbackCache = null;
    this.lastFallbackUpdate = 0;
  };

  public getCacheInfo = async (): Promise<WebSocketCacheInfo> => {
    const isRedisConnected = redisService.getConnectionStatus();

    if (isRedisConnected) {
      try {
        const exists = await redisService.exists(CACHE_KEY_PREFIX);
        const ttl = exists ? await redisService.ttl(CACHE_KEY_PREFIX) : -1;
        const cache_age = ttl > 0 ? (CACHE_TTL_MS / 1000 - ttl) * 1000 : 0;

        return {
          is_cached: exists,
          cache_age,
          is_expired: ttl <= 0 && exists,
          ttl: CACHE_TTL_MS,
          cache_type: 'redis',
          redis_connected: true,
        };
      } catch (error) {
        console.warn('Failed to get Redis cache info:', error);
      }
    }

    const now = Date.now();
    const cache_age = this.fallbackCache ? now - this.lastFallbackUpdate : 0;
    return {
      is_cached: this.fallbackCache !== null,
      cache_age,
      is_expired: cache_age > CACHE_TTL_MS,
      ttl: CACHE_TTL_MS,
      cache_type: 'memory',
      redis_connected: isRedisConnected,
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

  private async getCachedData(): Promise<WebSocketStatsData | null> {
    if (redisService.getConnectionStatus()) {
      try {
        const cachedString = await redisService.get(CACHE_KEY_PREFIX);
        if (cachedString) {
          const cachedData = JSON.parse(cachedString) as WebSocketStatsData;
          if (WebSocketService.isValidStatsData(cachedData)) {
            return cachedData;
          }
        }
      } catch (error) {
        console.warn('Failed to get data from Redis cache:', error);
      }
    }

    if (this.fallbackCache && this.shouldUseFallbackCache()) {
      return this.fallbackCache;
    }

    return null;
  }

  private async setCachedData(statsData: WebSocketStatsData): Promise<void> {
    if (redisService.getConnectionStatus()) {
      try {
        await redisService.set(CACHE_KEY_PREFIX, JSON.stringify(statsData), CACHE_TTL_MS);
      } catch (error) {
        console.warn('Failed to cache data in Redis:', error);
      }
    }

    this.fallbackCache = statsData;
    this.lastFallbackUpdate = Date.now();
  }

  private shouldUseFallbackCache(): boolean {
    return this.fallbackCache !== null && Date.now() - this.lastFallbackUpdate < CACHE_TTL_MS;
  }

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
