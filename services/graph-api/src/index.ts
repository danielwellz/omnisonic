import { createServer } from "http";
import { createYoga, createSchema } from "graphql-yoga";
import { GraphQLScalarType, Kind, ValueNode } from "graphql";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { prisma } from "@db/client";
import { LicenseRightsType, LicenseStatus, TaggingMethod, TaggedEntityType } from "@prisma/client";
import { isrcSchema, iswcSchema } from "@schemas/identifiers";
import { merkleRoot } from "@omnisonic/royalty-ledger";
import {
  publishWorkUpdated,
  publishRecordingUpdated,
  publishLedgerEntryCreated,
  publishCycleCheckpointClosed,
  subscriptions,
  shutdownPubSub
} from "./events";
import { assertNoLicenseConflicts, buildLicensePayload } from "./licenses";

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

prisma.$use(async (params, next) => {
  const result = await next(params);
  if (params.model === "LedgerEntry" && params.action === "create" && result) {
    await publishLedgerEntryCreated(result.cycleId ?? null, result.id);
  }
  if (
    params.model === "CycleCheckpoint" &&
    params.action === "update" &&
    params.args?.data?.closedAt !== undefined &&
    result?.closedAt
  ) {
    await publishCycleCheckpointClosed(result.id);
  }
  return result;
});

const typeDefs = /* GraphQL */ `
  scalar JSON

  enum TaggedEntityType {
    artist
    work
    recording
  }

  enum TaggingMethod {
    heuristic
    fuzzy
    embedding
    hybrid
  }

  type EntityTag {
    id: ID!
    newsItemId: ID!
    entityType: TaggedEntityType!
    entityId: String!
    confidence: Float!
    method: TaggingMethod!
    matchedText: String
    createdAt: String!
  }

  input EntityTagPayloadInput {
    entityType: TaggedEntityType!
    entityId: String!
    confidence: Float!
    method: TaggingMethod = heuristic
    matchedText: String
  }

  input EntityTagBatchInput {
    newsItemId: ID!
    tags: [EntityTagPayloadInput!]!
  }

  enum LicenseStatus {
    draft
    active
    expired
    revoked
  }

  enum LicenseRightsType {
    mechanical
    performance
    synchronization
    master
  }

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
    workId: ID!
    licensee: String!
    territory: String
    rightsType: LicenseRightsType!
    effectiveFrom: String!
    expiresOn: String
    status: LicenseStatus!
    terms: JSON
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
    license(id: ID!): License
    licenses(workId: ID): [License!]!
    activeLicenses(
      workId: ID
      territory: String
      rightsType: LicenseRightsType
    ): [License!]!
    entityTags(newsItemId: ID!): [EntityTag!]!
  }

  input RecordingUpsertInput {
    isrc: String!
    title: String!
    primaryArtist: String!
    workId: ID
    durationSeconds: Int
    releasedAt: String
  }

  input LicenseInput {
    workId: ID!
    licensee: String!
    territory: String
    rightsType: LicenseRightsType!
    effectiveFrom: String!
    expiresOn: String
    terms: JSON
    status: LicenseStatus
  }

  type Mutation {
    upsertRecording(input: RecordingUpsertInput!): Recording!
    createLicense(input: LicenseInput!): License!
    updateLicense(id: ID!, input: LicenseInput!): License!
    revokeLicense(id: ID!): License!
    recordEntityTags(input: EntityTagBatchInput!): [EntityTag!]!
  }

  type Subscription {
    workUpdated(workId: ID!): Work!
    recordingUpdated(recordingId: ID!): Recording!
    ledgerEntryCreated(cycleId: ID): LedgerEntry!
    cycleCheckpointClosed(cycleId: ID): CycleCheckpoint!
  }
`;

function literalToValue(ast: ValueNode): any {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT: {
      const value: Record<string, unknown> = {};
      for (const field of ast.fields) {
        value[field.name.value] = literalToValue(field.value);
      }
      return value;
    }
    case Kind.LIST:
      return ast.values.map(literalToValue);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
}

const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: literalToValue
});

