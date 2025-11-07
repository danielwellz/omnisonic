import Link from "next/link";
import { fetchTopEntities } from "./trends";

export default async function HomePage() {
  const data = await fetchTopEntities();

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-3xl font-semibold">Top Entities (7-day)</h2>
        <p className="text-sm text-gray-400">
          Aggregated from ClickHouse news_items and entity_links tables.
        </p>
      </section>
      <section className="rounded-lg border border-gray-800 bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-850">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-gray-400">
                  Entity Type
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-gray-400">
                  Entity ID
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wide text-gray-400">
                  Mentions
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wide text-gray-400">
                  Avg Confidence
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wide text-gray-400">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {data.map((row) => (
                <tr key={`${row.entity_type}-${row.entity_id}`}>
                  <td className="px-4 py-3 text-sm capitalize text-gray-100">{row.entity_type}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-200">{row.entity_id}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-300">{row.mentions}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-300">
                    {(row.avg_confidence * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-300">
                    {new Date(row.last_seen).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-dashed border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-300">
        <p>
          Looking for richer charts and exports? Visit the full analytics dashboard for genre momentum, source
          performance, and co-mention networks.
        </p>
        <Link
          href="/analytics"
          className="mt-4 inline-flex items-center rounded-md border border-gray-700 bg-gray-900 px-4 py-2 font-semibold text-white hover:border-gray-500"
        >
          View Analytics
        </Link>
      </section>
    </div>
  );
}
