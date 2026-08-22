import { EventEmitter } from "node:events";

// In-process pub/sub — the only sanctioned way (besides an explicitly
// published *.public.ts surface) for one module to react to another
// module's state changes without importing its service/repository.
export type EventPayload = Record<string, unknown>;
export type EventHandler<T extends EventPayload = EventPayload> = (payload: T) => void | Promise<void>;

class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<T extends EventPayload>(event: string, payload: T): void {
    this.emitter.emit(event, payload);
  }

  on<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    this.emitter.on(event, (payload: T) => {
      Promise.resolve(handler(payload)).catch((err) => {
        console.error(`[eventBus] handler for "${event}" threw:`, err);
      });
    });
  }

  off<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }
}

export const eventBus = new EventBus();
export type { EventBus };
