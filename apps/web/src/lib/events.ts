/**
 * Event-driven layer: internal event bus for Order events.
 * Triggers: notifications, SLA monitoring, audit, dashboard updates.
 */

export type OrderEventType =
  | "OrderCreated"
  | "OrderAccepted"
  | "OrderTransferred"
  | "OrderRejected"
  | "OrderCompleted"
  | "OrderReceived"
  | "SLABreachDetected"
  | "SampleDetailsUpdated"
  | "SampleApproved"
  | "SampleShipped"
  | "SalesFeedbackRecorded";

export interface BaseOrderEvent {
  orderId: number;
  orderNumber: string;
  timestamp: string;
  userId?: number;
}

export interface OrderCreatedEvent extends BaseOrderEvent {
  type: "OrderCreated";
  createdById: number;
  divisionId: number;
}

export interface OrderAcceptedEvent extends BaseOrderEvent {
  type: "OrderAccepted";
  acceptedById: number;
  divisionId: number;
}

export interface OrderTransferredEvent extends BaseOrderEvent {
  type: "OrderTransferred";
  fromDivisionId: number;
  toDivisionId: number;
  reason: string;
  transferredById: number;
}

export interface OrderRejectedEvent extends BaseOrderEvent {
  type: "OrderRejected";
  divisionId: number;
  reason: string;
  rejectedById: number;
}

export interface OrderCompletedEvent extends BaseOrderEvent {
  type: "OrderCompleted";
  completedById: number;
  durationMs?: number;
}

export interface OrderReceivedEvent extends BaseOrderEvent {
  type: "OrderReceived";
  receivedById: number;
  divisionId: number;
}

export interface SLABreachEvent extends BaseOrderEvent {
  type: "SLABreachDetected";
  divisionId: number;
  orderId: number;
}

export interface SampleDetailsUpdatedEvent extends BaseOrderEvent {
  type: "SampleDetailsUpdated";
  divisionId: number;
}

export interface SampleApprovedEvent extends BaseOrderEvent {
  type: "SampleApproved";
  divisionId: number;
  approvedById: number;
}

export interface SampleShippedEvent extends BaseOrderEvent {
  type: "SampleShipped";
  divisionId: number;
  courierName: string;
  trackingId: string;
}

export interface SalesFeedbackRecordedEvent extends BaseOrderEvent {
  type: "SalesFeedbackRecorded";
  submittedById: number;
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderAcceptedEvent
  | OrderTransferredEvent
  | OrderRejectedEvent
  | OrderCompletedEvent
  | OrderReceivedEvent
  | SLABreachEvent
  | SampleDetailsUpdatedEvent
  | SampleApprovedEvent
  | SampleShippedEvent
  | SalesFeedbackRecordedEvent;

type EventHandler = (event: OrderEvent) => void | Promise<void>;

const handlers: EventHandler[] = [];

export function subscribe(handler: EventHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export async function publish(event: OrderEvent): Promise<void> {
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      console.error("[EventBus] Handler error:", err);
    }
  }
}
