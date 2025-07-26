import { executeServiceOperation } from '@base/service.base';
import { WebSocketClientManager, WebSocketEventManager } from './events.websocket';
import { WebSocketService } from './service.websocket';
import {
  DEFAULT_SUBSCRIPTIONS,
  DEFAULT_WEBSOCKET_TIMER_CONFIG,
  WEBSOCKET_EVENTS,
  type WebSocketClient,
  type WebSocketClientInfo,
  type WebSocketEventType,
  type WebSocketMessage,
} from './types.websocket';
import { WebSocketValidation } from './validation.websocket';

export class WebSocketHandler {
  private readonly webSocketService: WebSocketService;
  private readonly eventManager: WebSocketEventManager;
  private readonly clientManager: WebSocketClientManager;

  constructor() {
    this.webSocketService = WebSocketService.getInstance();
    this.eventManager = new WebSocketEventManager(this.webSocketService);
    this.clientManager = new WebSocketClientManager(this.webSocketService, DEFAULT_WEBSOCKET_TIMER_CONFIG);

    this.eventManager.initializeEventListeners();
    this.eventManager.setClientBroadcaster(this.clientManager.broadcastUpdate);
    this.clientManager.setEventManager(this.eventManager);
    this.clientManager.startTimers();
  }

  public handleConnection = async (ws: WebSocketClient['ws']): Promise<void> => {
    const client: WebSocketClient = {
      id: WebSocketValidation.generateClientId(),
      ws,
      subscriptions: new Set(DEFAULT_SUBSCRIPTIONS),
      last_activity: Date.now(),
    };

    this.clientManager.addClient(client);
    await this.sendInitialStats(client);
  };

  public handleMessage = async (ws: WebSocketClient['ws'], message: string): Promise<void> => {
    const client = this.clientManager.findClientByWs(ws);
    if (!client) {
      return;
    }

    client.last_activity = Date.now();

    try {
      const parsedMessage = WebSocketValidation.validateMessage(message);
      await this.processMessage(client, parsedMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid message format';
      this.sendError(client, errorMessage);
    }
  };

  public handleDisconnection = (ws: WebSocketClient['ws']): void => {
    const client = this.clientManager.findClientByWs(ws);
    if (client) {
      this.clientManager.removeClient(client.id);
    }
  };

  public cleanup = (): void => {
    this.clientManager.cleanup();
    this.eventManager.cleanup();
  };

  public resetEventTime = (): void => {
    this.eventManager.resetEventTime();
  };

  public getConnectedClientsCount = (): number => {
    return this.clientManager.getConnectedClientsCount();
  };

  public getClientInfo = (): WebSocketClientInfo[] => {
    return this.clientManager.getClientInfo();
  };

  private processMessage = async (client: WebSocketClient, message: WebSocketMessage): Promise<void> => {
    switch (message.type) {
      case 'subscribe':
        await this.handleSubscribe(client, message.data?.events || []);
        break;
      case 'unsubscribe':
        await this.handleUnsubscribe(client, message.data?.events || []);
        break;
      case 'get_stats':
        await this.handleGetStats(client, message.data);
        break;
      case 'get_top_operators':
        await this.handleGetTopOperators(client, message.data?.limit);
        break;
      case 'get_top_products':
        await this.handleGetTopProducts(client, message.data?.limit);
        break;
      case 'get_global_stats':
        await this.handleGetGlobalStats(client);
        break;
      default: {
        const exhaustiveCheck: never = message.type;
        this.sendError(client, `Unknown message type: ${String(exhaustiveCheck)}`);
        break;
      }
    }
  };

  private handleSubscribe = async (client: WebSocketClient, events: string[]): Promise<void> => {
    const validEvents = events.filter((event) => this.isValidWebSocketEvent(event));
    validEvents.forEach((event) => client.subscriptions.add(event));

    const response = WebSocketValidation.createResponse('subscribed', {
      subscribed_events: validEvents,
      total_subscriptions: client.subscriptions.size,
    });
    this.clientManager.sendToClient(client, response);
  };

  private handleUnsubscribe = async (client: WebSocketClient, events: string[]): Promise<void> => {
    events.forEach((event) => client.subscriptions.delete(event));

    const response = WebSocketValidation.createResponse('unsubscribed', {
      unsubscribed_events: events,
      total_subscriptions: client.subscriptions.size,
    });
    this.clientManager.sendToClient(client, response);
  };

  private sendInitialStats = async (client: WebSocketClient): Promise<void> => {
    await this.executeClientOperation(
      client,
      async () => {
        const statsData = await this.webSocketService.getAggregatedStats(1, true);
        const response = WebSocketValidation.createResponse('stats', {
          type: 'initial',
          stats: statsData.stats,
          timestamp: new Date().toISOString(),
        });
        this.clientManager.sendToClient(client, response);
      },
      'Failed to send initial statistics',
      { operationName: 'sendInitialStats', resourceType: 'WebSocket' },
    );
  };

  private handleGetStats = async (client: WebSocketClient, data?: { force_refresh?: boolean }): Promise<void> => {
    await this.executeClientOperation(
      client,
      async () => {
        const statsData = await this.webSocketService.getAggregatedStats(1, data?.force_refresh);
        const response = WebSocketValidation.createResponse('stats', {
          type: 'requested',
          stats: statsData.stats,
          timestamp: new Date().toISOString(),
        });
        this.clientManager.sendToClient(client, response);
      },
      'Failed to get aggregated stats',
      { operationName: 'getStats', resourceType: 'WebSocket' },
    );
  };

  private handleGetTopOperators = async (client: WebSocketClient, limit = 10): Promise<void> => {
    await this.executeClientOperation(
      client,
      async () => {
        const topOperators = await this.webSocketService.getTopOperators(limit);
        const response = WebSocketValidation.createResponse('top_operators', topOperators);
        this.clientManager.sendToClient(client, response);
      },
      'Failed to get top operators',
      { operationName: 'getTopOperators', resourceType: 'WebSocket' },
    );
  };

  private handleGetTopProducts = async (client: WebSocketClient, limit = 1): Promise<void> => {
    await this.executeClientOperation(
      client,
      async () => {
        const topProducts = await this.webSocketService.getTopProducts(limit);
        const response = WebSocketValidation.createResponse('top_products', topProducts);
        this.clientManager.sendToClient(client, response);
      },
      'Failed to get top products',
      { operationName: 'getTopProducts', resourceType: 'WebSocket' },
    );
  };

  private handleGetGlobalStats = async (client: WebSocketClient): Promise<void> => {
    await this.executeClientOperation(
      client,
      async () => {
        const globalStats = await this.webSocketService.getGlobalStats();
        const response = WebSocketValidation.createResponse('global_stats', globalStats);
        this.clientManager.sendToClient(client, response);
      },
      'Failed to get global stats',
      { operationName: 'getGlobalStats', resourceType: 'WebSocket' },
    );
  };

  private async executeClientOperation(
    client: WebSocketClient,
    operation: () => Promise<void>,
    errorMessage: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await executeServiceOperation(operation, errorMessage, 'DATABASE_ERROR', context);
    } catch (error) {
      this.sendError(client, error instanceof Error ? error.message : errorMessage);
    }
  }

  private sendError = (client: WebSocketClient, message: string): void => {
    const errorResponse = WebSocketValidation.createResponse('error', undefined, message);
    this.clientManager.sendToClient(client, errorResponse);
  };

  private isValidWebSocketEvent = (event: string): event is WebSocketEventType => {
    return (Object.values(WEBSOCKET_EVENTS) as string[]).includes(event);
  };
}
