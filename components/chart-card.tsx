"use client";

import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type ChartCardProps = {
  title: string;
  subtitle?: string;
  total: number;
  avg: number;
  peak: number;
  color: string;
  type: "line" | "area";
  data: { x: string; y: number }[];
};

export function ChartCard({ title, subtitle, total, avg, peak, color, type, data }: ChartCardProps) {
  // SVG gradient ids cannot contain spaces/special chars, otherwise the fill
  // reference breaks and Recharts falls back to a solid black area.
  const gid = "g-" + title.replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className="rounded-card bg-white shadow-card p-5 flex flex-col gap-3">
      <div>
        <div className="font-semibold tracking-tight">{title}</div>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-3 text-xs num" style={{ color }}>
        <span>Total: {total.toLocaleString()}</span>
        <span>Avg: {avg}/day</span>
        <span>Peak: {peak}</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          {type === "area" ? (
            <AreaChart data={data} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#F1ECE3" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E8E5E1", fontSize: 12 }} labelStyle={{ color: "#6B7280" }} />
              <Area type="monotone" dataKey="y" stroke={color} strokeWidth={2} fill={`url(#${gid})`} fillOpacity={1} />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#F1ECE3" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E8E5E1", fontSize: 12 }} labelStyle={{ color: "#6B7280" }} />
              <Line type="monotone" dataKey="y" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
