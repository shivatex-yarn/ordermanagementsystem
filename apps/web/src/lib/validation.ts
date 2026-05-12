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

/**
 * GST certificate stored inline as JSON. Reasonable size limits enforced
 * server-side to keep request bodies + DB rows manageable.
 */
const gstCertificateSchema = z
  .object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(120),
    base64: z.string().min(1).max(7_000_000), // ~5 MB base64 ≈ 3.5 MB binary
    size: z.number().int().nonnegative().max(5_000_000),
  })
  .strict();

export const createOrderSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(500),
  description: z.string().min(1, "Product description is required").max(10000),
  divisionId: z.number().int().positive(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  sampleRequested: z.boolean().optional(),
  sampleRequestNotes: z.string().max(10000).optional(),

  // ─── Mandatory customer information (Phase 2 spec) ────────────────────────────
  customerId:       z.string().min(1, "Customer ID is required").max(120),
  customerName:     z.string().min(1, "Customer name is required").max(255),
  customerPhone:    z
    .string()
    .min(7, "Phone number looks too short")
    .max(40)
    .regex(/^[+\-\d\s()]+$/, "Phone may only contain digits, spaces, +, -, ()"),
  customerGstNumber: z
    .string()
    .min(15, "GST number must be 15 characters")
    .max(15, "GST number must be 15 characters")
    // Accept any 15-char alphanumeric GST number to avoid blocking enquiry creation
    // for customers whose GSTIN isn't in the canonical format (or for test data).
    .regex(/^[0-9A-Z]{15}$/, "GST number must be 15 characters (letters and digits only)"),
  customerGstCertificate: gstCertificateSchema,
  customerOrderDate: z.coerce.date({ errorMap: () => ({ message: "Customer order date is required" }) }),
});

/** Division Head submits this when classifying as Existing Product. */
export const classifyExistingProductSchema = z.object({
  existingProductRef:    z.string().min(5, "Provide the existing product reference (min 5 chars)").max(2000),
  existingSampleInfo:    z.string().max(5000).optional().default(""),
  existingInternalRemarks: z.string().max(5000).optional().default(""),
});

/** Division Head opens this popup automatically when classifying as New Development. */
export const newDevelopmentPlanSchema = z.object({
  newDevDescription:        z.string().min(20, "Describe the new development (min 20 chars)").max(20000),
  newDevResources:          z.string().min(10, "List resource / material needs (min 10 chars)").max(20000),
  newDevRandD:              z.string().min(10, "List R&D requirements (min 10 chars)").max(20000),
  newDevTimeline:           z.string().min(1, "Estimated development timeline is required").max(255),
  newDevNotes:              z.string().max(20000).optional().default(""),
  newDevCompletionDuration: z.string().min(1, "Expected completion duration is required").max(120),
  newDevWhyNeeded:          z.string().min(20, "Explain why this is needed (min 20 chars)").max(20000),
});

const setSampleDetailsBody = z
  .object({
    action: z.literal("setDetails"),
    sampleDetails: z.string().max(20000).optional(),
    sampleQuantity: z.string().max(500).optional(),
    sampleWeight: z.string().max(500).optional(),
  })
  .refine(
    (d) =>
      (d.sampleDetails?.trim()?.length ?? 0) > 0 ||
      (d.sampleQuantity?.trim()?.length ?? 0) > 0 ||
      (d.sampleWeight?.trim()?.length ?? 0) > 0,
    { message: "Provide sample details and/or quantity and/or weight" }
  );

const setSampleDevelopmentBody = z.object({
  action: z.literal("setDevelopment"),
  developmentType: z.enum(["existing", "new"]),
  /** Required if developmentType === "existing" */
  existingReference: z.string().max(2000).optional(),
  /** Required if developmentType === "new" */
  whyNewDevelopment: z.string().max(20000).optional(),
  technicalDetails: z.string().max(20000).optional(),
  requestedDetailsToSubmit: z.string().max(20000).optional(),
});

/** Division head / Super Admin / n8n integration — sample workflow */
export const orderSampleActionSchema = z.union([
  setSampleDetailsBody,
  setSampleDevelopmentBody.superRefine((d, ctx) => {
    if (d.developmentType === "existing") {
      if (!d.existingReference?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Provide an existing sample reference (style code / previous enquiry / notes)",
          path: ["existingReference"],
        });
      }
      return;
    }
    if (!d.whyNewDevelopment?.trim() || d.whyNewDevelopment.trim().length < 20) {
      ctx.addIssue({
        code: "custom",
        message: "Explain why this is new development (min 20 characters)",
        path: ["whyNewDevelopment"],
      });
    }
    if (!d.technicalDetails?.trim() || d.technicalDetails.trim().length < 20) {
      ctx.addIssue({
        code: "custom",
        message: "Provide technical details (min 20 characters)",
        path: ["technicalDetails"],
      });
    }
    if (!d.requestedDetailsToSubmit?.trim() || d.requestedDetailsToSubmit.trim().length < 10) {
      ctx.addIssue({
        code: "custom",
        message: "List the details the team must submit (min 10 characters)",
        path: ["requestedDetailsToSubmit"],
      });
    }
  }),
  z.object({ action: z.literal("approve") }),
  z
    .object({
      action: z.literal("ship"),
      sentByCourier: z.boolean().optional(),
      courierName: z.string().max(255).optional(),
      trackingId: z.string().max(500).optional(),
      sampleProofUrl: z.string().max(2000).optional(),
    })
    .refine(
      (d) => {
        const byCourier = d.sentByCourier !== false;
        if (!byCourier) return true;
        return Boolean(d.courierName?.trim()) && Boolean(d.trackingId?.trim());
      },
      { message: "Courier name and tracking ID are required when sent by courier" }
    ),
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

export const cancelOrderSchema = z.object({
  reason: z.string().min(10, "Please enter at least 10 characters").max(10000),
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

export const supervisorHandoffSchema = z.object({
  orderId: z.number().int().positive(),
  remarks: z.string().min(10, "Remarks must be at least 10 characters").max(20000),
});

/** Supervisor: save sample details and record dispatch (courier optional). */
export const supervisorSampleDispatchSchema = z
  .object({
    sampleDetails: z.string().min(10, "Sample details must be at least 10 characters").max(20000),
    sampleQuantity: z.string().max(500).optional().default(""),
    sampleWeight: z.string().max(500).optional().default(""),
    sentByCourier: z.boolean(),
    courierName: z.string().max(255).optional().default(""),
    trackingId: z.string().max(500).optional().default(""),
  })
  .superRefine((d, ctx) => {
    if (d.sentByCourier) {
      if (!d.courierName.trim()) {
        ctx.addIssue({ code: "custom", message: "Courier name is required when sending by courier", path: ["courierName"] });
      }
      if (!d.trackingId.trim()) {
        ctx.addIssue({ code: "custom", message: "Tracking / AWB is required when sending by courier", path: ["trackingId"] });
      }
    }
  });

export const receiveOrderSchema = z.object({
  orderId: z.number().int().positive(),
});

export const completeOrderSchema = z.object({
  orderId: z.number().int().positive(),
});

export const slaHeadRejectionSchema = z.object({
  orderId: z.number().int().positive(),
  message: z.string().min(10, "Please enter at least 10 characters").max(20000),
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
