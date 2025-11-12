import type { Firestore } from '@google-cloud/firestore';
import type { Event } from '@event-driven-io/emmett';

export type FirestoreEventStoreConsumer = {
  start(): Promise<void>;
  stop(): void;
  isRunning: boolean;
};

export type FirestoreProcessor = {
  handle(events: Event[]): Promise<void>;
};

export type FirestoreEventStoreConsumerConfig = {
  firestore: Firestore;
  processors: FirestoreProcessor[];
  eventsCollectionName?: string;
  pollingIntervalMs?: number;
};

export const firestoreEventStoreConsumer = (
  config: FirestoreEventStoreConsumerConfig,
): FirestoreEventStoreConsumer => {
  const {
    firestore,
    processors,
    eventsCollectionName = 'events',
    pollingIntervalMs = 1000,
  } = config;

  let isRunning = false;
  let pollingTimer: NodeJS.Timeout | undefined;
  let lastProcessedPosition = -1;

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

      isRunning = true;

      // Start polling
      const poll = async () => {
        if (!isRunning) return;

        try {
          // Query for new events using collectionGroup to get events from all streams
          const snapshot = await firestore
            .collectionGroup(eventsCollectionName)
            .where('globalPosition', '>', lastProcessedPosition)
            .orderBy('globalPosition', 'asc')
            .limit(100)
            .get();

          if (!snapshot.empty) {
            const events = snapshot.docs.map((doc) => {
              const data = doc.data() as {
                type: string;
                data: unknown;
                metadata: Record<string, unknown>;
                globalPosition: number;
              };
              return {
                type: data.type,
                data: data.data as Record<string, unknown>,
                metadata: data.metadata,
              };
            }) as Event[];

            // Process events with all processors
            for (const processor of processors) {
              await processor.handle(events);
            }

            // Update last processed position
            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            if (lastDoc) {
              lastProcessedPosition = (
                lastDoc.data() as { globalPosition: number }
              ).globalPosition;
            }
          }
        } catch (error) {
          console.error('Error polling events:', error);
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
