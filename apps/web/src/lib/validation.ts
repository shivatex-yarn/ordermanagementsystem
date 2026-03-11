import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "SUPERVISOR", "MANAGER", "SUPER_ADMIN"]).optional(),
  divisionId: z.number().int().positive().optional(),
});

export const createOrderSchema = z.object({
  description: z.string().min(1).max(10000).optional(),
  divisionId: z.number().int().positive(),
});

export const acceptOrderSchema = z.object({
  orderId: z.number().int().positive(),
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
