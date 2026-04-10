/** Card / icon colors per notification event type (client + design tokens). */
export function notificationCardStyles(type: string): {
  shell: string;
  iconWrap: string;
  dot: string;
} {
  switch (type) {
    case "OrderCreated":
      return {
        shell: "border-slate-200/90 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/25 ring-1 ring-slate-400/10",
        iconWrap: "bg-slate-800 text-white shadow-sm shadow-slate-900/15",
        dot: "bg-slate-500",
      };
    case "OrderAccepted":
      return {
        shell: "border-emerald-200/85 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/35 ring-1 ring-emerald-500/10",
        iconWrap: "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25",
        dot: "bg-emerald-500",
      };
    case "OrderTransferred":
      return {
        shell: "border-amber-200/85 bg-gradient-to-br from-amber-50/85 via-white to-orange-50/30 ring-1 ring-amber-400/12",
        iconWrap: "bg-amber-500 text-white shadow-sm shadow-amber-500/25",
        dot: "bg-amber-500",
      };
    case "OrderRejected":
      return {
        shell: "border-rose-200/85 bg-gradient-to-br from-rose-50/85 via-white to-red-50/25 ring-1 ring-rose-400/12",
        iconWrap: "bg-rose-600 text-white shadow-sm shadow-rose-600/20",
        dot: "bg-rose-500",
      };
    case "OrderCancelled":
      return {
        shell: "border-stone-200/85 bg-gradient-to-br from-stone-50/90 via-white to-neutral-50/30 ring-1 ring-stone-400/12",
        iconWrap: "bg-stone-700 text-white shadow-sm shadow-stone-900/15",
        dot: "bg-stone-500",
      };
    case "OrderReceived":
      return {
        shell: "border-sky-200/85 bg-gradient-to-br from-sky-50/85 via-white to-blue-50/30 ring-1 ring-sky-400/12",
        iconWrap: "bg-sky-600 text-white shadow-sm shadow-sky-600/20",
        dot: "bg-sky-500",
      };
    case "OrderCompleted":
      return {
        shell: "border-green-200/85 bg-gradient-to-br from-green-50/85 via-white to-emerald-50/25 ring-1 ring-green-500/10",
        iconWrap: "bg-green-600 text-white shadow-sm shadow-green-600/20",
        dot: "bg-green-500",
      };
    case "SLABreachDetected":
      return {
        shell: "border-orange-300/85 bg-gradient-to-br from-orange-50/90 via-white to-amber-50/35 ring-1 ring-orange-400/18",
        iconWrap: "bg-orange-600 text-white shadow-sm shadow-orange-500/25",
        dot: "bg-orange-500",
      };
    case "SLABreachHeadRejectionSubmitted":
      return {
        shell: "border-amber-200/85 bg-gradient-to-br from-amber-50/85 via-white to-yellow-50/25 ring-1 ring-amber-400/12",
        iconWrap: "bg-amber-600 text-white shadow-sm shadow-amber-600/20",
        dot: "bg-amber-500",
      };
    case "SampleDetailsUpdated":
      return {
        shell: "border-violet-200/85 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/25 ring-1 ring-violet-400/10",
        iconWrap: "bg-violet-600 text-white shadow-sm shadow-violet-600/20",
        dot: "bg-violet-500",
      };
    case "SampleDevelopmentUpdated":
      return {
        shell: "border-purple-200/85 bg-gradient-to-br from-purple-50/80 via-white to-fuchsia-50/20 ring-1 ring-purple-400/10",
        iconWrap: "bg-purple-600 text-white shadow-sm shadow-purple-600/20",
        dot: "bg-purple-500",
      };
    case "SampleApproved":
      return {
        shell: "border-cyan-200/85 bg-gradient-to-br from-cyan-50/85 via-white to-teal-50/30 ring-1 ring-cyan-400/12",
        iconWrap: "bg-cyan-600 text-white shadow-sm shadow-cyan-600/20",
        dot: "bg-cyan-500",
      };
    case "SampleShipped":
      return {
        shell: "border-indigo-200/85 bg-gradient-to-br from-indigo-50/85 via-white to-blue-50/30 ring-1 ring-indigo-400/10",
        iconWrap: "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20",
        dot: "bg-indigo-500",
      };
    case "SalesFeedbackRecorded":
      return {
        shell: "border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/85 via-white to-pink-50/25 ring-1 ring-fuchsia-400/10",
        iconWrap: "bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-600/20",
        dot: "bg-fuchsia-500",
      };
    default:
      return {
        shell: "border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-white ring-1 ring-slate-400/8",
        iconWrap: "bg-slate-600 text-white shadow-sm",
        dot: "bg-slate-400",
      };
  }
}
