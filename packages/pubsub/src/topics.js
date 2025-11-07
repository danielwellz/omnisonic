export const topics = {
    workUpdated: (workId) => `work.updated.${workId}`,
    recordingUpdated: (recordingId) => `recording.updated.${recordingId}`,
    ledgerEntryCreated: (cycleId) => cycleId ? `ledger.entry.${cycleId}` : "ledger.entry.all",
    cycleCheckpointClosed: (cycleId) => cycleId ? `cycle.checkpoint.${cycleId}` : "cycle.checkpoint.all",
    licenseUpdated: (workId) => `license.updated.${workId}`
};
