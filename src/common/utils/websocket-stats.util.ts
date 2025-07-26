import { createServiceError } from '@base/service.base';
import { StatusCodes } from 'http-status-codes';
import type { Types } from 'mongoose';
import { formatDuration, parseDurationToMs, type OperatorStats } from './operator-stats.util';

export interface WebSocketStatsData {
  stats: {
    topOperators: TopOperatorStats[];
    topProducts: ProductStats[];
    products: ProductStats[];
    latestOperatorId: string;
    latestTestSessionId: string;
    averageDuration: string;
    averagePassRate: number;
    totalOperators: number;
    totalProducts: number;
    totalFailedTests: number;
    totalPassedTests: number;
    totalTestSessions: number;
  };
}

export interface TopOperatorStats {
  operatorId: string;
  operatorName: string;
  totalTestSessions: number;
}

export interface ProductStats {
  product: string;
  total: number;
}

export interface OperatorAggregateData {
  _id: Types.ObjectId;
  operator_name: string;
  stats: OperatorStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResultAggregateData {
  _id: Types.ObjectId;
  operator_id: Types.ObjectId;
  product: string;
  serial_number: string;
  template_id: Types.ObjectId;
  createdAt: Date;
  summary?: {
    passed?: number;
    failed?: number;
    duration?: string;
  };
}

export interface GlobalStats {
  totalOperators: number;
  totalProducts: number;
  totalFailedTests: number;
  totalPassedTests: number;
  totalTestSessions: number;
  totalDuration: string;
  latestOperatorId: string;
  latestTestSessionId: string;
}

interface OperatorMetrics {
  totalFailedTests: number;
  totalPassedTests: number;
  totalTestSessions: number;
  totalDurationMs: number;
  latestOperator: OperatorAggregateData | null;
  latestTestOperator: OperatorAggregateData | null;
}

const DEFAULT_TOP_PRODUCTS_LIMIT = 1;
const PRECISION_MULTIPLIER = 10000;
const PRECISION_DIVISOR = 100;

export const DEFAULT_WEBSOCKET_STATS: WebSocketStatsData = {
  stats: {
    topOperators: [],
    topProducts: [],
    products: [],
    latestOperatorId: '',
    latestTestSessionId: '',
    averageDuration: '0s',
    averagePassRate: 0,
    totalOperators: 0,
    totalProducts: 0,
    totalFailedTests: 0,
    totalPassedTests: 0,
    totalTestSessions: 0,
  },
};

export const generateWebSocketStatsData = (
  operators: OperatorAggregateData[],
  results: ResultAggregateData[],
  topProductsLimit = DEFAULT_TOP_PRODUCTS_LIMIT,
): WebSocketStatsData => {
  try {
    const globalStats = calculateGlobalStats(operators, results);
    const averagePassRate = calculateAveragePassRate(globalStats.totalPassedTests, globalStats.totalFailedTests);
    const averageDuration = calculateAverageDuration(globalStats.totalDuration, globalStats.totalTestSessions);

    return {
      stats: {
        ...globalStats,
        topOperators: calculateTopOperators(operators),
        topProducts: calculateTopProducts(results, topProductsLimit),
        products: calculateAllProducts(results),
        averageDuration,
        averagePassRate,
      },
    };
  } catch (error) {
    console.error('Error generating websocket stats data:', error);
    throw createServiceError(
      'Failed to generate websocket statistics',
      'INTERNAL_SERVER_ERROR',
      StatusCodes.INTERNAL_SERVER_ERROR,
      { error: error instanceof Error ? error.message : 'Unknown error' },
    );
  }
};

export const calculateGlobalStats = (
  operators: OperatorAggregateData[],
  results: ResultAggregateData[],
): GlobalStats => {
  const operatorMetrics = calculateOperatorMetrics(operators);
  const totalProducts = calculateUniqueProducts(results);

  return {
    totalOperators: operators.length,
    totalProducts,
    totalFailedTests: operatorMetrics.totalFailedTests,
    totalPassedTests: operatorMetrics.totalPassedTests,
    totalTestSessions: operatorMetrics.totalTestSessions,
    totalDuration: formatDuration(operatorMetrics.totalDurationMs),
    latestOperatorId: operatorMetrics.latestOperator?._id.toString() ?? '',
    latestTestSessionId: operatorMetrics.latestTestOperator?.stats.last_test_id ?? '',
  };
};

export const calculateTopOperators = (operators: OperatorAggregateData[]): TopOperatorStats[] => {
  if (!Array.isArray(operators) || operators.length === 0) {
    return [];
  }

  const topOperator = operators.reduce((best, current) =>
    (current.stats.total_test_sessions || 0) > (best.stats.total_test_sessions || 0) ? current : best,
  );

  return [
    {
      operatorId: topOperator._id.toString(),
      operatorName: topOperator.operator_name,
      totalTestSessions: topOperator.stats.total_test_sessions || 0,
    },
  ];
};

export const calculateTopProducts = (
  results: ResultAggregateData[],
  limit = DEFAULT_TOP_PRODUCTS_LIMIT,
): ProductStats[] => {
  return getRankedProducts(results, limit);
};

export const calculateAllProducts = (results: ResultAggregateData[]): ProductStats[] => {
  return getRankedProducts(results);
};

export const calculateAverageDuration = (totalDuration: string, totalTestSessions: number): string => {
  if (totalTestSessions === 0) {
    return '0s';
  }
  const totalDurationMs = parseDurationToMs(totalDuration);
  return formatDuration(totalDurationMs / totalTestSessions);
};

export const calculateAveragePassRate = (totalPassedTests: number, totalFailedTests: number): number => {
  const totalTests = totalPassedTests + totalFailedTests;
  if (totalTests === 0) {
    return 0;
  }
  return Math.round((totalPassedTests / totalTests) * PRECISION_MULTIPLIER) / PRECISION_DIVISOR;
};

const calculateOperatorMetrics = (operators: OperatorAggregateData[]): OperatorMetrics => {
  return operators.reduce(
    (acc, op) => {
      const { stats } = op;
      const sessions = stats.total_test_sessions || 0;

      acc.totalFailedTests += stats.total_failed_tests || 0;
      acc.totalPassedTests += stats.total_passed_tests || 0;
      acc.totalTestSessions += sessions;

      if (stats.average_duration) {
        acc.totalDurationMs += parseDurationToMs(stats.average_duration) * sessions;
      }

      if (!acc.latestOperator || op.createdAt > acc.latestOperator.createdAt) {
        acc.latestOperator = op;
      }

      const lastTestDate = stats.last_test_date;
      if (lastTestDate) {
        const latestKnownTestDate = acc.latestTestOperator?.stats.last_test_date;
        if (!latestKnownTestDate || lastTestDate > latestKnownTestDate) {
          acc.latestTestOperator = op;
        }
      }
      return acc;
    },
    {
      totalFailedTests: 0,
      totalPassedTests: 0,
      totalTestSessions: 0,
      totalDurationMs: 0,
      latestOperator: null as OperatorAggregateData | null,
      latestTestOperator: null as OperatorAggregateData | null,
    },
  );
};

const calculateUniqueProducts = (results: ResultAggregateData[]): number => {
  return new Set(results.map((r) => r.product.trim()).filter(Boolean)).size;
};

const getRankedProducts = (results: ResultAggregateData[], limit?: number): ProductStats[] => {
  if (!Array.isArray(results)) {
    return [];
  }

  const productCounts = results.reduce((acc, result) => {
    if (result.product) {
      const product = result.product.trim();
      acc.set(product, (acc.get(product) || 0) + 1);
    }
    return acc;
  }, new Map<string, number>());

  const sorted = Array.from(productCounts.entries())
    .map(([product, total]) => ({ product, total }))
    .sort((a, b) => b.total - a.total);

  return limit ? sorted.slice(0, limit) : sorted;
};
