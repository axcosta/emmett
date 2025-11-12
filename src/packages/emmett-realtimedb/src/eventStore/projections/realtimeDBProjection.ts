import {
  type CanHandle,
  type Event,
  type ProjectionDefinition,
  type ProjectionHandler,
  type ReadEvent,
  type ReadEventMetadataWithoutGlobalPosition,
} from '@event-driven-io/emmett';
import type { Database, Reference } from 'firebase-admin/database';

// Helper function to convert BigInt values to strings for Firebase serialization
const serializeForFirebase = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeForFirebase);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeForFirebase(value);
    }
    return result;
  }

  return obj;
};

export const RealtimeDBDefaultProjectionName = '_default';

export type RealtimeDBReadEventMetadata =
  ReadEventMetadataWithoutGlobalPosition<bigint>;

export type RealtimeDBReadModelMetadata = {
  streamId: string;
  name: string;
  schemaVersion: number;
  streamPosition: bigint;
};

export type RealtimeDBReadModel<Doc extends Record<string, unknown> = Record<string, unknown>> = Doc & {
  _metadata: RealtimeDBReadModelMetadata;
};

export type RealtimeDBProjectionHandlerContext<
  EventType extends Event = Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = {
  document: RealtimeDBReadModel | null;
  streamId: string;
  reference: Reference;
  database: Database;
};

export type RealtimeDBProjectionHandler<
  EventType extends Event = Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = ProjectionHandler<
  EventType,
  EventMetaDataType,
  RealtimeDBProjectionHandlerContext
>;

export type RealtimeDBProjectionDefinition<
  EventType extends Event = Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = ProjectionDefinition<
  EventType,
  EventMetaDataType,
  RealtimeDBProjectionHandlerContext
> & { name: string };

export type ProjectionHandlerOptions<
  EventType extends Event = Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = {
  readModels: Record<string, RealtimeDBReadModel>;
  events: Array<ReadEvent<EventType, EventMetaDataType>>;
  projections: RealtimeDBProjectionDefinition<EventType, EventMetaDataType>[];
  streamId: string;
  reference: Reference;
  database: Database;
};

export const handleProjections = async <
  EventType extends Event = Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
>(
  options: ProjectionHandlerOptions<EventType, EventMetaDataType>,
): Promise<void> => {
  const {
    events,
    projections: allProjections,
    streamId,
    reference,
    database,
    readModels,
  } = options;

  const eventTypes = events.map((e) => e.type);

  const projections = allProjections.filter((p) =>
    p.canHandle.some((type) => eventTypes.includes(type)),
  );

  for (const projection of projections) {
    await projection.handle(events, {
      document: readModels[projection.name] ?? null,
      streamId,
      reference,
      database,
    });
  }
};

export type RealtimeDBWithNotNullDocumentEvolve<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> =
  | ((
      document: Doc,
      event: ReadEvent<EventType, EventMetaDataType>,
    ) => Doc | null)
  | ((document: Doc, event: ReadEvent<EventType>) => Promise<Doc | null>);

export type RealtimeDBWithNullableDocumentEvolve<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> =
  | ((
      document: Doc | null,
      event: ReadEvent<EventType, EventMetaDataType>,
    ) => Doc | null)
  | ((
      document: Doc | null,
      event: ReadEvent<EventType>,
    ) => Promise<Doc | null>);

export type RealtimeDBProjectionOptions<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = {
  name?: string;
  schemaVersion?: number;
  canHandle: CanHandle<EventType>;
} & (
  | {
      evolve: RealtimeDBWithNullableDocumentEvolve<
        Doc,
        EventType,
        EventMetaDataType
      >;
    }
  | {
      evolve: RealtimeDBWithNotNullDocumentEvolve<
        Doc,
        EventType,
        EventMetaDataType
      >;
      initialState: () => Doc;
    }
);

export const realtimeDBProjection = <
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
>(
  options: RealtimeDBProjectionOptions<Doc, EventType, EventMetaDataType>,
): RealtimeDBProjectionDefinition => {
  const projectionName = options.name ?? RealtimeDBDefaultProjectionName;
  const schemaVersion = options.schemaVersion ?? 1;

  return {
    name: projectionName,
    canHandle: options.canHandle,
    handle: async (events, { document, reference, streamId }) => {
      if (events.length === 0) return;

      let state =
        'initialState' in options
          ? (document ?? options.initialState())
          : document;

      for (const event of events) {
        state = await options.evolve(
          state as Doc,
          event as ReadEvent<EventType, EventMetaDataType>,
        );
      }

      const metadata: RealtimeDBReadModelMetadata = {
        streamId,
        name: projectionName,
        schemaVersion,
        streamPosition: events[events.length - 1]!.metadata.streamPosition,
      };

      const projection =
        state !== null
          ? {
              ...state,
              _metadata: metadata,
            }
          : null;

      // Write to Realtime Database (serialize BigInt values to strings)
      await reference
        .child(`projections/${projectionName}`)
        .set(serializeForFirebase(projection));
    },
  };
};
