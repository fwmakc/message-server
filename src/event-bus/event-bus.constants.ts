export const EVENT_BUS = "EVENT_BUS";

export enum EventBusPattern {
  USER_REGISTERED = "user.registered",
  USER_CONFIRMED = "user.confirmed",
  PASSWORD_RESET = "password.reset",
  PASSWORD_CHANGED = "password.changed",
  ENTITY_CREATED = "entity.created",
  ENTITY_UPDATED = "entity.updated",
  ENTITY_REMOVED = "entity.removed",
  CHAT_MESSAGE_SENT = "chat.message.sent",
}

export interface EventBusEnvelope<T = any> {
  pattern: EventBusPattern;
  payload: T;
  timestamp: number;
  source: string;
}
