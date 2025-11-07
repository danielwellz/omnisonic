export const topics = {
  workUpdated: (workId: string) => `work.updated.${workId}`,
  recordingUpdated: (recordingId: string) => `recording.updated.${recordingId}`,
  ledgerEntryCreated: (cycleId?: string | null) =>
    cycleId ? `ledger.entry.${cycleId}` : "ledger.entry.all",
  cycleCheckpointClosed: (cycleId?: string | null) =>
    cycleId ? `cycle.checkpoint.${cycleId}` : "cycle.checkpoint.all",
  licenseUpdated: (workId: string) => `license.updated.${workId}`
} as const;

export type TopicFactory = typeof topics;
