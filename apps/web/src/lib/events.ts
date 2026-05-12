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
  | "OrderCancelled"
  | "OrderReceived"
  | "ProductClassified"
  | "NewDevelopmentPlanSubmitted"
  | "PlanningCompleted"
  | "SupervisorHandoffSubmitted"
  | "SLABreachDetected"
  | "SLABreachHeadRejectionSubmitted"
  | "SampleDetailsUpdated"
  | "SampleDevelopmentUpdated"
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
  reason: string;
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

export interface OrderCancelledEvent extends BaseOrderEvent {
  type: "OrderCancelled";
  divisionId: number;
  cancelledById: number;
  reason: string;
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

export interface SLABreachHeadRejectionSubmittedEvent extends BaseOrderEvent {
  type: "SLABreachHeadRejectionSubmitted";
  divisionId: number;
  breachId: number;
  headRejectedById: number;
  message: string;
  headRejectedAt: string;
}

export interface SampleDetailsUpdatedEvent extends BaseOrderEvent {
  type: "SampleDetailsUpdated";
  divisionId: number;
}

export interface SampleDevelopmentUpdatedEvent extends BaseOrderEvent {
  type: "SampleDevelopmentUpdated";
  divisionId: number;
  developmentType: "existing" | "new";
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

export interface ProductClassifiedEvent extends BaseOrderEvent {
  type: "ProductClassified";
  divisionId: number;
  kind: "EXISTING" | "NEW";
  existingProductRef?: string;
}

export interface NewDevelopmentPlanSubmittedEvent extends BaseOrderEvent {
  type: "NewDevelopmentPlanSubmitted";
  divisionId: number;
  planningStartedAt: string;
}

export interface PlanningCompletedEvent extends BaseOrderEvent {
  type: "PlanningCompleted";
  divisionId: number;
  planningCompletedAt: string;
  slaDeadline: string;
}

export interface SupervisorHandoffSubmittedEvent extends BaseOrderEvent {
  type: "SupervisorHandoffSubmitted";
  divisionId: number;
  remarks: string;
  kind: "EXISTING" | "NEW";
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderAcceptedEvent
  | OrderTransferredEvent
  | OrderRejectedEvent
  | OrderCompletedEvent
  | OrderCancelledEvent
  | OrderReceivedEvent
  | ProductClassifiedEvent
  | NewDevelopmentPlanSubmittedEvent
  | PlanningCompletedEvent
  | SupervisorHandoffSubmittedEvent
  | SLABreachEvent
  | SLABreachHeadRejectionSubmittedEvent
  | SampleDetailsUpdatedEvent
  | SampleDevelopmentUpdatedEvent
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
