import type { WebSocketStatsData } from '@utils';

export interface WebSocketConnection {
  readonly readyState: number;
  send: (data: string) => void;
  close: () => void;
}

export interface WebSocketClient {
  readonly id: string;
  readonly ws: WebSocketConnection;
  readonly subscriptions: Set<string>;
  last_activity: number;
}

export interface WebSocketClientInfo {
  readonly id: string;
  readonly subscriptions: string[];
  readonly last_activity: number;
}

export type WebSocketMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'get_stats'
  | 'get_top_operators'
  | 'get_top_products'
  | 'get_global_stats';

export interface WebSocketMessageData {
  events?: string[];
  limit?: number;
  force_refresh?: boolean;
}

export interface WebSocketMessage {
  readonly type: WebSocketMessageType;
  readonly data?: WebSocketMessageData;
}

export type WebSocketResponseType =
  | 'stats'
  | 'top_operators'
  | 'top_products'
  | 'global_stats'
  | 'update'
  | 'error'
  | 'subscribed'
  | 'unsubscribed';

export interface WebSocketResponse {
  readonly type: WebSocketResponseType;
  readonly data?: unknown;
  readonly error?: string;
  readonly timestamp: string;
}

export interface WebSocketStatsResponse {
  readonly type: 'initial' | 'requested' | 'keepalive';
  readonly stats: WebSocketStatsData['stats'];
  readonly timestamp: string;
}

export interface WebSocketEventData {
  result_id?: string;
  operator_id?: string;
  stats?: unknown;
  action?: string;
}

export interface WebSocketSubscriptionData {
  readonly events: string[];
  readonly total_subscriptions: number;
}

export interface WebSocketCacheInfo {
  readonly is_cached: boolean;
  readonly cache_age: number;
  readonly is_expired: boolean;
  readonly ttl: number;
  readonly cache_type: 'memory' | 'redis';
  readonly redis_connected?: boolean;
}

export const WEBSOCKET_EVENTS = {
  STATS_UPDATES: 'stats_updates',
  OPERATOR_UPDATES: 'operator_updates',
  RESULT_UPDATES: 'result_updates',
} as const;

export type WebSocketEventType = (typeof WEBSOCKET_EVENTS)[keyof typeof WEBSOCKET_EVENTS];

export const DEFAULT_SUBSCRIPTIONS = [WEBSOCKET_EVENTS.STATS_UPDATES] as const;

export interface WebSocketTimerConfig {
  readonly CLIENT_TIMEOUT: number;
  readonly CLEANUP_INTERVAL: number;
  readonly KEEPALIVE_INTERVAL: number;
}

export const DEFAULT_WEBSOCKET_TIMER_CONFIG: WebSocketTimerConfig = {
  CLIENT_TIMEOUT: 120000,
  CLEANUP_INTERVAL: 30000,
  KEEPALIVE_INTERVAL: 30000,
} as const;
