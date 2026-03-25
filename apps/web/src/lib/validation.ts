import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "SUPERVISOR", "MANAGER", "MANAGING_DIRECTOR", "SUPER_ADMIN"]).optional(),
  divisionId: z.number().int().positive().optional(),
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "SUPERVISOR", "MANAGER", "MANAGING_DIRECTOR", "SUPER_ADMIN"]),
  divisionId: z.number().int().positive().optional(),
  divisionIds: z.array(z.number().int().positive()).optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["USER", "SUPERVISOR", "MANAGER", "MANAGING_DIRECTOR", "SUPER_ADMIN"]).optional(),
  divisionId: z.number().int().positive().nullable().optional(),
  divisionIds: z.array(z.number().int().positive()).optional(),
  active: z.boolean().optional(),
});

export const divisionUpdateSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  active: z.boolean().optional(),
});

export const createOrderSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(500),
  description: z.string().min(1, "Product description is required").max(10000),
  divisionId: z.number().int().positive(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  sampleRequested: z.boolean().optional(),
  sampleRequestNotes: z.string().max(10000).optional(),
});

const setSampleDetailsBody = z
  .object({
    action: z.literal("setDetails"),
    sampleDetails: z.string().max(20000).optional(),
    sampleQuantity: z.string().max(500).optional(),
  })
  .refine((d) => (d.sampleDetails?.trim()?.length ?? 0) > 0 || (d.sampleQuantity?.trim()?.length ?? 0) > 0, {
    message: "Provide sample details and/or quantity",
  });

/** Division head / Super Admin / n8n integration — sample workflow */
export const orderSampleActionSchema = z.union([
  setSampleDetailsBody,
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("ship"),
    courierName: z.string().min(1).max(255),
    trackingId: z.string().min(1).max(500),
  }),
  z.object({
    action: z.literal("salesFeedback"),
    salesFeedback: z.string().min(1).max(20000),
  }),
]);

export const updateOrderSchema = z.object({
  companyName: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(10000).optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const createOrderCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});

export const acceptOrderSchema = z.object({
  orderId: z.number().int().positive(),
  reason: z.string().min(10, "Acceptance reason must be at least 10 characters"),
});

export const transferOrderSchema = z.object({
  orderId: z.number().int().positive(),
  toDivisionId: z.number().int().positive(),
  reason: z.string().min(10, "Transfer reason must be at least 10 characters"),
});

export const rejectOrderSchema = z.object({
  orderId: z.number().int().positive(),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export const receiveOrderSchema = z.object({
  orderId: z.number().int().positive(),
});

export const completeOrderSchema = z.object({
  orderId: z.number().int().positive(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CreateOrderCommentInput = z.infer<typeof createOrderCommentSchema>;
