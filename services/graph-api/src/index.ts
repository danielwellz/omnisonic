import { createServer } from "http";
import { createYoga, createSchema } from "graphql-yoga";
import { prisma } from "@db/client";
import { isrcSchema, iswcSchema } from "@schemas/identifiers";
import { merkleRoot } from "@omnisonic/royalty-ledger";

function normalizeIsrc(value?: string | null, context?: string) {
  if (!value) return null;
  const result = isrcSchema.safeParse(value);
  if (!result.success) {
    console.warn(`[graph-api] Invalid ISRC${context ? ` for ${context}` : ""}:`, value);
    return null;
  }
  return result.data;
}

function normalizeIswc(value?: string | null, context?: string) {
  if (!value) return null;
  const result = iswcSchema.safeParse(value);
  if (!result.success) {
    console.warn(`[graph-api] Invalid ISWC${context ? ` for ${context}` : ""}:`, value);
    return null;
  }
  return result.data;
}

function decimalToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : null;
  if (typeof value === "object" && value && "toString" in value) {
    return (value as { toString: () => string }).toString();
  }
  return null;
}

async function fetchLedgerEntries(cycleId: string) {
  return prisma.ledgerEntry.findMany({
    where: { cycleId },
    orderBy: { id: "asc" }
  });
}

const typeDefs = /* GraphQL */ `
  type Work {
    id: ID!
    title: String!
    description: String
    genres: [String!]!
    iswc: String
    recordings: [Recording!]!
    contributors: [Contributor!]!
    splits: [Split!]!
    licenses: [License!]!
    createdAt: String!
    updatedAt: String!
  }

  type Recording {
    id: ID!
    title: String!
    work: Work!
    isrc: String
    durationSeconds: Int!
    primaryArtist: String!
    releasedAt: String
    contributors: [Contributor!]!
    createdAt: String!
    updatedAt: String!
  }

  type Contributor {
    id: ID!
    name: String!
    roles: [String!]!
    createdAt: String!
    updatedAt: String!
  }

  type Split {
    id: ID!
    sharePercent: Float!
    role: String!
    contributor: Contributor!
    work: Work!
    createdAt: String!
  }

  type License {
    id: ID!
    licensee: String!
    territory: String!
    rightsType: String!
    effectiveFrom: String!
    expiresOn: String
    work: Work!
  }

  type LedgerEntry {
    id: ID!
    eventId: ID!
    workId: ID
    contributorId: ID
    cycleId: ID
    amount: String!
    currency: String!
    direction: String!
    description: String
    createdAt: String!
  }

  type CycleCheckpoint {
    id: ID!
    cycleNumber: Int!
    currency: String!
    totalAmount: String!
    merkleRoot: String!
    computedMerkleRoot: String!
    closedAt: String!
    createdAt: String!
    ledgerEntries: [LedgerEntry!]!
  }

  type Query {
    work(id: ID!): Work
    recording(id: ID!): Recording
    cycleCheckpoint(id: ID!): CycleCheckpoint
    cycleCheckpoints(limit: Int = 20, offset: Int = 0): [CycleCheckpoint!]!
  }

  input RecordingUpsertInput {
    isrc: String!
    title: String!
    primaryArtist: String!
    workId: ID
    durationSeconds: Int
    releasedAt: String
  }

  type Mutation {
    upsertRecording(input: RecordingUpsertInput!): Recording!
  }
`;

