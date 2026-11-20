"use client";

import dynamic from "next/dynamic";

/**
 * Chart components load in their own chunk, so the heavy charting library doesn't delay the first paint
 * of the dashboard (numbers and lists show first, charts fill in right after).
 */
const Skeleton = () => <div className="h-56 animate-pulse rounded-xl bg-[var(--app-line-soft)]" aria-hidden />;
const load = <K extends string>(name: K) =>
  dynamic(() => import("@/components/dashboard/charts").then((m) => m[name as never] as never), { ssr: false, loading: Skeleton });

export const TrendChart = load("TrendChart") as typeof import("@/components/dashboard/charts").TrendChart;
export const StatusDonut = load("StatusDonut") as typeof import("@/components/dashboard/charts").StatusDonut;
export const ResponseDonut = load("ResponseDonut") as typeof import("@/components/dashboard/charts").ResponseDonut;
export const DivisionBars = load("DivisionBars") as typeof import("@/components/dashboard/charts").DivisionBars;
export { KpiStrip } from "@/components/dashboard/kpi-strip";
