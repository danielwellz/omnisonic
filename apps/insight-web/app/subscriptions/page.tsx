import { SubscriptionFeed } from "@/components/subscription-feed";

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-gray-100">Graph Subscriptions</h1>
      <SubscriptionFeed />
    </div>
  );
}
