/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  STREAM_DOES_NOT_EXIST,
  STREAM_EXISTS,
  type Event,
} from '@event-driven-io/emmett';
import { Firestore } from '@google-cloud/firestore';
import { after, before, describe, it } from 'node:test';
import { getFirestoreEventStore } from './firestoreEventStore';

// Test event types
type ShoppingCartOpened = Event<
  'ShoppingCartOpened',
  { customerId: string; shoppingCartId: string }
>;

type ProductAdded = Event<
  'ProductAdded',
  { productId: string; quantity: number }
>;

type ShoppingCartConfirmed = Event<
  'ShoppingCartConfirmed',
  Record<string, never>
>;

type ShoppingCartEvent =
  | ShoppingCartOpened
  | ProductAdded
  | ShoppingCartConfirmed;

// Test state
type ShoppingCart = {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
  status: 'open' | 'confirmed';
};

void describe('Firestore Event Store E2E', () => {
  let firestore: Firestore;
  let eventStore: ReturnType<typeof getFirestoreEventStore>;
  const testProjectId = 'emmett-firestore-test';

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
    await eventStore.close();
  });

  void it('should append events to a new stream', async () => {
    const streamName = 'shopping-cart-1';
    const events: ShoppingCartEvent[] = [
      {
        type: 'ShoppingCartOpened',
        data: {
          customerId: 'customer-1',
          shoppingCartId: streamName,
        },
      },
    ];

    const result = await eventStore.appendToStream(streamName, events, {
      expectedStreamVersion: STREAM_DOES_NOT_EXIST,
    });

    if (result.nextExpectedStreamVersion !== 0n) {
      throw new Error(
        `Expected version 0n, got ${result.nextExpectedStreamVersion}`,
      );
    }

    if (!result.createdNewStream) {
      throw new Error('Expected createdNewStream to be true');
    }
  });

  void it('should read events from stream', async () => {
    const streamName = 'shopping-cart-2';

    // Append events first
    await eventStore.appendToStream(
      streamName,
      [
        {
          type: 'ShoppingCartOpened',
          data: {
            customerId: 'customer-2',
            shoppingCartId: streamName,
          },
        },
        {
          type: 'ProductAdded',
          data: {
            productId: 'product-1',
            quantity: 2,
          },
        },
      ],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Read events
    const result = await eventStore.readStream<ShoppingCartEvent>(streamName);

    if (result.currentStreamVersion !== 1n) {
      throw new Error(
        `Expected version 1n, got ${result.currentStreamVersion}`,
      );
    }

    if (result.events.length !== 2) {
      throw new Error(`Expected 2 events, got ${result.events.length}`);
    }

    if (result.events[0]!.type !== 'ShoppingCartOpened') {
      throw new Error(
        `Expected first event type to be ShoppingCartOpened, got ${result.events[0]!.type}`,
      );
    }

    if (result.events[1]!.type !== 'ProductAdded') {
      throw new Error(
        `Expected second event type to be ProductAdded, got ${result.events[1]!.type}`,
      );
    }
  });

  void it('should handle optimistic concurrency - STREAM_DOES_NOT_EXIST', async () => {
    const streamName = 'shopping-cart-3';

    // Create stream
    await eventStore.appendToStream(
      streamName,
      [
        {
          type: 'ShoppingCartOpened',
          data: {
            customerId: 'customer-3',
            shoppingCartId: streamName,
          },
        },
      ],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Try to append with STREAM_DOES_NOT_EXIST again - should fail
    let errorThrown = false;
    try {
      await eventStore.appendToStream(
        streamName,
        [
          {
            type: 'ProductAdded',
            data: { productId: 'product-1', quantity: 1 },
          },
        ],
        { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
      );
    } catch (error) {
      errorThrown = true;
      if (
        !(error instanceof Error) ||
        !error.message.includes('Expected version')
      ) {
        throw new Error(`Expected ExpectedVersionConflictError, got ${error}`);
      }
    }

    if (!errorThrown) {
      throw new Error('Expected error to be thrown');
    }
  });

  void it('should handle optimistic concurrency - STREAM_EXISTS', async () => {
    const streamName = 'shopping-cart-4';

    // Try to append with STREAM_EXISTS when stream doesn't exist - should fail
    let errorThrown = false;
    try {
      await eventStore.appendToStream(
        streamName,
        [
          {
            type: 'ShoppingCartOpened',
            data: {
              customerId: 'customer-4',
              shoppingCartId: streamName,
            },
          },
        ],
        { expectedStreamVersion: STREAM_EXISTS },
      );
    } catch (error) {
      errorThrown = true;
      if (
        !(error instanceof Error) ||
        !error.message.includes('Expected version')
      ) {
        throw new Error(`Expected ExpectedVersionConflictError, got ${error}`);
      }
    }

    if (!errorThrown) {
      throw new Error('Expected error to be thrown');
    }
  });

  void it('should handle optimistic concurrency - exact version', async () => {
    const streamName = 'shopping-cart-5';

    // Create stream
    await eventStore.appendToStream(
      streamName,
      [
        {
          type: 'ShoppingCartOpened',
          data: {
            customerId: 'customer-5',
            shoppingCartId: streamName,
          },
        },
      ],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Append with correct version
    const result = await eventStore.appendToStream(
      streamName,
      [
        {
          type: 'ProductAdded',
          data: { productId: 'product-1', quantity: 1 },
        },
      ],
      { expectedStreamVersion: 0n },
    );

    if (result.nextExpectedStreamVersion !== 1n) {
      throw new Error(
        `Expected version 1n, got ${result.nextExpectedStreamVersion}`,
      );
    }

    // Try to append with wrong version - should fail
    let errorThrown = false;
    try {
      await eventStore.appendToStream(
        streamName,
        [
          {
            type: 'ShoppingCartConfirmed',
            data: {},
          },
        ],
        { expectedStreamVersion: 0n }, // Wrong version
      );
    } catch (error) {
      errorThrown = true;
    }

    if (!errorThrown) {
      throw new Error('Expected error to be thrown');
    }
  });

  void it('should aggregate stream events into state', async () => {
    const streamName = 'shopping-cart-6';

    // Append events
    await eventStore.appendToStream(
      streamName,
      [
        {
          type: 'ShoppingCartOpened',
          data: {
            customerId: 'customer-6',
            shoppingCartId: streamName,
          },
        },
        {
          type: 'ProductAdded',
          data: { productId: 'product-1', quantity: 2 },
        },
        {
          type: 'ProductAdded',
          data: { productId: 'product-2', quantity: 3 },
        },
        {
          type: 'ShoppingCartConfirmed',
          data: {},
        },
      ],
      { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
    );

    // Aggregate stream
    const result = await eventStore.aggregateStream<
      ShoppingCart,
      ShoppingCartEvent
    >(streamName, {
      initialState: () => ({
        customerId: '',
        items: [],
        status: 'open' as const,
      }),
      evolve: (state, event) => {
        switch (event.type) {
          case 'ShoppingCartOpened':
            return {
              ...state,
              customerId: event.data.customerId,
            };
          case 'ProductAdded':
            return {
              ...state,
              items: [
                ...state.items,
                {
                  productId: event.data.productId,
                  quantity: event.data.quantity,
                },
              ],
            };
          case 'ShoppingCartConfirmed':
            return {
              ...state,
              status: 'confirmed' as const,
            };
          default:
            return state;
        }
      },
    });

    if (result.currentStreamVersion !== 3n) {
      throw new Error(
        `Expected version 3n, got ${result.currentStreamVersion}`,
      );
    }

    if (result.state.customerId !== 'customer-6') {
      throw new Error(
        `Expected customerId 'customer-6', got ${result.state.customerId}`,
      );
    }

    if (result.state.items.length !== 2) {
      throw new Error(`Expected 2 items, got ${result.state.items.length}`);
    }

    if (result.state.status !== 'confirmed') {
      throw new Error(
        `Expected status 'confirmed', got ${result.state.status}`,
      );
    }
  });

  void it('should handle non-existing stream', async () => {
    const streamName = 'shopping-cart-nonexisting';

    const result = await eventStore.readStream(streamName);

    if (result.currentStreamVersion !== STREAM_DOES_NOT_EXIST) {
      throw new Error(
        `Expected STREAM_DOES_NOT_EXIST, got ${result.currentStreamVersion}`,
      );
    }

    if (result.events.length !== 0) {
      throw new Error(`Expected 0 events, got ${result.events.length}`);
    }
  });
});

// Helper to clean up Firestore
async function cleanupFirestore(firestore: Firestore): Promise<void> {
  // Delete all stream documents (including their subcollections)
  const streamsSnapshot = await firestore.collection('streams').get();
  const batch = firestore.batch();

  for (const streamDoc of streamsSnapshot.docs) {
    // Delete events subcollection
    const eventsSnapshot = await streamDoc.ref.collection('events').get();
    eventsSnapshot.docs.forEach((eventDoc) => {
      batch.delete(eventDoc.ref);
    });

    // Delete stream document
    batch.delete(streamDoc.ref);
  }

  // Delete counter
  const counterRef = firestore.collection('_counters').doc('global_position');
  batch.delete(counterRef);

  await batch.commit();
}
