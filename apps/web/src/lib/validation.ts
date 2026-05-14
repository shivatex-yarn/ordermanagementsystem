import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "SUPERVISOR", "ASM", "MANAGER", "DIVISION_HEAD", "MANAGING_DIRECTOR", "SUPER_ADMIN", "ACCOUNTS"]).optional(),
  divisionId: z.number().int().positive().optional(),
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "SUPERVISOR", "ASM", "MANAGER", "DIVISION_HEAD", "MANAGING_DIRECTOR", "SUPER_ADMIN", "ACCOUNTS"]),
  divisionId: z.number().int().positive().optional(),
  divisionIds: z.array(z.number().int().positive()).optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["USER", "SUPERVISOR", "ASM", "MANAGER", "DIVISION_HEAD", "MANAGING_DIRECTOR", "SUPER_ADMIN", "ACCOUNTS"]).optional(),
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
  // Mandatory customer identity fields
  customerName: z.string().min(1, "Customer name is required").max(500),
  customerPhone: z.string().min(7, "Phone number is required").max(20),
  gstNumber: z.string().min(1, "GST number is required").max(50),
  gstCopyUrl: z.string().min(1, "GST certificate upload is required").max(8_000_000),
  customerOrderDate: z.string().min(1, "Customer order date is required"),
});

const setSampleDetailsBody = z
  .object({
    action: z.literal("setDetails"),
    sampleDetails: z.string().max(20000).optional(),
    sampleQuantity: z.string().max(500).optional(),
    sampleWeight: z.string().max(500).optional(),
    // Supervisor captures courier intent at detail-submission time
    sentByCourier: z.boolean().optional(),
    courierName: z.string().max(255).optional(),
    trackingId: z.string().max(500).optional(),
    sampleProofUrl: z.string().max(2000).optional(),
  })
  .refine(
    (d) =>
      (d.sampleDetails?.trim()?.length ?? 0) > 0 ||
      (d.sampleQuantity?.trim()?.length ?? 0) > 0 ||
      (d.sampleWeight?.trim()?.length ?? 0) > 0,
    { message: "Provide sample details and/or quantity and/or weight" }
  )
  .refine(
    (d) => {
      if (d.sentByCourier === true) {
        return Boolean(d.courierName?.trim()) && Boolean(d.trackingId?.trim());
      }
      return true;
    },
    { message: "Courier name and tracking ID are required when sent by courier" }
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
  z.object({ action: z.literal("approveSampleRequest") }),
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
  transferDetails: z.string().min(10, "Transfer details must be at least 10 characters"),
});

export const rejectOrderSchema = z.object({
  orderId: z.number().int().positive(),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export const receiveOrderSchema = z.object({
  orderId: z.number().int().positive(),
  reason: z.string().min(10, "Reason for marking received must be at least 10 characters"),
});

export const newDevPlanSchema = z.object({
  description: z.string().min(10, "Development description required (min 10 characters)").max(20000),
  resourcesRequired: z.string().min(1, "Required resources/materials is required").max(20000),
  researchRequirements: z.string().max(20000).optional(),
  planningNotes: z.string().max(20000).optional(),
  estimatedTimeline: z.string().min(1, "Estimated timeline is required").max(500),
  expectedCompletionDuration: z.string().min(1, "Expected completion duration is required").max(500),
  internalNotes: z.string().max(20000).optional(),
  reasonForNewDevelopment: z.string().min(1, "Reason for new development is required").max(20000),
});

export type NewDevPlanInput = z.infer<typeof newDevPlanSchema>;

export const enquiryHandoffSchema = z
  .object({
    orderId: z.number().int().positive(),
    supervisorId: z.number().int().positive(),
    developmentKind: z.enum(["new", "existing"]),
    newDevelopmentDetails: z.string().max(20000).optional(),
    existingProductDetails: z.string().max(20000).optional(),
    newDevPlan: newDevPlanSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.developmentKind === "new") {
      if (!data.newDevPlan) {
        ctx.addIssue({ code: "custom", message: "Planning details are required for new development", path: ["newDevPlan"] });
        return;
      }
      const t = data.newDevPlan.description.trim();
      if (t.length < 10) {
        ctx.addIssue({ code: "custom", message: "Development description required (min 10 characters)", path: ["newDevPlan", "description"] });
      }
    } else {
      const t = data.existingProductDetails?.trim() ?? "";
      if (t.length < 10) {
        ctx.addIssue({ code: "custom", message: "Existing product details are required (min 10 characters)", path: ["existingProductDetails"] });
      }
    }
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
