import { AppEvents, eventBus } from '@base/events.base';
import type { WebSocketStatsData } from '@utils';
import { WebSocketService } from './service.websocket';
import type { WebSocketClient, WebSocketEventData, WebSocketResponse } from './types.websocket';
import { WebSocketValidation } from './validation.websocket';

export class WebSocketEventManager {
  private readonly webSocketService: WebSocketService;
  private clientBroadcaster?: (data: unknown) => void;
  private eventListenersInitialized = false;
  private lastEventTime = 0;

  private readonly EVENT_DEBOUNCE_DELAY = 1000;
  private readonly KEEPALIVE_SKIP_THRESHOLD = 2000;
  private readonly handledEvents: string[] = [
    AppEvents.RESULT_CREATED,
    AppEvents.RESULT_UPDATED,
    AppEvents.RESULT_DELETED,
  ];

  constructor(webSocketService: WebSocketService) {
    this.webSocketService = webSocketService;
  }

  public initializeEventListeners = (): void => {
    if (this.eventListenersInitialized) {
      return;
    }

    this.handledEvents.forEach((event) => {
      eventBus.on(event, this.eventListener);
    });

    this.eventListenersInitialized = true;
  };

  public cleanup = (): void => {
    if (!this.eventListenersInitialized) {
      return;
    }

    this.handledEvents.forEach((event) => {
      eventBus.off(event, this.eventListener);
    });
    this.eventListenersInitialized = false;
  };

  public setClientBroadcaster = (broadcaster: (data: unknown) => void): void => {
    this.clientBroadcaster = broadcaster;
  };

  public shouldSkipKeepalive = (): boolean => {
    return Date.now() - this.lastEventTime < this.KEEPALIVE_SKIP_THRESHOLD;
  };

  public resetEventTime = (): void => {
    this.lastEventTime = 0;
  };

  private eventListener = (payload: unknown): void => {
    this.debouncedUpdateLogic(payload as WebSocketEventData);
  };

  private waitForDatabaseConsistency = async (): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, 500));
  };

  private getStatsWithRetry = async (maxRetries: number): Promise<WebSocketStatsData> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const stats = await this.webSocketService.getAggregatedStats(1, true);

        if (this.isValidStatsData(stats)) {
          return stats;
        }

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 200));
        }
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          console.warn(`Stats fetch attempt ${attempt} failed, retrying...`, error);
          await new Promise((resolve) => setTimeout(resolve, attempt * 200));
        }
      }
    }

    if (lastError) {
      console.error('All stats fetch attempts failed:', lastError);
      throw lastError;
    }
    return this.webSocketService.getAggregatedStats(1, false);
  };

  private isValidStatsData = (stats: WebSocketStatsData): boolean => {
    return !!(
      stats?.stats &&
      (stats.stats.totalTestSessions > 0 || stats.stats.totalOperators > 0 || stats.stats.totalProducts > 0)
    );
  };

  private debouncedUpdateLogic = debounce((data: WebSocketEventData): void => {
    (async (): Promise<void> => {
      try {
        this.lastEventTime = Date.now();
        this.webSocketService.clearCache();

        await this.waitForDatabaseConsistency();

        const updatedStats = await this.getStatsWithRetry(3);

        const updateData = {
          event: 'realtime_update',
          stats: updatedStats.stats,
          metadata: {
            operator_id: data.operator_id,
            result_id: data.result_id,
            update_time: new Date().toISOString(),
            action: data.action || 'unknown',
          },
        };

        this.clientBroadcaster?.(updateData);
      } catch (error) {
        console.error('Error handling real-time data update:', error);
      }
    })().catch((error) => {
      console.error('Error in debouncedUpdateLogic:', error);
    });
  }, this.EVENT_DEBOUNCE_DELAY);
}

export class WebSocketClientManager {
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly webSocketService: WebSocketService;
  private eventManager?: WebSocketEventManager;

  private readonly timerConfig: {
    CLIENT_TIMEOUT: number;
    CLEANUP_INTERVAL: number;
    KEEPALIVE_INTERVAL: number;
  };
  private cleanupTimer?: NodeJS.Timeout;
  private keepaliveTimer?: NodeJS.Timeout;

