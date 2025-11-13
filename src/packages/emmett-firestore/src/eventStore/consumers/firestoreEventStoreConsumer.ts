/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Event } from '@event-driven-io/emmett';
import type { Firestore } from '@google-cloud/firestore';

export type FirestoreEventStoreConsumer = {
  start(): Promise<void>;
  stop(): void;
  isRunning: boolean;
};

export type FirestoreProcessor<T = unknown> = {
  handle(events: Event[]): Promise<T>;
};

export type FirestoreEventStoreConsumerConfig<T = unknown> = {
  firestore: Firestore;
  consumerId: string;
  processors: FirestoreProcessor<T>[];
  eventsCollectionName?: string;
  checkpointCollectionName?: string;
  pollingIntervalMs?: number;
  maxRetries?: number;
  retryBackoff?: 'linear' | 'exponential';
  onError?: (error: Error, event: Event) => Promise<void> | void;
};

export const firestoreEventStoreConsumer = <T = unknown>(
  config: FirestoreEventStoreConsumerConfig<T>,
): FirestoreEventStoreConsumer => {
  const {
    firestore,
    consumerId,
    processors,
    eventsCollectionName = 'events',
    checkpointCollectionName = '_checkpoints',
    pollingIntervalMs = 1000,
    maxRetries = 3,
    retryBackoff = 'exponential',
    onError,
  } = config;

  let isRunning = false;
  let pollingTimer: NodeJS.Timeout | undefined;
  let lastProcessedPosition: bigint | undefined;

  // Checkpoint management
  const checkpointRef = firestore
    .collection(checkpointCollectionName)
    .doc(consumerId);

  const loadCheckpoint = async (): Promise<bigint | undefined> => {
    const doc = await checkpointRef.get();
    if (!doc.exists) return undefined;

    const data = doc.data();
    return data?.position ? BigInt(data.position) : undefined;
  };

  const saveCheckpoint = async (position: bigint): Promise<void> => {
    await checkpointRef.set({
      position: position.toString(),
      updatedAt: new Date(),
      consumerId,
    });
  };

  // Retry logic with backoff
  const processWithRetry = async (
    events: Event[],
    attempt: number = 0,
  ): Promise<void> => {
    try {
      for (const processor of processors) {
        await processor.handle(events);
      }
    } catch (error) {
      if (attempt < maxRetries) {
        const delay =
          retryBackoff === 'exponential'
            ? Math.pow(2, attempt) * 1000 // 1s, 2s, 4s...
            : (attempt + 1) * 1000; // 1s, 2s, 3s...

        console.warn(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return processWithRetry(events, attempt + 1);
      }

      // Failed after all retries
      console.error(
        `Failed to process events after ${maxRetries} retries`,
        error,
      );

      if (onError) {
        for (const event of events) {
          await onError(error as Error, event);
        }
      }

      throw error; // Re-throw to prevent checkpoint save
    }
  };

  const consumer: FirestoreEventStoreConsumer = {
    async start() {
      if (isRunning) {
        throw new Error('Consumer is already running');
      }

      if (processors.length === 0) {
        throw new Error(
          'Cannot start consumer without at least a single processor',
        );
      }

      // Load checkpoint on start
      lastProcessedPosition = await loadCheckpoint();
      console.log(
        `Consumer ${consumerId} starting from position:`,
        lastProcessedPosition ?? 'beginning',
      );

      isRunning = true;

      // Start polling
      const poll = async () => {
        if (!isRunning) return;

        try {
          // Build query for new events using collectionGroup to query across all stream subcollections
          let query = firestore
            .collectionGroup(eventsCollectionName)
            .orderBy('globalPosition', 'asc')
            .limit(100);

          if (lastProcessedPosition !== undefined) {
            query = query.where(
              'globalPosition',
              '>',
              Number(lastProcessedPosition),
            );
          }

          const snapshot = await query.get();

          if (!snapshot.empty) {
            const events = snapshot.docs.map((doc) => {
              const data = doc.data() as {
                type: string;
                data: unknown;
                metadata: Record<string, unknown>;
                globalPosition: number;
                streamVersion: number;
              };
              // Extract streamName from document path: streams/{streamName}/events/{eventId}
              const streamName = doc.ref.parent.parent?.id || '';
              return {
                type: data.type,
                data: data.data as Record<string, unknown>,
                metadata: {
                  ...data.metadata,
                  streamName,
                  streamPosition: BigInt(data.streamVersion),
                  globalPosition: BigInt(data.globalPosition),
                },
              };
            }) as Event[];

            // Process events with retry
            await processWithRetry(events);

            // Update last processed position
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            if (lastDoc) {
              const globalPosition = BigInt(
                (lastDoc.data() as { globalPosition: number }).globalPosition,
              );
              lastProcessedPosition = globalPosition;

              // Save checkpoint after successful processing
              await saveCheckpoint(lastProcessedPosition);
            }
          }
        } catch (error) {
          console.error('Error in consumer polling loop:', error);
          // Don't save checkpoint on error
        }

        // Schedule next poll
        if (isRunning) {
          pollingTimer = setTimeout(poll, pollingIntervalMs);
        }
      };

      // Start polling
      await poll();
    },

    stop() {
      isRunning = false;
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = undefined;
      }
    },

    get isRunning() {
      return isRunning;
    },
  };

  return consumer;
};
