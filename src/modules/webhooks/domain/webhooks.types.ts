export const DELIVERY_STATUSES = ["pending", "delivering", "succeeded", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** A delivery in one of these states will never be picked up again on its own. */
export const SETTLED_STATUSES: readonly DeliveryStatus[] = ["succeeded", "failed"];

export interface WebhookEndpoint {
  id: string;
  userId: string;
  url: string;
  description: string | null;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  userId: string;
  eventType: string;
  payload: unknown;
  status: DeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  claimId: string | null;
  lastError: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryAttempt {
  id: string;
  deliveryId: string;
  attempt: number;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: Date;
}

/** A delivery joined with the endpoint it targets — what the sender needs. */
export interface DeliveryWithEndpoint extends WebhookDelivery {
  endpoint: WebhookEndpoint;
}

/** The JSON body POSTed to a subscriber. */
export interface WebhookEventPayload {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}
