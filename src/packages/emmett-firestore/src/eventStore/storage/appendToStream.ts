/* 
eslint-disable @typescript-eslint/no-unsafe-assignment, 
@typescript-eslint/no-unsafe-call
 */
import {
  ExpectedVersionConflictError,
  STREAM_DOES_NOT_EXIST,
  STREAM_EXISTS,
  type AppendToStreamOptions,
  type AppendToStreamResult,
  type Event,
} from '@event-driven-io/emmett';
import type { Firestore, Transaction } from '@google-cloud/firestore';

export const appendToStream = async <EventType extends Event>(
  firestore: Firestore,
  streamName: string,
  events: EventType[],
  options: Required<AppendToStreamOptions>,
  streamsCollectionName: string,
): Promise<AppendToStreamResult> => {
  if (events.length === 0) {
    throw new Error('Cannot append empty events array');
  }

  const { expectedStreamVersion } = options;

  return firestore.runTransaction(async (transaction) => {
    // Reference to stream document
    const streamRef = firestore
      .collection(streamsCollectionName)
      .doc(streamName);

    // Get stream metadata
    const streamDoc = await transaction.get(streamRef);
    const streamExists = streamDoc.exists;
    const currentVersion = streamExists
      ? BigInt(streamDoc.data()!.version as number)
      : STREAM_DOES_NOT_EXIST;

    // Check optimistic concurrency
    if (expectedStreamVersion !== currentVersion) {
      // Special cases
      if (expectedStreamVersion === STREAM_DOES_NOT_EXIST && streamExists) {
        throw new ExpectedVersionConflictError(
          currentVersion,
          expectedStreamVersion,
        );
      }
      if (expectedStreamVersion === STREAM_EXISTS && !streamExists) {
        throw new ExpectedVersionConflictError(
          currentVersion,
          expectedStreamVersion,
        );
      }
      if (
        typeof expectedStreamVersion === 'bigint' &&
        expectedStreamVersion !== currentVersion
      ) {
        throw new ExpectedVersionConflictError(
          currentVersion,
          expectedStreamVersion,
        );
      }
    }

    // Get next global positions
    const globalPosition = await getNextGlobalPosition(
      firestore,
      transaction,
      events.length,
    );

    // Calculate new version
    const nextVersion =
      typeof currentVersion === 'bigint' ? currentVersion + 1n : 0n;

    // Append events to subcollection
    let streamVersion = nextVersion;
    let currentGlobalPosition = globalPosition;

    for (const event of events) {
      // Use streamVersion as document ID for natural ordering
      const eventRef = streamRef
        .collection('events')
        .doc(String(streamVersion).padStart(10, '0'));

      transaction.set(eventRef, {
        type: event.type,
        data: event.data as Record<string, unknown>,
        metadata: ('metadata' in event ? event.metadata : {}) as Record<
          string,
          unknown
        >,
        timestamp: new Date(),
        globalPosition: Number(currentGlobalPosition),
        streamVersion: Number(streamVersion),
      });

      streamVersion++;
      currentGlobalPosition++;
    }

    // Update stream metadata
    const newStreamVersion = streamVersion - 1n;
    transaction.set(
      streamRef,
      {
        version: Number(newStreamVersion),
        updatedAt: new Date(),
        ...(streamExists ? {} : { createdAt: new Date() }),
      },
      { merge: true },
    );

    return {
      nextExpectedStreamVersion: newStreamVersion,
      createdNewStream: !streamExists,
    };
  });
};

// Helper to get next global position using a counter document
const getNextGlobalPosition = async (
  firestore: Firestore,
  transaction: Transaction,
  count: number,
): Promise<number> => {
  const counterRef = firestore.collection('_counters').doc('global_position');
  const counterDoc = await transaction.get(counterRef);

  const currentPosition = counterDoc.exists
    ? (counterDoc.data()!.value as number)
    : 0;

  const nextPosition = currentPosition;

  transaction.set(
    counterRef,
    {
      value: currentPosition + count,
      updatedAt: new Date(),
    },
    { merge: true },
  );

  return nextPosition;
};
