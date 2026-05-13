"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DashboardChartDatum = { name: string; value: number; fill: string; count: number };

export function DashboardCharts({
  pieData,
  barData,
  useCustomRange,
  dateFrom,
  dateTo,
}: {
  pieData: DashboardChartDatum[];
  barData: DashboardChartDatum[];
  useCustomRange: boolean;
  dateFrom: string;
  dateTo: string;
}) {
  if (pieData.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500 text-sm">
          No enquiries in this view to chart.
        </CardContent>
      </Card>
    );
  }

  const tooltipStyle = {
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
    fontSize: 12,
    padding: "8px 12px",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="overflow-hidden border border-slate-200 shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-sm font-semibold text-slate-800">Status distribution</CardTitle>
          <p className="text-xs font-normal text-slate-500">
            {useCustomRange
              ? `Enquiry counts by status · ${dateFrom} → ${dateTo}`
              : "Enquiry counts by status for the selected period."}
          </p>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={88}
                innerRadius={36}
                paddingAngle={2}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} stroke="white" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="overflow-hidden border border-slate-200 shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-sm font-semibold text-slate-800">Enquiries by status</CardTitle>
          <p className="text-xs font-normal text-slate-500">Volume breakdown across all statuses.</p>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={52}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