  constructor(
    webSocketService: WebSocketService,
    timerConfig: {
      CLIENT_TIMEOUT: number;
      CLEANUP_INTERVAL: number;
      KEEPALIVE_INTERVAL: number;
    },
  ) {
    this.webSocketService = webSocketService;
    this.timerConfig = timerConfig;
  }

  public startTimers = (): void => {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveClients();
    }, this.timerConfig.CLEANUP_INTERVAL);
    this.keepaliveTimer = setInterval(() => {
      this.sendKeepAliveToAll().catch((error) => {
        console.error('Error in keepalive timer:', error);
      });
    }, this.timerConfig.KEEPALIVE_INTERVAL);
  };

  public cleanup = (): void => {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);

    this.clients.forEach((client) => {
      this.safeCloseConnection(client);
    });
    this.clients.clear();
  };

  public setEventManager = (eventManager: WebSocketEventManager): void => {
    this.eventManager = eventManager;
  };

  public addClient = (client: WebSocketClient): void => {
    this.clients.set(client.id, client);
  };

  public removeClient = (clientId: string): void => {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    this.safeCloseConnection(client);
    this.clients.delete(clientId);
  };

  public getClient = (clientId: string): WebSocketClient | undefined => {
    return this.clients.get(clientId);
  };

  public findClientByWs = (ws: WebSocketClient['ws']): WebSocketClient | undefined => {
    for (const client of this.clients.values()) {
      if (client.ws === ws) {
        return client;
      }
    }
    return undefined;
  };

  public getConnectedClientsCount = (): number => {
    return this.clients.size;
  };

  public getClientInfo = (): Array<{
    id: string;
    subscriptions: string[];
    last_activity: number;
  }> => {
    return Array.from(this.clients.values(), (client) => ({
      id: client.id,
      subscriptions: Array.from(client.subscriptions),
      last_activity: client.last_activity,
    }));
  };

  public sendToClient = (client: WebSocketClient, response: WebSocketResponse): boolean => {
    if (!this.isValidClient(client)) {
      this.removeClient(client.id);
      return false;
    }
    try {
      client.ws.send(JSON.stringify(response));
      client.last_activity = Date.now();
      return true;
    } catch (error) {
      console.error(`Error sending message to client ${client.id}:`, error);
      this.removeClient(client.id);
      return false;
    }
  };

  public broadcastUpdate = (data: unknown): void => {
    const response = WebSocketValidation.createResponse('update', data);
    const subscribedClients = this.getSubscribedClients('stats_updates');

    subscribedClients.forEach((client) => {
      this.sendToClient(client, response);
    });
  };

  private getSubscribedClients = (eventType: string): WebSocketClient[] => {
    return Array.from(this.clients.values()).filter(
      (client) => this.isValidClient(client) && client.subscriptions.has(eventType),
    );
  };

  private isValidClient = (client: WebSocketClient): boolean => {
    return client.ws.readyState === 1;
  };

  private safeCloseConnection = (client: WebSocketClient): void => {
    try {
      if (client.ws.readyState === 1) {
        client.ws.close();
      }
    } catch (error) {
      console.error(`Error closing WebSocket for client ${client.id}:`, error);
    }
  };

  private cleanupInactiveClients = (): void => {
    const now = Date.now();
    this.clients.forEach((client, clientId) => {
      if (!this.isValidClient(client) || now - client.last_activity > this.timerConfig.CLIENT_TIMEOUT) {
        this.removeClient(clientId);
      }
    });
  };

  private sendKeepAliveToAll = async (): Promise<void> => {
    if (this.clients.size === 0 || this.eventManager?.shouldSkipKeepalive()) {
      return;
    }

    try {
      const statsData = await this.webSocketService.getAggregatedStats(1, false);
      const keepaliveMessage = WebSocketValidation.createResponse('stats', {
        type: 'keepalive',
        stats: statsData.stats,
        timestamp: new Date().toISOString(),
        data_source: 'cache-or-fresh',
      });

      const subscribedClients = this.getSubscribedClients('stats_updates');
      subscribedClients.forEach((client) => this.sendToClient(client, keepaliveMessage));
    } catch (error) {
      console.error('Error sending keepalive stats update:', error);
    }
  };
}

function debounce<T extends (...args: Parameters<T>) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;
  return ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      func(...args);
    }, wait);
  }) as T;
}
