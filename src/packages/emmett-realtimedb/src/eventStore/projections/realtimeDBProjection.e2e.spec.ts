import {
  assertDeepEqual,
  assertIsNotNull,
  assertIsNull,
  type Event,
  type ReadEvent,
} from '@event-driven-io/emmett';
import { after, before, beforeEach, describe, it } from 'node:test';
import { v4 as uuid } from 'uuid';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import {
  realtimeDBProjection,
  handleProjections,
  type RealtimeDBReadModel,
  type RealtimeDBReadEventMetadata,
} from './realtimeDBProjection';

// Test Event Types
type ProductItemAdded = Event<
  'ProductItemAdded',
  {
    productItem: {
      productId: string;
      quantity: number;
      price: number;
    };
  }
>;

type DiscountApplied = Event<
  'DiscountApplied',
  {
    percent: number;
    couponId: string;
  }
>;

type ShoppingCartDeleted = Event<
  'ShoppingCartDeleted',
  {
    deletedAt: Date;
    reason: string;
  }
>;

type ShoppingCartEvent = ProductItemAdded | DiscountApplied | ShoppingCartDeleted;

type ShoppingCartShortInfo = {
  productItemsCount: number;
  totalAmount: number;
};

const evolve = (
  document: ShoppingCartShortInfo | null,
  event: ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>,
): ShoppingCartShortInfo | null => {
  document = document ?? { productItemsCount: 0, totalAmount: 0 };

  switch (event.type) {
    case 'ProductItemAdded':
      return {
        totalAmount:
          document.totalAmount +
          event.data.productItem.price * event.data.productItem.quantity,
        productItemsCount:
          document.productItemsCount + event.data.productItem.quantity,
      };
    case 'DiscountApplied':
      return {
        ...document,
        totalAmount: (document.totalAmount * (100 - event.data.percent)) / 100,
      };
    case 'ShoppingCartDeleted':
      return null;
    default:
      return document;
  }
};

