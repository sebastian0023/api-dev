import type {
  DeliveryStatus,
  DeliveryWithEndpoint,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookEndpoint,
} from "./webhooks.types.js";

export interface CreateEndpointRecord {
  userId: string;
  url: string;
  description: string | null;
  secret: string;
  events: string[];
}

export interface UpdateEndpointRecord {
  url?: string;
  description?: string | null;
  events?: string[];
  active?: boolean;
}

export interface CreateDeliveryRecord {
  endpointId: string;
  userId: string;
  eventType: string;
  payload: unknown;
}

export interface RecordAttemptRecord {
  deliveryId: string;
  attempt: number;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
}

export interface ListDeliveriesFilter {
  userId: string;
  endpointId?: string;
  status?: DeliveryStatus;
  limit: number;
  cursor?: string;
}

export interface WebhookEndpointRepository {
  create(data: CreateEndpointRecord): Promise<WebhookEndpoint>;
  listByUser(userId: string): Promise<WebhookEndpoint[]>;
  findOwned(id: string, userId: string): Promise<WebhookEndpoint | null>;
  /** Active endpoints for a user whose `events` include `eventType`. */
  findSubscribed(userId: string, eventType: string): Promise<WebhookEndpoint[]>;
  update(id: string, userId: string, data: UpdateEndpointRecord): Promise<WebhookEndpoint | null>;
  deleteOwned(id: string, userId: string): Promise<boolean>;
}

export interface WebhookDeliveryRepository {
  createMany(records: CreateDeliveryRecord[]): Promise<number>;
  list(filter: ListDeliveriesFilter): Promise<WebhookDelivery[]>;
  findOwned(id: string, userId: string): Promise<WebhookDelivery | null>;
  listAttempts(deliveryId: string): Promise<WebhookDeliveryAttempt[]>;
  /**
   * Atomically moves up to `limit` due deliveries into `delivering` under
   * `claimId` and returns them with their endpoint attached. Two dispatchers
   * racing on the same rows must never both win.
   */
  claimDue(claimId: string, now: Date, limit: number): Promise<DeliveryWithEndpoint[]>;
  recordAttempt(data: RecordAttemptRecord): Promise<void>;
  markSucceeded(id: string, attemptCount: number, completedAt: Date): Promise<void>;
  markFailed(id: string, attemptCount: number, lastError: string, completedAt: Date): Promise<void>;
  scheduleRetry(id: string, attemptCount: number, nextAttemptAt: Date, lastError: string): Promise<void>;
  /** Requeues a settled delivery for immediate re-send. */
  requeue(id: string, userId: string): Promise<WebhookDelivery | null>;
  /** Releases rows a crashed dispatcher left in `delivering`. */
  releaseStaleClaims(olderThan: Date): Promise<number>;
}
