/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  type CanHandle,
  type Event,
  type ReadEvent,
} from '@event-driven-io/emmett';
import type { Database } from 'firebase-admin/database';
import {
  type RealtimeDBReadEventMetadata,
  type RealtimeDBReadModel,
  type RealtimeDBReadModelMetadata,
} from './realtimeDBProjection';

// Helper function to convert BigInt values to strings for Firebase serialization
// Also removes undefined values as Firebase doesn't accept them
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
      // Skip undefined values - Firebase doesn't accept them
      if (value !== undefined) {
        result[key] = serializeForFirebase(value);
      }
    }
    return result;
  }

  return obj;
};

export type RealtimeDBWithNotNullDocumentEvolve<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> =
  | ((
      document: Doc,
      event: ReadEvent<EventType, EventMetaDataType>,
    ) => Doc | null)
  | ((document: Doc, event: ReadEvent<EventType>) => Promise<Doc | null>);

export type RealtimeDBWithNullableDocumentEvolve<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> =
  | ((
      document: Doc | null,
      event: ReadEvent<EventType, EventMetaDataType>,
    ) => Doc | null)
  | ((
      document: Doc | null,
      event: ReadEvent<EventType>,
    ) => Promise<Doc | null>);

export type RealtimeDBMultiStreamProjectionOptions<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = {
  canHandle: CanHandle<EventType>;
  collectionName: string;
  getDocumentId: (event: ReadEvent<EventType, EventMetaDataType>) => string;
  schemaVersion?: number;
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

export type RealtimeDBMultiStreamProjectionHandler<
  EventType extends Event = Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = {
  canHandle: CanHandle<EventType>;
  handle: (
    events: ReadEvent<EventType, EventMetaDataType>[],
    context: { database: Database },
  ) => Promise<void>;
};

export const realtimeDBMultiStreamProjection = <
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
>(
  options: RealtimeDBMultiStreamProjectionOptions<
    Doc,
    EventType,
    EventMetaDataType
  >,
): RealtimeDBMultiStreamProjectionHandler<EventType, EventMetaDataType> => {
  const { collectionName, getDocumentId, canHandle } = options;
  const schemaVersion = options.schemaVersion ?? 1;

  return {
    canHandle,
    handle: async (events, { database }) => {
      // Group events by document ID
      const eventsByDocId = new Map<
        string,
        Array<ReadEvent<EventType, EventMetaDataType>>
      >();

      for (const event of events) {
        const docId = getDocumentId(event);
        const docEvents = eventsByDocId.get(docId) ?? [];
        docEvents.push(event);
        eventsByDocId.set(docId, docEvents);
      }

      // Process each document
      for (const [docId, docEvents] of eventsByDocId) {
        const docRef = database.ref(`${collectionName}/${docId}`);

        // Get current document state
        const snapshot = await docRef.once('value');
        const currentDocWithMetadata =
          snapshot.val() as RealtimeDBReadModel<Doc> | null;

        // Strip _metadata from current document to get clean state
        const currentDoc: Doc | null = currentDocWithMetadata
          ? (({ _metadata, ...rest }) => rest as Doc)(currentDocWithMetadata)
          : null;

        // Evolve document state with events
        let state: Doc | null =
          'initialState' in options
            ? (currentDoc ?? options.initialState())
            : currentDoc;

        let lastStreamPosition: bigint | undefined;
        let lastStreamName: string | undefined;

        for (const event of docEvents) {
          state = await options.evolve(state as Doc, event);
          lastStreamPosition = event.metadata.streamPosition;
          lastStreamName = event.metadata.streamName;
        }

        // Create metadata
        const metadata: RealtimeDBReadModelMetadata = {
          streamId: lastStreamName ?? docId,
          name: collectionName,
          schemaVersion,
          streamPosition: lastStreamPosition ?? 0n,
        };

        const projection: RealtimeDBReadModel<Doc> | null =
          state !== null
            ? {
                ...state,
                _metadata: metadata,
              }
            : null;

        // Write to Realtime Database (serialize BigInt values to strings)
        await docRef.set(serializeForFirebase(projection));
      }
    },
  };
};

export type RealtimeDBSingleStreamProjectionOptions<
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
> = {
  canHandle: CanHandle<EventType>;
  collectionName: string;
  getDocumentId?: (event: ReadEvent<EventType, EventMetaDataType>) => string;
  schemaVersion?: number;
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

export const realtimeDBSingleStreamProjection = <
  Doc extends Record<string, unknown>,
  EventType extends Event,
  EventMetaDataType extends
    RealtimeDBReadEventMetadata = RealtimeDBReadEventMetadata,
>(
  options: RealtimeDBSingleStreamProjectionOptions<
    Doc,
    EventType,
    EventMetaDataType
  >,
): RealtimeDBMultiStreamProjectionHandler<EventType, EventMetaDataType> => {
  return realtimeDBMultiStreamProjection<Doc, EventType, EventMetaDataType>({
    ...options,
    getDocumentId:
      options.getDocumentId ?? ((event) => event.metadata.streamName),
  });
};
