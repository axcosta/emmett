/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Firestore } from '@google-cloud/firestore';
import {
  STREAM_DOES_NOT_EXIST,
  type Event,
  type ReadEvent,
  type ReadEventMetadataWithGlobalPosition,
  type ReadStreamOptions,
  type ReadStreamResult,
} from '@event-driven-io/emmett';

export const readStream = async <EventType extends Event>(
  firestore: Firestore,
  streamName: string,
  options: ReadStreamOptions = {},
  streamsCollectionName: string,
): Promise<
  ReadStreamResult<EventType, ReadEventMetadataWithGlobalPosition>
> => {
  const { from, to, maxCount } = options;

  // Reference to stream document
  const streamRef = firestore.collection(streamsCollectionName).doc(streamName);

  // Check if stream exists
  const streamDoc = await streamRef.get();

  if (!streamDoc.exists) {
    return {
      currentStreamVersion: STREAM_DOES_NOT_EXIST,
      events: [],
    };
  }

  // Build query for events subcollection
  let query = streamRef.collection('events').orderBy('__name__', 'asc');

  // Apply version filters using document IDs
  if (from !== undefined && typeof from === 'bigint') {
    const fromId = String(from).padStart(10, '0');
    query = query.where('__name__', '>=', fromId);
  }

  if (to !== undefined && typeof to === 'bigint') {
    const toId = String(to).padStart(10, '0');
    query = query.where('__name__', '<=', toId);
  }

  // Apply limit
  if (maxCount !== undefined) {
    query = query.limit(maxCount);
  }

  // Execute query
  const snapshot = await query.get();

  if (snapshot.empty) {
    // Stream exists but no events match the query
    const currentVersion = BigInt(streamDoc.data()!.version as number);
    return {
      currentStreamVersion: currentVersion,
      events: [],
    };
  }

  // Map documents to events
  const events: ReadEvent<EventType, ReadEventMetadataWithGlobalPosition>[] =
    snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        type: data.type,
        data: data.data,
        metadata: {
          ...data.metadata,
          streamName: streamName,
          streamPosition: BigInt(data.streamVersion),
          globalPosition: BigInt(data.globalPosition),
        },
      } as ReadEvent<EventType, ReadEventMetadataWithGlobalPosition>;
    });

  // Get current stream version from metadata
  const currentStreamVersion = BigInt(streamDoc.data()!.version as number);

  return {
    currentStreamVersion,
    events,
  };
};