const schema = createSchema({
  typeDefs,
  resolvers: {
    JSON: JSONScalar,
    Query: {
      work: async (_parent, args: { id: string }) =>
        prisma.work.findUnique({
          where: { id: args.id },
          include: {
            recordings: true,
            contributions: { include: { contributor: true } },
            licenses: true
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
        }),
      license: (_parent, args: { id: string }) => prisma.license.findUnique({ where: { id: args.id } }),
      licenses: (_parent, args: { workId?: string }) =>
        prisma.license.findMany({
          where: args.workId ? { workId: args.workId } : {},
          orderBy: { createdAt: "desc" }
        }),
      activeLicenses: (
        _parent,
        args: { workId?: string; territory?: string | null; rightsType?: LicenseRightsType | null }
      ) =>
        prisma.license.findMany({
          where: {
            status: LicenseStatus.active,
            ...(args.workId ? { workId: args.workId } : {}),
            ...(args.territory !== undefined
              ? { territory: args.territory === "" ? null : args.territory }
              : {}),
            ...(args.rightsType
              ? { rightsType: args.rightsType as LicenseRightsType }
              : {})
          },
          orderBy: { effectiveFrom: "asc" }
        }),
      entityTags: (_parent, args: { newsItemId: string }) =>
        prisma.entityTag.findMany({
          where: { newsItemId: args.newsItemId },
          orderBy: { createdAt: "desc" }
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
          await publishRecordingUpdated(updated.id);
          await publishWorkUpdated(updated.workId);
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
        await publishRecordingUpdated(created.id);
        await publishWorkUpdated(created.workId);
        return created;
      },
      createLicense: async (_parent, args: { input: any }) => {
        const payload = buildLicensePayload(args.input);
        await assertNoLicenseConflicts(payload);
        const license = await prisma.license.create({
          data: {
            workId: payload.workId,
            licensee: payload.licensee,
            territory: payload.territory,
            rightsType: payload.rightsType,
            effectiveFrom: payload.effectiveFrom,
            expiresOn: payload.expiresOn ?? undefined,
            terms: payload.terms,
            status: payload.status
          }
        });
        await publishWorkUpdated(license.workId);
        return license;
      },
      updateLicense: async (_parent, args: { id: string; input: any }) => {
        const existing = await prisma.license.findUnique({ where: { id: args.id } });
        if (!existing) {
          throw new Error("License not found");
        }
        const payload = buildLicensePayload(
          {
            ...args.input,
            status: args.input.status ?? existing.status
          },
          { allowAllStatuses: true }
        );
        await assertNoLicenseConflicts(payload, args.id);
        const license = await prisma.license.update({
          where: { id: args.id },
          data: {
            workId: payload.workId,
            licensee: payload.licensee,
            territory: payload.territory,
            rightsType: payload.rightsType,
            effectiveFrom: payload.effectiveFrom,
            expiresOn: payload.expiresOn ?? undefined,
            terms: payload.terms,
            status: payload.status
          }
        });
        await publishWorkUpdated(license.workId);
        return license;
      },
      revokeLicense: async (_parent, args: { id: string }) => {
        const license = await prisma.license.update({
          where: { id: args.id },
          data: {
            status: LicenseStatus.revoked,
            expiresOn: new Date()
          }
        });
        await publishWorkUpdated(license.workId);
        return license;
      },
      recordEntityTags: async (
        _parent,
        args: {
          input: {
            newsItemId: string;
            tags: Array<{
              entityType: "artist" | "work" | "recording";
              entityId: string;
              confidence: number;
              method?: "heuristic" | "fuzzy" | "embedding" | "hybrid";
              matchedText?: string | null;
            }>;
          };
        }
      ) => {
        const { newsItemId, tags } = args.input;
        if (!newsItemId) {
          throw new Error("newsItemId is required");
        }

        await prisma.entityTag.deleteMany({ where: { newsItemId } });

        if (!tags || tags.length === 0) {
          return [];
        }

        if (tags.length > 5000) {
          throw new Error("Too many tags submitted; limit is 5000");
        }

        const sanitized = tags.map((tag) => ({
          newsItemId,
          entityType: tag.entityType as TaggedEntityType,
          entityId: tag.entityId,
          confidence: Number.isFinite(tag.confidence)
            ? Math.max(0, Math.min(tag.confidence, 1))
            : 0,
          method: (tag.method ?? "heuristic") as TaggingMethod,
          matchedText: tag.matchedText ?? null
        }));

        await prisma.entityTag.createMany({ data: sanitized });

        return prisma.entityTag.findMany({
          where: { newsItemId },
          orderBy: { createdAt: "desc" }
        });
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
      licenses: (work: any) =>
        work.licenses ??
        prisma.license.findMany({
          where: { workId: work.id },
          orderBy: { createdAt: "desc" }
        }),
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
      territory: (license: any) => license.territory ?? null,
      rightsType: (license: any) => license.rightsType,
      effectiveFrom: (license: any) => license.effectiveFrom.toISOString(),
      expiresOn: (license: any) => (license.expiresOn ? license.expiresOn.toISOString() : null),
      status: (license: any) => license.status,
      terms: (license: any) => license.terms ?? null,
      work: (license: any) =>
        license.work ??
        prisma.work.findUnique({
          where: { id: license.workId },
          include: {
            recordings: true,
            contributions: { include: { contributor: true } },
            licenses: true
          }
        })
    },
    EntityTag: {
      createdAt: (tag: any) => tag.createdAt.toISOString()
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
    },
    Subscription: {
      workUpdated: {
        subscribe: (_parent: unknown, args: { workId: string }) => subscriptions.workUpdated(args.workId),
        resolve: async (payload: { id: string }) => {
          const work = await prisma.work.findUnique({
            where: { id: payload.id },
            include: {
              recordings: true,
              contributions: { include: { contributor: true } },
              licenses: true
            }
          });
          if (!work) {
            throw new Error("Work not found");
          }
          return work;
        }
      },
      recordingUpdated: {
        subscribe: (_parent: unknown, args: { recordingId: string }) =>
          subscriptions.recordingUpdated(args.recordingId),
        resolve: async (payload: { id: string }) => {
          const recording = await prisma.recording.findUnique({
            where: { id: payload.id },
            include: {
              work: {
                include: {
                  recordings: true,
                  contributions: { include: { contributor: true } }
                }
              }
            }
          });
          if (!recording) {
            throw new Error("Recording not found");
          }
          return recording;
        }
      },
      ledgerEntryCreated: {
        subscribe: (_parent: unknown, args: { cycleId?: string | null }) =>
          subscriptions.ledgerEntryCreated(args.cycleId ?? null),
        resolve: async (payload: { id: string }) => {
          const entry = await prisma.ledgerEntry.findUnique({ where: { id: payload.id } });
          if (!entry) {
            throw new Error("Ledger entry not found");
          }
          return entry;
        }
      },
      cycleCheckpointClosed: {
        subscribe: (_parent: unknown, args: { cycleId?: string | null }) =>
          subscriptions.cycleCheckpointClosed(args.cycleId ?? null),
        resolve: async (payload: { id: string }) => {
          const checkpoint = await prisma.cycleCheckpoint.findUnique({
            where: { id: payload.id },
            include: {
              ledgerEntries: {
                orderBy: { id: "asc" }
              }
            }
          });
          if (!checkpoint) {
            throw new Error("Checkpoint not found");
          }
          return checkpoint;
        }
      }
    }
  }
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql"
});

const httpServer = createServer(yoga);
const httpPort = Number.parseInt(process.env.PORT ?? "4000", 10);
const wsPort = Number.parseInt(process.env.GRAPH_API_WS_PORT ?? process.env.GRAPH_WS_PORT ?? "4001", 10);

const wsServer = new WebSocketServer({
  port: wsPort,
  path: yoga.graphqlEndpoint
});

const serverCleanup = useServer(
  {
    execute: (args) => args.execute,
    subscribe: (args) => args.subscribe,
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
        ...ctx,
        req: ctx.extra?.request,
        socket: ctx.extra?.socket,
        params: msg.payload
      });

      const document = parse(msg.payload.query);
      const validationErrors = validate(schema, document);
      if (validationErrors.length > 0) {
        return validationErrors;
      }

      return {
        schema,
        execute,
        subscribe,
        context: await contextFactory(),
        document,
        variables: msg.payload.variables,
        operationName: msg.payload.operationName
      };
    }
  },
  wsServer
);

httpServer.listen(httpPort, () => {
  console.log(`Graph API ready at http://localhost:${httpPort}/graphql`);
  console.log(`Subscriptions ready at ws://localhost:${wsPort}${yoga.graphqlEndpoint}`);
});

async function shutdown() {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await serverCleanup.dispose();
  wsServer.close();
  await shutdownPubSub();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Failed to shutdown graph-api", error);
        process.exit(1);
      });
  });
}
