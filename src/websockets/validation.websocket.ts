import { createServiceError } from '@base/service.base';
import {
  type WebSocketMessage,
  type WebSocketMessageData,
  type WebSocketMessageType,
  type WebSocketResponse,
  type WebSocketStatsResponse,
} from './types.websocket';

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

export class WebSocketValidation {
  private static readonly VALID_MESSAGE_TYPES: ReadonlyArray<WebSocketMessageType> = [
    'subscribe',
    'unsubscribe',
    'get_stats',
    'get_top_operators',
    'get_top_products',
    'get_global_stats',
  ];

  private static readonly VALID_EVENT_TYPES: ReadonlyArray<string> = [
    'stats_updates',
    'operator_updates',
    'result_updates',
  ];

  private static readonly VALID_STATS_RESPONSE_TYPES: ReadonlyArray<WebSocketStatsResponse['type']> = [
    'initial',
    'requested',
    'keepalive',
  ];

  public static validateMessage(message: string): WebSocketMessage {
    if (typeof message !== 'string' || message.trim() === '') {
      throw createServiceError('Message must be a non-empty string', 'VALIDATION_ERROR');
    }

    let parsedMessage: unknown;
    try {
      parsedMessage = JSON.parse(message);
    } catch {
      throw createServiceError('Invalid JSON format', 'VALIDATION_ERROR');
    }

    if (typeof parsedMessage !== 'object' || parsedMessage === null) {
      throw createServiceError('Message must be a valid JSON object', 'VALIDATION_ERROR');
    }

    const messageObj = parsedMessage as Record<string, unknown>;

    return {
      type: this.validateMessageType(messageObj.type),
      data: this.validateMessageData(messageObj.data),
    };
  }

  public static validateStatsResponse(data: unknown): WebSocketStatsResponse {
    if (typeof data !== 'object' || data === null) {
      throw createServiceError('Stats response data must be an object', 'VALIDATION_ERROR');
    }

    const responseObj = data as Record<string, unknown>;
    const { type, stats, timestamp } = responseObj;

    if (typeof type !== 'string' || !this.VALID_STATS_RESPONSE_TYPES.includes(type as WebSocketStatsResponse['type'])) {
      throw createServiceError(`Invalid stats response type: ${String(type)}`, 'VALIDATION_ERROR');
    }

    if (typeof stats !== 'object' || stats === null) {
      throw createServiceError('Stats data is required and must be an object', 'VALIDATION_ERROR');
    }

    if (typeof timestamp !== 'string' || isNaN(Date.parse(timestamp))) {
      throw createServiceError('Timestamp is required and must be a valid ISO string', 'VALIDATION_ERROR');
    }

    return {
      type: type as WebSocketStatsResponse['type'],
      stats: stats as WebSocketStatsResponse['stats'],
      timestamp,
    };
  }

  public static createResponse(type: WebSocketResponse['type'], data?: unknown, error?: string): WebSocketResponse {
    return {
      type,
      data,
      error,
      timestamp: new Date().toISOString(),
    };
  }

  public static generateClientId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 11);
    return `client_${timestamp}_${randomPart}`;
  }

  private static validateMessageType(type: unknown): WebSocketMessageType {
    if (typeof type !== 'string' || !this.VALID_MESSAGE_TYPES.includes(type as WebSocketMessageType)) {
      throw createServiceError(
        `Invalid message type: ${String(type)}. Valid types: ${this.VALID_MESSAGE_TYPES.join(', ')}`,
        'VALIDATION_ERROR',
      );
    }
    return type as WebSocketMessageType;
  }

  private static validateEvents(events: unknown): string[] {
    if (!Array.isArray(events)) {
      throw createServiceError('Events must be an array of strings', 'VALIDATION_ERROR');
    }

    for (const event of events) {
      if (typeof event !== 'string' || !this.VALID_EVENT_TYPES.includes(event)) {
        throw createServiceError(
          `Invalid event type: ${event}. Valid types: ${this.VALID_EVENT_TYPES.join(', ')}`,
          'VALIDATION_ERROR',
        );
      }
    }

    return events as string[];
  }

  private static validateLimit(limit: unknown): number {
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      throw createServiceError(`Limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`, 'VALIDATION_ERROR');
    }
    return limit;
  }

  private static validateForceRefresh(forceRefresh: unknown): boolean {
    if (typeof forceRefresh !== 'boolean') {
      throw createServiceError('Force refresh must be a boolean', 'VALIDATION_ERROR');
    }
    return forceRefresh;
  }

  private static validateMessageData(data: unknown): WebSocketMessageData | undefined {
    if (data === null || data === undefined) {
      return undefined;
    }

    if (typeof data !== 'object') {
      throw createServiceError('Message data must be an object', 'VALIDATION_ERROR');
    }

    const dataObj = data as Record<string, unknown>;
    const validatedData: WebSocketMessageData = {};

    if ('events' in dataObj) {
      validatedData.events = this.validateEvents(dataObj.events);
    }
    if ('limit' in dataObj) {
      validatedData.limit = this.validateLimit(dataObj.limit);
    }
    if ('force_refresh' in dataObj) {
      validatedData.force_refresh = this.validateForceRefresh(dataObj.force_refresh);
    }

    return validatedData;
  }
}
