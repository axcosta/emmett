/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  NO_CONCURRENCY_CHECK,
  type AggregateStreamOptions,
  type AggregateStreamResult,
  type AppendToStreamOptions,
  type AppendToStreamResult,
  type Event,
  type EventStore,
  type ReadEventMetadataWithGlobalPosition,
  type ReadStreamOptions,
  type ReadStreamResult,
} from '@event-driven-io/emmett';
import type { Firestore } from '@google-cloud/firestore';
import { aggregateStream } from './storage/aggregateStream';
import { appendToStream } from './storage/appendToStream';
import { readStream } from './storage/readStream';

export type FirestoreReadEventMetadata = ReadEventMetadataWithGlobalPosition;

export interface FirestoreEventStore
  extends EventStore<FirestoreReadEventMetadata> {
  close(): Promise<void>;
}

export type FirestoreEventStoreConfig = {
  firestore: Firestore;
  streamsCollectionName?: string;
};

export const getFirestoreEventStore = (
  config: FirestoreEventStoreConfig,
): FirestoreEventStore => {
  const { firestore, streamsCollectionName = 'streams' } = config;

  return {
    async aggregateStream<State, EventType extends Event>(
      streamName: string,
      options: AggregateStreamOptions<State, EventType>,
    ): Promise<AggregateStreamResult<State>> {
      return aggregateStream(
        firestore,
        streamName,
        options,
        streamsCollectionName,
      );
    },

    async readStream<EventType extends Event>(
      streamName: string,
      options?: ReadStreamOptions,
    ): Promise<ReadStreamResult<EventType, FirestoreReadEventMetadata>> {
      return readStream<EventType>(
        firestore,
        streamName,
        options,
        streamsCollectionName,
      );
    },

    async appendToStream<EventType extends Event>(
      streamName: string,
      events: EventType[],
      options?: AppendToStreamOptions,
    ): Promise<AppendToStreamResult> {
      return appendToStream(
        firestore,
        streamName,
        events,
        {
          ...options,
          expectedStreamVersion:
            options?.expectedStreamVersion ?? NO_CONCURRENCY_CHECK,
        },
        streamsCollectionName,
      );
    },

    async close(): Promise<void> {
      await firestore.terminate();
    },
  };
};
