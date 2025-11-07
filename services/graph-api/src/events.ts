import { createPubSub, topics, PubSub } from "@omnisonic/pubsub";

type EntityPayload = { id: string };
type CyclePayload = { id: string };

const pubsub: PubSub = createPubSub();

export function publishWorkUpdated(workId: string) {
  return pubsub.publish(topics.workUpdated(workId), { id: workId } satisfies EntityPayload);
}

export function publishRecordingUpdated(recordingId: string) {
  return pubsub.publish(topics.recordingUpdated(recordingId), { id: recordingId } satisfies EntityPayload);
}

export function publishLedgerEntryCreated(cycleId: string | null, entryId: string) {
  const payload = { id: entryId };
  const topic = topics.ledgerEntryCreated(cycleId);
  return pubsub.publish(topic, payload);
}

export function publishCycleCheckpointClosed(cycleId: string) {
  return pubsub.publish(topics.cycleCheckpointClosed(cycleId), { id: cycleId } satisfies CyclePayload);
}

export const subscriptions = {
  workUpdated: (workId: string) => pubsub.subscribe<EntityPayload>(topics.workUpdated(workId)),
  recordingUpdated: (recordingId: string) =>
    pubsub.subscribe<EntityPayload>(topics.recordingUpdated(recordingId)),
  ledgerEntryCreated: (cycleId?: string | null) =>
    pubsub.subscribe<{ id: string }>(topics.ledgerEntryCreated(cycleId)),
  cycleCheckpointClosed: (cycleId?: string | null) =>
    pubsub.subscribe<CyclePayload>(topics.cycleCheckpointClosed(cycleId))
};

export function shutdownPubSub() {
  return pubsub.close();
}
