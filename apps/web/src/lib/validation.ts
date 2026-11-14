import { z } from "zod";

const optionalText = (max = 2000) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined));

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const teamRole = z.enum(["MARKETING", "SALES", "MANAGING_DIRECTOR", "ACCOUNTS"]);

const employeeCode = z.string().trim().max(40);

export const adminCreateUserSchema = z.object({
  name: z.string().min(1).max(255),
  /** Company employee code, e.g. ST-014. Optional but unique. */
  employeeCode: employeeCode.optional().transform((v) => (v ? v : undefined)),
  email: z.string().email(),
  /** Optional — phone is never required. */
  phone: optionalText(30),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: teamRole,
  divisionIds: z.array(z.number().int().positive()).default([]),
  organizationId: z.number().int().positive().nullable().optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  employeeCode: employeeCode.nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
  email: z.string().email().optional(),
  phone: z.string().max(30).nullable().optional(),
  password: z.string().min(8).optional(),
  role: teamRole.optional(),
  active: z.boolean().optional(),
  divisionIds: z.array(z.number().int().positive()).optional(),
  organizationId: z.number().int().positive().nullable().optional(),
});

export const organizationCreateSchema = z.object({ name: z.string().min(1).max(255).trim() });
export const organizationUpdateSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  active: z.boolean().optional(),
});

export const divisionCreateSchema = z.object({ name: z.string().min(1).max(255).trim() });
export const divisionUpdateSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  active: z.boolean().optional(),
});

export const createOrderSchema = z.object({
  enquiryDate: z.string().min(1, "Enquiry date is required"),
  customerName: z.string().min(1, "Customer name is required").max(500),
  companyName: optionalText(500),
  /** Optional. */
  customerPhone: optionalText(30),
  customerEmail: z.string().email("Invalid email address").max(500).optional().or(z.literal("")),
  customerAddress: optionalText(2000),
  gstNumber: optionalText(50),
  gstCopyUrl: z.string().max(8_000_000).optional(),
  divisionId: z.number().int().positive("Pick a division"),
  productDetails: z.string().min(1, "Describe what the client needs").max(10000),
  isSample: z.boolean().default(false),
  assignedToId: z.number().int().positive().optional(),
});

/** Edit: every field optional; empty text clears the field. */
export const updateOrderSchema = z
  .object({
    enquiryDate: z.string().min(1),
    customerName: z.string().min(1, "Customer name is required").max(500),
    companyName: z.string().max(500),
    customerPhone: z.string().max(30),
    customerEmail: z.string().email("Invalid email address").max(500).or(z.literal("")),
    customerAddress: z.string().max(2000),
    gstNumber: z.string().max(50),
    gstCopyUrl: z.string().max(8_000_000),
    divisionId: z.number().int().positive(),
    productDetails: z.string().min(1, "Describe what the client needs").max(10000),
    isSample: z.boolean(),
  })
  .partial();

export const pricingSchema = z.object({
  pricePerUnit: z.coerce.number().positive("Enter a price greater than 0"),
  priceUnit: z.string().min(1, "Choose a unit").max(40),
  quantity: optionalText(100),
  paymentTerms: optionalText(200),
  deliveryTime: optionalText(200),
  pricingNotes: optionalText(5000),
});

export const sampleSchema = z.object({
  sampleSentAt: z.string().optional(),
  sampleCourierName: optionalText(200),
  sampleTrackingId: optionalText(200),
  sampleRemarks: optionalText(5000),
});

export const feedbackSchema = z.object({
  clientResponse: z.enum(["ACCEPTED", "NEGOTIATING", "DECLINED"]),
  clientFeedback: z.string().min(1, "Write what the client said").max(10000),
});

export const cancelOrderSchema = z.object({ reason: z.string().min(3, "Add a short reason").max(2000) });

export const accessRequestSchema = z.object({
  divisionId: z.number().int().positive(),
  reason: z.string().min(3, "Tell the admin why you need access").max(2000),
});
export const accessDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(1000),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
