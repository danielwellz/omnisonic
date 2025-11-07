"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GenreTrendPoint } from "@/lib/analytics-types";

interface GenreTrendsChartProps {
  data: GenreTrendPoint[];
}

const palette = [
  "#34d399",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#fde047",
  "#4ade80",
  "#93c5fd"
];

export function GenreTrendsChart({ data }: GenreTrendsChartProps) {
  const { chartData, genres } = useMemo(() => {
    const days = Array.from(new Set(data.map((entry) => entry.day))).sort();
    const genreKeys = Array.from(new Set(data.map((entry) => entry.genre)));
    const rows = days.map((day) => {
      const base: Record<string, string | number> = { day };
      for (const genre of genreKeys) {
        const match = data.find((entry) => entry.day === day && entry.genre === genre);
        base[genre] = match ? match.mentions : 0;
      }
      return base;
    });
    return { chartData: rows, genres: genreKeys };
  }, [data]);

  if (!chartData.length) {
    return <p className="text-sm text-gray-400">No genre activity detected for this period.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="day" tickFormatter={(value) => new Date(value).toLocaleDateString()} stroke="#9ca3af" />
          <YAxis hide />
          <Tooltip
            formatter={(value: number, name) => [`${(value as number).toFixed(0)} mentions`, name as string]}
            labelFormatter={(value) => new Date(value).toLocaleDateString()}
            contentStyle={{ backgroundColor: "#111827", borderColor: "#1f2937", borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {genres.map((genre, index) => (
            <Bar key={genre} dataKey={genre} stackId="genres" fill={palette[index % palette.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