void describe('RealtimeDB Projection E2E', () => {
  let app: App;
  let database: Database;
  const testProjectId = 'emmett-realtimedb-test';
  let emulatorAvailable = false;

  before(async () => {
    // Use Firebase Realtime Database Emulator
    // Set emulator host before initializing the app
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = 'localhost:9000';

    app = initializeApp({
      projectId: testProjectId,
      databaseURL: `http://localhost:9000?ns=${testProjectId}`,
    });

    database = getDatabase(app);

    // Check if emulator is available
    try {
      const testRef = database.ref('__emulator_check__');
      await testRef.set({ test: true });
      await testRef.remove();
      emulatorAvailable = true;
    } catch (error) {
      console.warn(
        '\n⚠️  Firebase Emulator not available. E2E tests will be skipped.',
      );
      console.warn(
        '   To run E2E tests, start the emulator first:',
      );
      console.warn(
        '   npx firebase emulators:start --only database --project emmett-realtimedb-test\n',
      );
      emulatorAvailable = false;
    }
  });

  after(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    // Note: In a real e2e test, you would clear the test data
    // For now, we use unique IDs per test
  });

  void it('should handle projection and store in Realtime Database', async () => {
    if (!emulatorAvailable) {
      console.log('  ⊘ Skipped: Emulator not available');
      return;
    }

    const streamId = uuid();
    const streamName = `shopping_cart:${streamId}`;
    const projectionName = 'shopping-cart-summary';

    const projection = realtimeDBProjection<
      ShoppingCartShortInfo,
      ShoppingCartEvent
    >({
      name: projectionName,
      canHandle: ['ProductItemAdded', 'DiscountApplied', 'ShoppingCartDeleted'],
      evolve,
    });

    const events: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '123',
            quantity: 10,
            price: 3,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '456',
            quantity: 5,
            price: 2,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 2n,
        },
      },
      {
        type: 'DiscountApplied',
        data: {
          percent: 10,
          couponId: uuid(),
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 3n,
        },
      },
    ];

    const reference = database.ref(`streams/${streamName}`);

    await handleProjections({
      events,
      projections: [projection],
      streamId,
      reference,
      database,
      readModels: {},
    });

    // Verify the projection was stored
    const snapshot = await reference
      .child(`projections/${projectionName}`)
      .once('value');
    const storedProjection = snapshot.val() as RealtimeDBReadModel<ShoppingCartShortInfo>;

    assertIsNotNull(storedProjection);
    assertDeepEqual(storedProjection, {
      productItemsCount: 15,
      totalAmount: 36, // (10*3 + 5*2) * 0.9 = 40 * 0.9 = 36
      _metadata: {
        streamId,
        name: projectionName,
        streamPosition: '3', // Firebase converts BigInt to string
        schemaVersion: 1,
      },
    });

    // Cleanup
    await reference.remove();
  });

  void it('should handle projection with initial state', async () => {
    const streamId = uuid();
    const streamName = `shopping_cart:${streamId}`;
    const projectionName = 'shopping-cart-with-initial';

    const projection = realtimeDBProjection<
      ShoppingCartShortInfo,
      ShoppingCartEvent
    >({
      name: projectionName,
      canHandle: ['ProductItemAdded', 'DiscountApplied'],
      initialState: () => ({ productItemsCount: 0, totalAmount: 0 }),
      evolve,
    });

    const events: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '123',
            quantity: 5,
            price: 10,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
    ];

    const reference = database.ref(`streams/${streamName}`);

    await handleProjections({
      events,
      projections: [projection],
      streamId,
      reference,
      database,
      readModels: {},
    });

    const snapshot = await reference
      .child(`projections/${projectionName}`)
      .once('value');
    const storedProjection = snapshot.val() as RealtimeDBReadModel<ShoppingCartShortInfo>;

    assertIsNotNull(storedProjection);
    assertDeepEqual(storedProjection, {
      productItemsCount: 5,
      totalAmount: 50,
      _metadata: {
        streamId,
        name: projectionName,
        streamPosition: '1', // Firebase converts BigInt to string
        schemaVersion: 1,
      },
    });

    // Cleanup
    await reference.remove();
  });

  void it('should delete projection when evolve returns null', async () => {
    const streamId = uuid();
    const streamName = `shopping_cart:${streamId}`;
    const projectionName = 'shopping-cart-deletable';

    const projection = realtimeDBProjection<
      ShoppingCartShortInfo,
      ShoppingCartEvent
    >({
      name: projectionName,
      canHandle: ['ProductItemAdded', 'ShoppingCartDeleted'],
      evolve,
    });

    const reference = database.ref(`streams/${streamName}`);

    // First, create a projection
    const createEvents: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '123',
            quantity: 2,
            price: 5,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
    ];

    await handleProjections({
      events: createEvents,
      projections: [projection],
      streamId,
      reference,
      database,
      readModels: {},
    });

    // Verify it was created
    let snapshot = await reference
      .child(`projections/${projectionName}`)
      .once('value');
    assertIsNotNull(snapshot.val());

    // Now delete it
    const deleteEvents: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ShoppingCartDeleted',
        data: {
          deletedAt: new Date(),
          reason: 'User requested deletion',
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 2n,
        },
      },
    ];

    await handleProjections({
      events: deleteEvents,
      projections: [projection],
      streamId,
      reference,
      database,
      readModels: {},
    });

    // Verify it was deleted (should be null)
    snapshot = await reference
      .child(`projections/${projectionName}`)
      .once('value');
    assertIsNull(snapshot.val());

    // Cleanup
    await reference.remove();
  });

  void it('should update existing projection with new events', async () => {
    const streamId = uuid();
    const streamName = `shopping_cart:${streamId}`;
    const projectionName = 'shopping-cart-updateable';

    const projection = realtimeDBProjection<
      ShoppingCartShortInfo,
      ShoppingCartEvent
    >({
      name: projectionName,
      canHandle: ['ProductItemAdded', 'DiscountApplied'],
      evolve,
    });

    const reference = database.ref(`streams/${streamName}`);

    // First batch of events
    const firstEvents: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '123',
            quantity: 10,
            price: 5,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
    ];

    await handleProjections({
      events: firstEvents,
      projections: [projection],
      streamId,
      reference,
      database,
      readModels: {},
    });

    // Get the first projection state
    const snapshot1 = await reference
      .child(`projections/${projectionName}`)
      .once('value');
    const firstProjection = snapshot1.val() as RealtimeDBReadModel<ShoppingCartShortInfo>;

    // Second batch of events (updating the existing projection)
    const secondEvents: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '456',
            quantity: 5,
            price: 10,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 2n,
        },
      },
    ];

    // Pass the existing projection as readModel
    await handleProjections({
      events: secondEvents,
      projections: [projection],
      streamId,
      reference,
      database,
      readModels: {
        [projectionName]: firstProjection,
      },
    });

    // Get the updated projection
    const snapshot2 = await reference
      .child(`projections/${projectionName}`)
      .once('value');
    const updatedProjection = snapshot2.val() as RealtimeDBReadModel<ShoppingCartShortInfo>;

    assertIsNotNull(updatedProjection);
    assertDeepEqual(updatedProjection, {
      productItemsCount: 15, // 10 + 5
      totalAmount: 100, // 10*5 + 5*10 = 50 + 50
      _metadata: {
        streamId,
        name: projectionName,
        streamPosition: '2', // Firebase converts BigInt to string
        schemaVersion: 1,
      },
    });

    // Cleanup
    await reference.remove();
  });

  void it('should handle multiple projections for the same stream', async () => {
    const streamId = uuid();
    const streamName = `shopping_cart:${streamId}`;

    const summaryProjection = realtimeDBProjection<
      ShoppingCartShortInfo,
      ShoppingCartEvent
    >({
      name: 'summary',
      canHandle: ['ProductItemAdded', 'DiscountApplied'],
      evolve,
    });

    const itemCountProjection = realtimeDBProjection<
      { count: number },
      ShoppingCartEvent
    >({
      name: 'item-count',
      canHandle: ['ProductItemAdded'],
      evolve: (doc, event) => {
        const current = doc ?? { count: 0 };
        if (event.type === 'ProductItemAdded') {
          return { count: current.count + event.data.productItem.quantity };
        }
        return current;
      },
    });

    const events: Array<ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>> = [
      {
        type: 'ProductItemAdded',
        data: {
          productItem: {
            productId: '123',
            quantity: 3,
            price: 10,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
    ];

    const reference = database.ref(`streams/${streamName}`);

    await handleProjections({
      events,
      projections: [summaryProjection, itemCountProjection],
      streamId,
      reference,
      database,
      readModels: {},
    });

    // Check both projections were created
    const summarySnapshot = await reference
      .child('projections/summary')
      .once('value');
    const summaryData = summarySnapshot.val() as RealtimeDBReadModel<ShoppingCartShortInfo>;

    const countSnapshot = await reference
      .child('projections/item-count')
      .once('value');
    const countData = countSnapshot.val() as RealtimeDBReadModel<{ count: number }>;

    assertIsNotNull(summaryData);
    assertDeepEqual(summaryData.productItemsCount, 3);
    assertDeepEqual(summaryData.totalAmount, 30);

    assertIsNotNull(countData);
    assertDeepEqual(countData.count, 3);

    // Cleanup
    await reference.remove();
  });
});
