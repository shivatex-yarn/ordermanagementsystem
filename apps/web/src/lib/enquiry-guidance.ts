import type { GuidedStep } from "@/components/ui/guidance";

/**
 * Who owns each stage of an enquiry. Used to tell the person reading the
 * screen whether the next move is theirs or somebody else's.
 */
type Owner = "sales" | "head" | "production";

const OWNER_LABEL: Record<Owner, string> = {
  sales: "Marketing / Sales",
  head: "Division Head",
  production: "Production",
};

/** Does this role own that stage? */
function roleOwns(role: string | undefined, owner: Owner): boolean {
  if (!role) return false;
  switch (owner) {
    case "sales":
      return role === "USER";
    case "head":
      return role === "DIVISION_HEAD" || role === "MANAGER";
    case "production":
      return role === "SUPERVISOR";
  }
}

export type GuidanceOrder = {
  status: string;
  createdById?: number;
  acceptedBy?: { name?: string | null } | null;
  assignedSupervisor?: { name?: string | null } | null;
  enquiryHandoff?: unknown;
  sampleRequested?: boolean;
  headSampleRequestApprovedAt?: string | null;
  sampleSpecsAcknowledgedAt?: string | null;
  sampleShippedAt?: string | null;
  sampleReceivedAt?: string | null;
  customerFeedbackAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  slaDeadline?: string | null;
  createdBy?: { name?: string | null } | null;
  currentDivision?: { name?: string | null } | null;
};

export type Guidance = {
  steps: GuidedStep[];
  /** The banner at the top of the enquiry. Null once the enquiry is closed. */
  next: {
    tone: "act" | "wait" | "late" | "done";
    title: string;
    description: string;
    /** True when the signed-in person owns the current stage. */
    mine: boolean;
  } | null;
};

type RawStep = {
  label: string;
  owner: Owner;
  done: boolean;
  /** Sentence shown when this is the stage the enquiry is sitting at. */
  todo: string;
};

/**
 * Turn an enquiry's state into a plain-language answer to "what happens next,
 * and whose move is it?".
 *
 * The step list is the real workflow: sales submits, the division head accepts
 * and assigns production, a sample is specified, made and sent, sales confirms
 * receipt and records the customer's response, and the head closes it. Stages
 * that do not apply to this enquiry (the sample ones, when no sample was
 * requested) are left out rather than shown as permanently incomplete.
 */
export function buildEnquiryGuidance(
  order: GuidanceOrder,
  role: string | undefined
): Guidance {
  const terminal = ["REJECTED", "CANCELLED", "COMPLETED"].includes(order.status);
  const accepted =
    Boolean(order.acceptedBy) || ["IN_PROGRESS", "COMPLETED"].includes(order.status);
  const assigned = order.enquiryHandoff != null;
  const wantsSample = Boolean(order.sampleRequested);

  const raw: RawStep[] = [
    {
      label: "Enquiry submitted",
      owner: "sales",
      done: true,
      todo: "",
    },
    {
      label: "Accepted by the division",
      owner: "head",
      done: accepted,
      todo: "The division head needs to accept this enquiry, transfer it, or reject it with a reason.",
    },
    {
      label: "Production person assigned",
      owner: "head",
      done: assigned,
      todo: "The division head needs to assign someone in production. Nothing moves until they do.",
    },
  ];

  if (wantsSample) {
    raw.push(
      {
        label: "Sample specifications approved",
        owner: "head",
        done: Boolean(order.headSampleRequestApprovedAt),
        todo: "The division head needs to approve the sample specifications before production can start.",
      },
      {
        label: "Specifications acknowledged by sales",
        owner: "sales",
        done: Boolean(order.sampleSpecsAcknowledgedAt),
        todo: "Sales needs to confirm they have read the approved specifications.",
      },
      {
        label: "Sample prepared and dispatched",
        owner: "production",
        done: Boolean(order.sampleShippedAt),
        todo: "Production needs to prepare the sample and record how it was sent.",
      },
      {
        label: "Sample received by sales",
        owner: "sales",
        done: Boolean(order.sampleReceivedAt),
        todo: "Sales needs to confirm the sample arrived.",
      },
      {
        label: "Customer response recorded",
        owner: "sales",
        done: Boolean(order.customerFeedbackAt),
        todo: "Sales needs to record what the customer said about the sample.",
      }
    );
  }

  raw.push({
    label: "Enquiry closed",
    owner: "head",
    done: order.status === "COMPLETED",
    todo: "The division head can close this enquiry once everything above is done.",
  });

  // The enquiry sits at the first stage that is not finished.
  const currentIndex = raw.findIndex((s) => !s.done);

  const steps: GuidedStep[] = raw.map((s, i) => {
    if (order.status === "REJECTED" || order.status === "CANCELLED") {
      return {
        label: s.label,
        owner: OWNER_LABEL[s.owner],
        state: s.done ? "done" : "upcoming",
      };
    }
    if (s.done) {
      return { label: s.label, owner: OWNER_LABEL[s.owner], state: "done" };
    }
    if (i !== currentIndex) {
      return { label: s.label, owner: OWNER_LABEL[s.owner], state: "upcoming" };
    }
    const mine = roleOwns(role, s.owner);
    return {
      label: s.label,
      owner: OWNER_LABEL[s.owner],
      state: mine ? "current" : "blocked",
      hint: mine ? s.todo.replace(/^The division head|^Sales|^Production/, "You") : s.todo,
    };
  });

  // ── The banner ──────────────────────────────────────────────────────
  if (order.status === "REJECTED") {
    return {
      steps,
      next: {
        tone: "late",
        title: "This enquiry was rejected",
        description: "It will not go any further. The reason is recorded in the activity below.",
        mine: false,
      },
    };
  }
  if (order.status === "CANCELLED") {
    return {
      steps,
      next: {
        tone: "late",
        title: "This enquiry was cancelled",
        description: "The person who submitted it withdrew it. No further action is needed.",
        mine: false,
      },
    };
  }
  if (order.status === "COMPLETED" || terminal) {
    return {
      steps,
      next: {
        tone: "done",
        title: "This enquiry is complete",
        description: "Every stage is finished. Nothing is waiting on anybody.",
        mine: false,
      },
    };
  }

  const current = raw[currentIndex];
  if (!current) {
    return { steps, next: null };
  }

  const overdue = Boolean(order.slaDeadline && new Date(order.slaDeadline) < new Date());
  const mine = roleOwns(role, current.owner);

  // Name the person where we know them — "waiting on Ravi" beats "waiting on a role".
  const person =
    current.owner === "production"
      ? (order.assignedSupervisor?.name ?? null)
      : current.owner === "sales"
        ? (order.createdBy?.name ?? null)
        : null;

  if (mine) {
    return {
      steps,
      next: {
        tone: overdue ? "late" : "act",
        title: overdue ? "This is your move, and it is past its deadline" : "This is your move",
        description: current.todo.replace(
          /^(The division head|Sales|Production) needs to/,
          "You need to"
        ),
        mine: true,
      },
    };
  }

  const who = person ?? OWNER_LABEL[current.owner];
  return {
    steps,
    next: {
      tone: overdue ? "late" : "wait",
      title: overdue ? `Waiting on ${who} — and it is late` : `Waiting on ${who}`,
      description: current.todo,
      mine: false,
    },
  };
}
