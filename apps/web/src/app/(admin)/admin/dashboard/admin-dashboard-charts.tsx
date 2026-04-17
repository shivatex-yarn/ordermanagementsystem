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

type BarDatum = { name: string; count: number; fill: string };
type PieDatum = { name: string; value: number; fill: string };

export function AdminDashboardCharts({ barData, pieData }: { barData: BarDatum[]; pieData: PieDatum[] }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Process flow — Enquiries by stage</CardTitle>
          <p className="text-sm text-slate-500">
            At which stage enquiries currently are. Rejected and Completed are terminal stages.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                  labelStyle={{ color: "#0f172a" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {barData.map((_, index) => (
                    <Cell key={index} fill={barData[index]?.fill ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {pieData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Stage distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={(props: { name?: string; value?: number }) =>
                      `${props.name ?? ""}: ${props.value ?? ""}`
                    }
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
