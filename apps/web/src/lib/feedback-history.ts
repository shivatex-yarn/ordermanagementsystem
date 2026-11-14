/** Client feedback history, derived from an enquiry's timeline: every negotiating / accepted / declined entry, newest first. */
export type TimelineLike = { type?: string; title: string; detail: string | null; createdAt: string; metadata?: unknown; actor?: { name: string } | null };
export type FeedbackEntry = { response: "ACCEPTED" | "NEGOTIATING" | "DECLINED"; text: string; at: string; by: string };

export function feedbackHistory(events: TimelineLike[]): FeedbackEntry[] {
  return events
    .filter((e) => e.type === "CLIENT_FEEDBACK" || e.type === "ENQUIRY_CLOSED")
    .map((e) => {
      const meta = (e.metadata ?? {}) as { response?: string };
      const response = meta.response === "ACCEPTED" || meta.response === "DECLINED" || meta.response === "NEGOTIATING"
        ? meta.response
        : /accepted/i.test(e.title) ? "ACCEPTED" : /declined/i.test(e.title) ? "DECLINED" : "NEGOTIATING";
      return { response, text: e.detail ?? "", at: e.createdAt, by: e.actor?.name ?? "System" } as FeedbackEntry;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
