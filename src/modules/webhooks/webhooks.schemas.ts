import { z } from "zod";
import { DELIVERY_STATUSES } from "./domain/webhooks.types.js";

const EndpointUrl = z.url().max(2_048);
const EventList = z.array(z.string().min(1).max(100)).min(1).max(20);

export const CreateEndpointBody = z.object({
  url: EndpointUrl,
  description: z.string().max(200).optional(),
  events: EventList,
});
export type CreateEndpointBody = z.infer<typeof CreateEndpointBody>;

export const UpdateEndpointBody = z
  .object({
    url: EndpointUrl.optional(),
    description: z.string().max(200).nullable().optional(),
    events: EventList.optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field to update" });
export type UpdateEndpointBody = z.infer<typeof UpdateEndpointBody>;

export const ListDeliveriesQuery = z.object({
  endpointId: z.uuid().optional(),
  status: z.enum(DELIVERY_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});
export type ListDeliveriesQuery = z.infer<typeof ListDeliveriesQuery>;

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

export const EndpointResource = z.object({
  id: z.uuid(),
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const EndpointCreatedResource = EndpointResource.extend({
  secret: z
    .string()
    .meta({ description: "Signing secret — shown once at creation and never returned again." }),
});

export const EndpointListResource = z.array(EndpointResource);

export const DeliveryResource = z.object({
  id: z.uuid(),
  endpointId: z.uuid(),
  eventType: z.string(),
  status: z.enum(DELIVERY_STATUSES),
  attemptCount: z.number().int(),
  nextAttemptAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const DeliveryListResource = z.array(DeliveryResource);

export const DeliveryAttemptResource = z.object({
  id: z.uuid(),
  attempt: z.number().int(),
  statusCode: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int(),
  createdAt: z.iso.datetime(),
});

export const DeliveryDetailResource = DeliveryResource.extend({
  payload: z.unknown(),
  attempts: z.array(DeliveryAttemptResource),
});

export const TestFireResource = z.object({
  queued: z.number().int().meta({ description: "Deliveries created — 0 if the endpoint is inactive." }),
  eventType: z.string(),
});

export const WebhookEventResource = z.object({
  name: z.string(),
  description: z.string(),
  samplePayload: z.record(z.string(), z.unknown()),
});

export const WebhookEventListResource = z.array(WebhookEventResource);
