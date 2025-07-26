import { ErrorCode, ServiceError } from '@types';

type EventHandler<T = unknown> = (data: T) => Promise<void> | void;

interface EventSubscription {
  handler: EventHandler;
  once?: boolean;
}

export class EventEmitter {
  private static instance: EventEmitter | undefined;
  private listeners = new Map<string, EventSubscription[]>();
  private errorHandler?: (error: ServiceError) => void;

  public static getInstance(): EventEmitter {
    if (!EventEmitter.instance) {
      EventEmitter.instance = new EventEmitter();
    }
    return EventEmitter.instance;
  }

  public on<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.addListener(event, handler as EventHandler, false);
  }

  public once<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.addListener(event, handler as EventHandler, true);
  }

  public off(event: string, handler?: EventHandler): void {
    if (!handler) {
      this.listeners.delete(event);
      return;
    }

    const listeners = this.listeners.get(event);
    if (!listeners) {
      return;
    }

    const updatedListeners = listeners.filter((sub) => sub.handler !== handler);

    if (updatedListeners.length > 0) {
      this.listeners.set(event, updatedListeners);
    } else {
      this.listeners.delete(event);
    }
  }

  public async emit<T = unknown>(event: string, data?: T): Promise<void> {
    const listeners = this.listeners.get(event);
    if (!listeners?.length) {
      return;
    }

    const executionPromises = listeners.map(async (subscription, index) => {
      try {
        await subscription.handler(data);
      } catch (error) {
        this.handleEventError(error, event, index);
        throw error;
      }
    });

    const persistentListeners = listeners.filter((sub) => !sub.once);
    if (persistentListeners.length > 0) {
      this.listeners.set(event, persistentListeners);
    } else {
      this.listeners.delete(event);
    }

    const results = await Promise.allSettled(executionPromises);
    const failures = results
      .map((result, index) => ({ ...result, index }))
      .filter((result) => result.status === 'rejected');

    if (failures.length > 0) {
      const errorDetails = failures.map((failure) => ({
        handlerIndex: failure.index,
        reason: failure.reason instanceof Error ? failure.reason.message : String(failure.reason),
      }));

      const aggregateError = this.createEventError(
        `${failures.length} handler(s) failed for event '${event}'`,
        'OPERATION_FAILED',
        {
          event,
          failedHandlers: errorDetails,
          totalHandlers: listeners.length,
        },
      );
      this.reportError(aggregateError);
    }
  }

  public setErrorHandler(handler: (error: ServiceError) => void): void {
    this.errorHandler = handler;
  }

  public clear(): void {
    this.listeners.clear();
  }

  public getEvents(): string[] {
    return Array.from(this.listeners.keys());
  }

  private addListener(event: string, handler: EventHandler, once: boolean): void {
    const currentListeners = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...currentListeners, { handler, once }]);
  }

  private handleEventError(error: unknown, event: string, handlerIndex: number): void {
    const serviceError = this.createEventError(`Event handler failed for '${event}'`, 'OPERATION_FAILED', {
      event,
      handlerIndex,
      originalError: error instanceof Error ? error.message : String(error),
    });
    this.reportError(serviceError);
  }

  private reportError(error: ServiceError): void {
    if (!this.errorHandler) {
      console.error(`[EventEmitter Error] ${error.message}`, {
        code: error.code,
        details: error.details,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      this.errorHandler(error);
    } catch (handlerError) {
      console.error('Event error handler failed:', handlerError);
      console.error('Original event error:', error);
    }
  }

  private createEventError(message: string, code: ErrorCode, details?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.name = 'EventError';
    error.code = code;
    error.details = details;
    return error;
  }
}

export const eventBus = EventEmitter.getInstance();

export const AppEvents = {
  OPERATOR_STATS_UPDATED: 'operator.stats.updated',
  RESULT_CREATED: 'result.created',
  RESULT_DELETED: 'result.deleted',
  RESULT_UPDATED: 'result.updated',
} as const;

export type AppEventData = {
  [AppEvents.RESULT_CREATED]: { resultId: string; operatorId: string; action: string };
  [AppEvents.RESULT_UPDATED]: { resultId: string; operatorId: string; action: string };
  [AppEvents.RESULT_DELETED]: { resultId: string; operatorId: string; action: string };
  [AppEvents.OPERATOR_STATS_UPDATED]: { operatorId: string; stats: unknown };
};
