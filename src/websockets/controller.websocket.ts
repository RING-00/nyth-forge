import { errorResponse, successResponse } from '@base/service.base';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Elysia } from 'elysia';
import { WebSocketHandler } from './handler.websocket';
import { WebSocketService } from './service.websocket';

dayjs.extend(duration);

export class WebSocketController {
  private webSocketHandler: WebSocketHandler;
  private webSocketService: WebSocketService;

  constructor() {
    this.webSocketHandler = new WebSocketHandler();
    this.webSocketService = WebSocketService.getInstance();
  }

  public createRoutes = () => {
    return new Elysia({ prefix: '/websockets' })
      .get('/status', this.getStatus)
      .get('/clients', this.getClients)
      .get('/stats', this.getStats)
      .get('/cache-info', this.getCacheInfo)
      .post('/clear-cache', this.clearCache)
      .post('/cleanup', this.cleanup);
  };

  public getHandler = (): WebSocketHandler => {
    return this.webSocketHandler;
  };

  private getStatus = () =>
    this.handleRequest(
      async () => {
        const timestamp = new Date().toISOString();
        const cache_info = await this.webSocketService.getCacheInfo();
        return {
          connected_clients: this.webSocketHandler.getConnectedClientsCount(),
          uptime: formatUptime(process.uptime()),
          timestamp,
          cache: {
            status: cache_info.is_cached ? 'cached' : 'empty',
            age: cache_info.cache_age,
            is_expired: cache_info.is_expired,
            type: cache_info.cache_type,
            redis_connected: cache_info.redis_connected,
          },
        };
      },
      'WebSocket status retrieved successfully',
      'Failed to get WebSocket status',
    );

  private getClients = () =>
    this.handleRequest(
      () => {
        const timestamp = new Date().toISOString();
        const clients = this.webSocketHandler.getClientInfo();
        return {
          clients,
          total_clients: clients.length,
          timestamp,
          data_source: 'real-time',
        };
      },
      'WebSocket clients retrieved successfully',
      'Failed to get WebSocket clients',
    );

  private getStats = () =>
    this.handleRequest(
      async () => {
        const timestamp = new Date().toISOString();
        const stats = await this.webSocketService.getAggregatedStats(1, true);
        const cache_info = await this.webSocketService.getCacheInfo();
        return {
          ...stats,
          timestamp,
          data_source: 'fresh-database',
          cache: {
            was_refreshed: true,
            new_cache_age: cache_info.cache_age,
          },
        };
      },
      'WebSocket statistics retrieved successfully',
      'Failed to get WebSocket statistics',
    );

  private getCacheInfo = () =>
    this.handleRequest(
      async () => {
        const timestamp = new Date().toISOString();
        const cache_info = await this.webSocketService.getCacheInfo();
        return {
          ...cache_info,
          timestamp,
          cache_age_formatted: formatDuration(cache_info.cache_age),
          ttl_formatted: formatDuration(cache_info.ttl),
          data_source: 'cache-metadata',
        };
      },
      'WebSocket cache info retrieved successfully',
      'Failed to get WebSocket cache info',
    );

  private clearCache = () =>
    this.handleRequest(
      async () => {
        await this.webSocketService.clearCache();
        this.webSocketHandler.resetEventTime();
        return { cleared: true };
      },
      'WebSocket cache cleared successfully',
      'Failed to clear WebSocket cache',
    );

  private cleanup = () =>
    this.handleRequest(
      () => {
        this.webSocketHandler.cleanup();
        setTimeout(() => {
          this.webSocketHandler = new WebSocketHandler();
        }, 100);
        return { cleaned: true };
      },
      'WebSocket cleanup completed successfully',
      'Failed to cleanup WebSocket',
    );

  private async handleRequest<T extends object>(
    dataFetcher: () => T | Promise<T>,
    successMessage: string,
    errorMessage: string,
  ) {
    try {
      const data = await dataFetcher();
      return successResponse(
        {
          ...data,
          timestamp: new Date().toISOString(),
        },
        successMessage,
      );
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : errorMessage);
    }
  }
}

const formatUptime = (uptimeInSeconds: number): string => {
  if (!uptimeInSeconds || uptimeInSeconds <= 0) {
    return '0s';
  }

  const d = dayjs.duration(uptimeInSeconds, 'seconds');
  const parts: string[] = [];

  if (d.hours() > 0) {
    parts.push(`${d.hours()}h`);
  }
  if (d.minutes() > 0) {
    parts.push(`${d.minutes()}m`);
  }
  if (d.seconds() > 0 || parts.length === 0) {
    parts.push(`${d.seconds()}s`);
  }

  return parts.join(' ');
};

const formatDuration = (milliseconds: number): string => {
  if (!milliseconds || milliseconds <= 0) {
    return '0ms';
  }

  const d = dayjs.duration(milliseconds, 'milliseconds');
  const parts: string[] = [];

  if (d.hours() > 0) {
    parts.push(`${d.hours()}h`);
  }
  if (d.minutes() > 0) {
    parts.push(`${d.minutes()}m`);
  }
  if (d.seconds() > 0) {
    parts.push(`${d.seconds()}s`);
  }
  if (d.milliseconds() > 0 || parts.length === 0) {
    parts.push(`${d.milliseconds()}ms`);
  }

  return parts.join(' ');
};
