/* eslint-disable @typescript-eslint/require-await */

import { STREAM_DOES_NOT_EXIST, type Event } from '@event-driven-io/emmett';
import { Firestore } from '@google-cloud/firestore';
import { after, before, describe, it } from 'node:test';
import { getFirestoreEventStore } from '../firestoreEventStore';
import { firestoreEventStoreConsumer } from './firestoreEventStoreConsumer';

type TestEvent = Event<'TestEvent', { message: string }>;

void describe('Firestore Event Store Consumer E2E', () => {
  let firestore: Firestore;
  let eventStore: ReturnType<typeof getFirestoreEventStore>;
  const testProjectId = 'emmett-firestore-consumer-test';

  before(async () => {
    // Use Firestore Emulator
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

    firestore = new Firestore({
      projectId: testProjectId,
    });

    eventStore = getFirestoreEventStore({
      firestore,
    });

    // Clean up any existing data
    await cleanupFirestore(firestore);
  });

  after(async () => {
    // Clean up after all tests
    await cleanupFirestore(firestore);
    await eventStore.close();
  });

  void it('should process events with consumer', async () => {
    const testId = Date.now();
    const streamName = `test-stream-1-${testId}`;
    const processedEvents: Event[] = [];

    // Clean up before test
    await cleanupFirestore(firestore);

    // Append events first
    await eventStore.appendToStream<TestEvent>(
      streamName,
      [
        { type: 'TestEvent', data: { message: 'event-1' } },
        { type: 'TestEvent', data: { message: 'event-2' } },
      ],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Create consumer
    const consumer = firestoreEventStoreConsumer({
      firestore,
      consumerId: `test-consumer-1-${testId}`,
      processors: [
        {
          async handle(events: Event[]) {
            processedEvents.push(...events);
          },
        },
      ],
      pollingIntervalMs: 100,
    });

    await consumer.start();

    // Wait for events to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    consumer.stop();

    if (processedEvents.length !== 2) {
      throw new Error(
        `Expected 2 events to be processed, got ${processedEvents.length}`,
      );
    }

    if (processedEvents[0]!.type !== 'TestEvent') {
      throw new Error(
        `Expected first event type to be TestEvent, got ${processedEvents[0]!.type}`,
      );
    }
  });

  void it('should save and load checkpoint', async () => {
    const testId = Date.now();
    const streamName = `test-stream-2-${testId}`;
    const consumerId = `test-consumer-checkpoint-${testId}`;
    const processedEvents1: Event[] = [];
    const processedEvents2: Event[] = [];

    // Clean up before test
    await cleanupFirestore(firestore);

    // Append first batch of events
    await eventStore.appendToStream<TestEvent>(
      streamName,
      [
        { type: 'TestEvent', data: { message: 'event-1' } },
        { type: 'TestEvent', data: { message: 'event-2' } },
      ],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Create consumer and process first batch
    const consumer1 = firestoreEventStoreConsumer({
      firestore,
      consumerId,
      processors: [
        {
          async handle(events: Event[]) {
            processedEvents1.push(...events);
          },
        },
      ],
      pollingIntervalMs: 100,
    });

    await consumer1.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    consumer1.stop();

    if (processedEvents1.length !== 2) {
      throw new Error(
        `Expected 2 events in first batch, got ${processedEvents1.length}`,
      );
    }

    // Append second batch of events
    await eventStore.appendToStream<TestEvent>(
      streamName,
      [
        { type: 'TestEvent', data: { message: 'event-3' } },
        { type: 'TestEvent', data: { message: 'event-4' } },
      ],
      { expectedStreamVersion: 1n },
    );

    // Create new consumer with same ID - should resume from checkpoint
    const consumer2 = firestoreEventStoreConsumer({
      firestore,
      consumerId, // Same ID
      processors: [
        {
          async handle(events: Event[]) {
            processedEvents2.push(...events);
          },
        },
      ],
      pollingIntervalMs: 100,
    });

    await consumer2.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    consumer2.stop();

    // Should only process new events (3 and 4), not reprocess 1 and 2
    if (processedEvents2.length !== 2) {
      throw new Error(
        `Expected 2 events in second batch, got ${processedEvents2.length}`,
      );
    }

    const messages = processedEvents2.map(
      (e) => (e.data as { message: string }).message,
    );
    if (!messages.includes('event-3') || !messages.includes('event-4')) {
      throw new Error(
        `Expected events 3 and 4, got ${JSON.stringify(messages)}`,
      );
    }
  });

  void it('should retry on processor failure', async () => {
    const testId = Date.now();
    const streamName = `test-stream-3-${testId}`;
    let attemptCount = 0;
    const processedEvents: Event[] = [];

    // Clean up before test
    await cleanupFirestore(firestore);

    // Append events
    await eventStore.appendToStream<TestEvent>(
      streamName,
      [{ type: 'TestEvent', data: { message: 'event-1' } }],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Create consumer with failing processor
    const consumer = firestoreEventStoreConsumer({
      firestore,
      consumerId: `test-consumer-retry-${testId}`,
      processors: [
        {
          async handle(events: Event[]) {
            attemptCount++;
            if (attemptCount < 3) {
              // Fail first 2 attempts
              throw new Error('Simulated failure');
            }
            // Succeed on 3rd attempt
            processedEvents.push(...events);
          },
        },
      ],
      pollingIntervalMs: 100,
      maxRetries: 3,
      retryBackoff: 'linear',
    });

    await consumer.start();

    // Wait for retries and eventual success
    await new Promise((resolve) => setTimeout(resolve, 5000));

    consumer.stop();

    // Should have retried and eventually succeeded
    if (attemptCount < 3) {
      throw new Error(`Expected at least 3 attempts, got ${attemptCount}`);
    }

    if (processedEvents.length !== 1) {
      throw new Error(
        `Expected 1 event to be processed, got ${processedEvents.length}`,
      );
    }
  });

  void it('should call onError callback after max retries exceeded', async () => {
    const testId = Date.now();
    const streamName = `test-stream-4-${testId}`;
    const errorEvents: Event[] = [];

    // Clean up before test
    await cleanupFirestore(firestore);

    // Append events
    await eventStore.appendToStream<TestEvent>(
      streamName,
      [{ type: 'TestEvent', data: { message: 'event-1' } }],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Create consumer with always-failing processor
    const consumer = firestoreEventStoreConsumer({
      firestore,
      consumerId: `test-consumer-error-${testId}`,
      processors: [
        {
          async handle() {
            throw new Error('Always fails');
          },
        },
      ],
      pollingIntervalMs: 100,
      maxRetries: 2,
      retryBackoff: 'exponential',
      onError: async (error, event) => {
        errorEvents.push(event);
      },
    });

    await consumer.start();

    // Wait for retries to exhaust
    await new Promise((resolve) => setTimeout(resolve, 5000));

    consumer.stop();

    // onError should have been called for the event (at least once)
    if (errorEvents.length < 1) {
      throw new Error(
        `Expected onError to be called at least once, got ${errorEvents.length} times`,
      );
    }
  });

  void it('should process events from multiple streams', async () => {
    const testId = Date.now();
    const stream1 = `test-stream-5a-${testId}`;
    const stream2 = `test-stream-5b-${testId}`;
    const processedEvents: Array<{ streamName: string; type: string }> = [];

    // Clean up before test
    await cleanupFirestore(firestore);

    // Append events to different streams
    await eventStore.appendToStream<TestEvent>(
      stream1,
      [{ type: 'TestEvent', data: { message: 'stream1-event' } }],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    await eventStore.appendToStream<TestEvent>(
      stream2,
      [{ type: 'TestEvent', data: { message: 'stream2-event' } }],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Create consumer
    const consumer = firestoreEventStoreConsumer({
      firestore,
      consumerId: `test-consumer-multi-stream-${testId}`,
      processors: [
        {
          async handle(events: Event[]) {
            for (const event of events) {
              processedEvents.push({
                streamName: (event.metadata as { streamName?: string })
                  .streamName!,
                type: event.type,
              });
            }
          },
        },
      ],
      pollingIntervalMs: 100,
    });

    await consumer.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    consumer.stop();

    if (processedEvents.length !== 2) {
      throw new Error(
        `Expected 2 events from different streams, got ${processedEvents.length}`,
      );
    }

    const streamNames = processedEvents.map((e) => e.streamName);
    if (!streamNames.includes(stream1) || !streamNames.includes(stream2)) {
      throw new Error(
        `Expected events from both streams, got ${JSON.stringify(streamNames)}`,
      );
    }
  });
});

// Helper to clean up Firestore
async function cleanupFirestore(firestore: Firestore): Promise<void> {
  // Delete all stream documents (including their subcollections)
  const streamsSnapshot = await firestore.collection('streams').get();
  const batch1 = firestore.batch();

  for (const streamDoc of streamsSnapshot.docs) {
    // Delete events subcollection
    const eventsSnapshot = await streamDoc.ref.collection('events').get();
    eventsSnapshot.docs.forEach((eventDoc) => {
      batch1.delete(eventDoc.ref);
    });

    // Delete stream document
    batch1.delete(streamDoc.ref);
  }

  await batch1.commit();

  // Delete counter and checkpoints in separate batches
  const batch2 = firestore.batch();
  const counterRef = firestore.collection('_counters').doc('global_position');
  batch2.delete(counterRef);

  const checkpointsSnapshot = await firestore.collection('_checkpoints').get();
  checkpointsSnapshot.docs.forEach((doc) => {
    batch2.delete(doc.ref);
  });

  await batch2.commit();
}