const schema = createSchema({
  typeDefs,
  resolvers: {
    Query: {
      work: async (_parent, args: { id: string }) =>
        prisma.work.findUnique({
          where: { id: args.id },
          include: {
            recordings: true,
            contributions: { include: { contributor: true } }
          }
        }),
      recording: async (_parent, args: { id: string }) =>
        prisma.recording.findUnique({
          where: { id: args.id },
          include: {
            work: {
              include: {
                recordings: true,
                contributions: { include: { contributor: true } }
              }
            }
          }
        }),
      cycleCheckpoint: async (_parent, args: { id: string }) =>
        prisma.cycleCheckpoint.findUnique({
          where: { id: args.id },
          include: {
            ledgerEntries: {
              orderBy: { id: "asc" }
            }
          }
        }),
      cycleCheckpoints: async (
        _parent,
        args: { limit?: number; offset?: number }
      ) =>
        prisma.cycleCheckpoint.findMany({
          orderBy: { cycleNumber: "desc" },
          skip: args.offset ?? 0,
          take: Math.min(args.limit ?? 20, 100)
        })
    },
    Mutation: {
      upsertRecording: async (_parent, args: { input: any }) => {
        const isrc = normalizeIsrc(args.input.isrc, "mutation.upsertRecording");
        if (!isrc) {
          throw new Error("Invalid ISRC");
        }

        const title = String(args.input.title ?? "").trim();
        const primaryArtist = String(args.input.primaryArtist ?? "").trim();
        if (!title || !primaryArtist) {
          throw new Error("Title and primaryArtist are required");
        }

        const rawDuration = Number(args.input.durationSeconds);
        const durationSecondsValue = Number.isFinite(rawDuration)
          ? Math.max(0, Math.trunc(rawDuration))
          : null;

        const releasedAt = args.input.releasedAt ? new Date(args.input.releasedAt) : null;
        if (releasedAt && Number.isNaN(releasedAt.valueOf())) {
          throw new Error("Invalid releasedAt date");
        }

        const existing = await prisma.recording.findUnique({
          where: { isrc },
          include: {
            work: {
              include: {
                recordings: true,
                contributions: { include: { contributor: true } }
              }
            }
          }
        });

        if (existing) {
          const updated = await prisma.recording.update({
            where: { id: existing.id },
            data: {
              title,
              primaryArtist,
              durationSeconds: durationSecondsValue ?? existing.durationSeconds,
              releasedAt: releasedAt ?? existing.releasedAt ?? undefined
            },
            include: {
              work: {
                include: {
                  recordings: true,
                  contributions: { include: { contributor: true } }
                }
              }
            }
          });
          return updated;
        }

        const targetWorkId = args.input.workId ?? null;
        let workId = targetWorkId;

        if (workId) {
          const work = await prisma.work.findUnique({ where: { id: workId } });
          if (!work) {
            throw new Error(`Work ${workId} not found`);
          }
        } else {
          const newWork = await prisma.work.create({
            data: {
              title,
              description: "Imported via ingest",
              genres: []
            }
          });
          workId = newWork.id;
        }

        const created = await prisma.recording.create({
          data: {
            isrc,
            title,
            primaryArtist,
            durationSeconds: durationSecondsValue ?? 0,
            releasedAt: releasedAt ?? undefined,
            workId: workId!
          },
          include: {
            work: {
              include: {
                recordings: true,
                contributions: { include: { contributor: true } }
              }
            }
          }
        });
        return created;
      }
    },
    Work: {
      recordings: (work: any) => work.recordings ?? prisma.recording.findMany({ where: { workId: work.id } }),
      iswc: (work: any) => normalizeIswc(work.iswc, `work:${work.id}`),
      contributors: async (work: any) => {
        const contributions =
          work.contributions ??
          (await prisma.contribution.findMany({
            where: { workId: work.id },
            include: { contributor: true }
          }));
        const unique = new Map(
          contributions
            .map((entry: any) => entry.contributor)
            .filter(Boolean)
            .map((contributor: any) => [contributor.id, contributor])
        );
        return Array.from(unique.values());
      },
      splits: (work: any) =>
        work.contributions ??
        prisma.contribution.findMany({
          where: { workId: work.id },
          include: { contributor: true, work: true }
        }),
      licenses: () => [],
      createdAt: (work: any) => work.createdAt.toISOString(),
      updatedAt: (work: any) => work.updatedAt.toISOString()
    },
    Recording: {
      isrc: (recording: any) => normalizeIsrc(recording.isrc, `recording:${recording.id}`),
      work: async (recording: any) =>
        recording.work ??
        prisma.work.findUnique({
          where: { id: recording.workId },
          include: {
            recordings: true,
            contributions: { include: { contributor: true } }
          }
        }),
      contributors: async (recording: any) => {
        const contributions = await prisma.contribution.findMany({
          where: { workId: recording.workId },
          include: { contributor: true }
        });
        const unique = new Map(
          contributions
            .map((entry: any) => entry.contributor)
            .filter(Boolean)
            .map((contributor: any) => [contributor.id, contributor])
        );
        return Array.from(unique.values());
      },
      createdAt: (recording: any) => recording.createdAt.toISOString(),
      updatedAt: (recording: any) => recording.updatedAt.toISOString()
    },
    Contributor: {
      createdAt: (contributor: any) => contributor.createdAt.toISOString(),
      updatedAt: (contributor: any) => contributor.updatedAt.toISOString()
    },
    Split: {
      sharePercent: (contribution: any) => contribution.pctShare,
      contributor: async (contribution: any) =>
        contribution.contributor ??
        prisma.contribution
          .findUnique({ where: { id: contribution.id }, include: { contributor: true } })
          .then((record) => record?.contributor ?? null),
      work: async (contribution: any) =>
        contribution.work ??
        prisma.work.findUnique({
          where: { id: contribution.workId },
          include: {
            recordings: true,
            contributions: { include: { contributor: true } }
          }
        }),
      createdAt: (contribution: any) => contribution.createdAt.toISOString()
    },
    License: {
      id: () => "",
      licensee: () => "",
      territory: () => "",
      rightsType: () => "",
      effectiveFrom: () => new Date(0).toISOString(),
      expiresOn: () => null,
      work: () => null
    },
    CycleCheckpoint: {
      totalAmount: (checkpoint: any) => decimalToString(checkpoint.totalAmount) ?? "0",
      closedAt: (checkpoint: any) => checkpoint.closedAt.toISOString(),
      createdAt: (checkpoint: any) => checkpoint.createdAt.toISOString(),
      ledgerEntries: async (checkpoint: any) =>
        checkpoint.ledgerEntries ?? fetchLedgerEntries(checkpoint.id),
      computedMerkleRoot: async (checkpoint: any) => {
        const entries = checkpoint.ledgerEntries ?? (await fetchLedgerEntries(checkpoint.id));
        if (!entries.length) {
          return "";
        }
        const leaves = entries.map((entry: any) =>
          JSON.stringify({
            id: entry.id,
            eventId: entry.eventId,
            workId: entry.workId ?? null,
            contributorId: entry.contributorId ?? null,
            amount: decimalToString(entry.amount) ?? "0",
            currency: entry.currency,
            direction: entry.direction,
            description: entry.description ?? "",
            createdAt: entry.createdAt.toISOString()
          })
        );
        return merkleRoot(leaves);
      }
    },
    LedgerEntry: {
      amount: (entry: any) => decimalToString(entry.amount) ?? "0",
      createdAt: (entry: any) => entry.createdAt.toISOString()
    }
  }
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql"
});

const server = createServer(yoga);
const port = Number.parseInt(process.env.PORT ?? "4000", 10);

server.listen(port, () => {
  console.log(`Graph API ready at http://localhost:${port}/graphql`);
});
