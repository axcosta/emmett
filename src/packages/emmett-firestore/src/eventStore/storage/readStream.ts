import {
  STREAM_DOES_NOT_EXIST,
  type Event,
  type ReadEvent,
  type ReadEventMetadataWithGlobalPosition,
  type ReadStreamOptions,
  type ReadStreamResult,
} from '@event-driven-io/emmett';
import type { Firestore } from '@google-cloud/firestore';

export const readStream = async <EventType extends Event>(
  firestore: Firestore,
  streamName: string,
  options?: ReadStreamOptions<bigint>,
  streamsCollectionName: string = 'streams',
): Promise<
  ReadStreamResult<EventType, ReadEventMetadataWithGlobalPosition>
> => {
  // Extract options safely
  const from =
    options && 'from' in options
      ? (options as { from: bigint }).from
      : undefined;
  const to =
    options && 'to' in options ? (options as { to: bigint }).to : undefined;
  const maxCount =
    options && 'maxCount' in options
      ? (options as { maxCount?: bigint }).maxCount
      : undefined;

  // Reference to stream document
  const streamRef = firestore.collection(streamsCollectionName).doc(streamName);

  // Check if stream exists
  const streamDoc = await streamRef.get();

  if (!streamDoc.exists) {
    return {
      currentStreamVersion: STREAM_DOES_NOT_EXIST as unknown as bigint,
      events: [],
      streamExists: false,
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
    query = query.limit(Number(maxCount));
  }

  // Execute query
  const snapshot = await query.get();

  if (snapshot.empty) {
    // Stream exists but no events match the query
    const streamData = streamDoc.data();
    const currentVersion = BigInt((streamData?.version as number) ?? 0);
    return {
      currentStreamVersion: currentVersion,
      events: [],
      streamExists: true,
    };
  }

  // Map documents to events
  const events: ReadEvent<EventType, ReadEventMetadataWithGlobalPosition>[] =
    snapshot.docs.map(
      (doc): ReadEvent<EventType, ReadEventMetadataWithGlobalPosition> => {
        const data = doc.data() as {
          type: string;
          data: unknown;
          metadata: Record<string, unknown>;
          streamVersion: number;
          globalPosition: number;
        };
        return {
          type: data.type,
          data: data.data,
          metadata: {
            ...data.metadata,
            streamName,
            streamPosition: BigInt(data.streamVersion),
            globalPosition: BigInt(data.globalPosition),
          },
        } as ReadEvent<EventType, ReadEventMetadataWithGlobalPosition>;
      },
    );

  // Get current stream version from metadata
  const streamData = streamDoc.data();
  const currentStreamVersion = BigInt((streamData?.version as number) ?? 0);

  return {
    currentStreamVersion,
    events,
    streamExists: true,
  };
};
