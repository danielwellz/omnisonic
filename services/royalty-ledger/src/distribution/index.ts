import { computeAmount } from "../index";

export interface SplitShare {
  id: string;
  workId: string;
  contributorId: string;
  pctShare: number; // percentage (0-100)
  role?: string;
}

export interface UsageEventInput {
  eventId: string;
  workId: string;
  recordingId: string;
  currency: string;
  grossAmount: number | string;
  occurredAt: string;
  splits: SplitShare[];
}

export interface JournalEntry {
  entryId: string;
  eventId: string;
  workId: string;
  contributorId: string;
  amount: string;
  currency: string;
  direction: "credit" | "debit";
  role?: string;
  meta?: Record<string, unknown>;
}

function sumShares(splits: SplitShare[]): number {
  return splits.reduce((total, split) => total + split.pctShare, 0);
}

function toBasisPoints(percentage: number): number {
  return Math.round(percentage * 100);
}

export function allocateUsageEvent(event: UsageEventInput): JournalEntry[] {
  if (!event.splits.length) {
    return [];
  }

  const totalShares = sumShares(event.splits);
  if (totalShares <= 0) {
    throw new Error("Total share percentage must be positive");
  }

  const journal: JournalEntry[] = [];
  const precision = 6;
  const debitAmount = computeAmount({
    gross: event.grossAmount,
    share: 10_000,
    shareType: "basisPoints",
    precision
  });
  const debitScaled = BigInt(debitAmount.replace(".", ""));
  let distributedScaled = 0n;

  event.splits.forEach((split, index) => {
    const shareBps = toBasisPoints(split.pctShare);
    const amount = computeAmount({
      gross: event.grossAmount,
      share: shareBps,
      shareType: "basisPoints",
      precision
    });
    const entry: JournalEntry = {
      entryId: `${event.eventId}:${split.id}`,
      eventId: event.eventId,
      workId: event.workId,
      contributorId: split.contributorId,
      amount,
      currency: event.currency,
      direction: "credit",
      role: split.role
    };

    journal.push(entry);
    const scaled = BigInt(amount.replace(".", ""));
    distributedScaled += scaled;

    if (index === event.splits.length - 1) {
      const delta = debitScaled - distributedScaled;
      if (delta !== 0n) {
        const last = journal[journal.length - 1];
        const corrected = (BigInt(last.amount.replace(".", "")) + delta).toString();
        const integerPart = corrected.slice(0, corrected.length - precision) || "0";
        const fractionalPart = corrected.slice(-precision).padStart(precision, "0");
        last.amount = `${integerPart}.${fractionalPart}`.replace(/\.$/, "");
      }
    }
  });

  const debitEntry: JournalEntry = {
    entryId: `${event.eventId}:debit`,
    eventId: event.eventId,
    workId: event.workId,
    contributorId: "platform",
    amount: debitAmount,
    currency: event.currency,
    direction: "debit",
    meta: {
      recordingId: event.recordingId,
      occurredAt: event.occurredAt
    }
  };

  return [debitEntry, ...journal];
}
