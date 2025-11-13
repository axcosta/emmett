/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  assertDeepEqual,
  assertIsNotNull,
  type Event,
  type ReadEvent,
} from '@event-driven-io/emmett';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { after, before, describe, it } from 'node:test';
import { v4 as uuid } from 'uuid';
import {
  realtimeDBMultiStreamProjection,
  realtimeDBSingleStreamProjection,
  type RealtimeDBReadEventMetadata,
  type RealtimeDBReadModel,
} from './realtimeDBMultiStreamProjection';

// Test Event Types
type ProductItemAddedToShoppingCart = Event<
  'ProductItemAddedToShoppingCart',
  {
    shoppingCartId: string;
    productItem: {
      productId: string;
      quantity: number;
      unitPrice: number;
    };
  }
>;

type ProductItemRemovedFromShoppingCart = Event<
  'ProductItemRemovedFromShoppingCart',
  {
    shoppingCartId: string;
    productItem: {
      productId: string;
      quantity: number;
      unitPrice: number;
    };
  }
>;

type ShoppingCartConfirmed = Event<
  'ShoppingCartConfirmed',
  {
    shoppingCartId: string;
    confirmedAt: Date;
  }
>;

type ShoppingCartCancelled = Event<
  'ShoppingCartCancelled',
  {
    shoppingCartId: string;
    cancelledAt: Date;
  }
>;

type ShoppingCartEvent =
  | ProductItemAddedToShoppingCart
  | ProductItemRemovedFromShoppingCart
  | ShoppingCartConfirmed
  | ShoppingCartCancelled;

type PricedProductItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

type ShoppingSummary = {
  productItemsCount: number;
  totalAmount: number;
};

type PendingSummary = ShoppingSummary & {
  cartId: string;
};

type ConfirmedSummary = ShoppingSummary & {
  cartsCount: number;
};

type CancelledSummary = ShoppingSummary & {
  cartsCount: number;
};

type ClientShoppingSummary = {
  clientId: string;
  pending?: PendingSummary;
  confirmed: ConfirmedSummary;
  cancelled: CancelledSummary;
};

// Helper to extend metadata with custom properties
type ExtendedMetadata = RealtimeDBReadEventMetadata & {
  clientId: string;
};

const withAdjustedTotals = (options: {
  summary: ShoppingSummary | undefined;
  with: PricedProductItem | ShoppingSummary;
  by: 'adding' | 'removing';
}) => {
  const { summary: document, by } = options;

  const totalAmount =
    'totalAmount' in options.with
      ? options.with.totalAmount
      : options.with.unitPrice * options.with.quantity;
  const productItemsCount =
    'productItemsCount' in options.with
      ? options.with.productItemsCount
      : options.with.quantity;

  const plusOrMinus = by === 'adding' ? 1 : -1;

  return {
    ...document,
    totalAmount: (document?.totalAmount ?? 0) + totalAmount * plusOrMinus,
    productItemsCount:
      (document?.productItemsCount ?? 0) + productItemsCount * plusOrMinus,
  };
};

const initialSummary = {
  cartsCount: 0,
  productItemsCount: 0,
  totalAmount: 0,
};

const evolveClientSummary = (
  document: ClientShoppingSummary | null,
  event: ReadEvent<ShoppingCartEvent, ExtendedMetadata>,
): ClientShoppingSummary | null => {
  const summary: ClientShoppingSummary = document ?? {
    clientId: event.metadata.clientId,
    pending: undefined,
    confirmed: initialSummary,
    cancelled: initialSummary,
  };

  switch (event.type) {
    case 'ProductItemAddedToShoppingCart':
      return {
        ...summary,
        pending: {
          cartId: event.data.shoppingCartId,
          ...withAdjustedTotals({
            summary: summary.pending,
            with: event.data.productItem,
            by: 'adding',
          }),
        },
      };
    case 'ProductItemRemovedFromShoppingCart':
      return {
        ...summary,
        pending: {
          cartId: event.data.shoppingCartId,
          ...withAdjustedTotals({
            summary: summary.pending,
            with: event.data.productItem,
            by: 'removing',
          }),
        },
      };
    case 'ShoppingCartConfirmed':
      return {
        ...summary,
        pending: undefined,
        confirmed: {
          ...withAdjustedTotals({
            summary: summary.confirmed,
            with: summary.pending!,
            by: 'adding',
          }),
          cartsCount: (summary.confirmed?.cartsCount ?? 0) + 1,
        },
      };
    case 'ShoppingCartCancelled':
      return {
        ...summary,
        pending: undefined,
        cancelled: {
          ...withAdjustedTotals({
            summary: summary.cancelled,
            with: summary.pending!,
            by: 'adding',
          }),
          cartsCount: (summary.cancelled?.cartsCount ?? 0) + 1,
        },
      };
    default:
      return summary;
  }
};

void describe('RealtimeDB Multi-Stream Projection E2E', () => {
  let app: App;
  let database: Database;
  const testProjectId = 'emmett-realtimedb-test';
  let emulatorAvailable = false;

  before(async () => {
    // Use Firebase Realtime Database Emulator
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
      console.warn('   To run E2E tests, start the emulator first:');
      console.warn(
        '   npx firebase emulators:start --only database --project emmett-realtimedb-test\n',
      );
      emulatorAvailable = false;
    }
  });

  after(async () => {
    await deleteApp(app);
  });

  void it('should aggregate events from multiple shopping cart streams by clientId', async () => {
    if (!emulatorAvailable) {
      console.log('  ⊘ Skipped: Emulator not available');
      return;
    }

    const clientId = uuid();
    const cart1Id = uuid();
    const cart2Id = uuid();
    const collectionName = `ClientShoppingSummary_${Date.now()}`;

    const projection = realtimeDBMultiStreamProjection<
      ClientShoppingSummary,
      ShoppingCartEvent,
      ExtendedMetadata
    >({
      collectionName,
      getDocumentId: (event) => event.metadata.clientId,
      evolve: evolveClientSummary,
      canHandle: [
        'ProductItemAddedToShoppingCart',
        'ProductItemRemovedFromShoppingCart',
        'ShoppingCartConfirmed',
        'ShoppingCartCancelled',
      ],
    });

    // Events from first shopping cart
    const cart1Events: Array<ReadEvent<ShoppingCartEvent, ExtendedMetadata>> = [
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: cart1Id,
          productItem: {
            productId: 'product-1',
            quantity: 2,
            unitPrice: 10,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName: `shopping_cart:${cart1Id}`,
          streamPosition: 1n,
          clientId,
        },
      },
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: cart1Id,
          productItem: {
            productId: 'product-2',
            quantity: 1,
            unitPrice: 20,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName: `shopping_cart:${cart1Id}`,
          streamPosition: 2n,
          clientId,
        },
      },
      {
        type: 'ShoppingCartConfirmed',
        data: {
          shoppingCartId: cart1Id,
          confirmedAt: new Date(),
        },
        metadata: {
          messageId: uuid(),
          streamName: `shopping_cart:${cart1Id}`,
          streamPosition: 3n,
          clientId,
        },
      },
    ];

    // Process cart1 events
    await projection.handle(cart1Events, { database });

    // Verify first cart aggregation
    const snapshot1 = await database
      .ref(`${collectionName}/${clientId}`)
      .once('value');
    const summary1 =
      snapshot1.val() as RealtimeDBReadModel<ClientShoppingSummary>;

    assertIsNotNull(summary1);
    assertDeepEqual(summary1.pending, undefined);
    assertDeepEqual(summary1.confirmed, {
      cartsCount: 1,
      productItemsCount: 3, // 2 + 1
      totalAmount: 40, // 2*10 + 1*20
    });

    // Events from second shopping cart
    const cart2Events: Array<ReadEvent<ShoppingCartEvent, ExtendedMetadata>> = [
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: cart2Id,
          productItem: {
            productId: 'product-3',
            quantity: 5,
            unitPrice: 15,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName: `shopping_cart:${cart2Id}`,
          streamPosition: 1n,
          clientId,
        },
      },
      {
        type: 'ShoppingCartCancelled',
        data: {
          shoppingCartId: cart2Id,
          cancelledAt: new Date(),
        },
        metadata: {
          messageId: uuid(),
          streamName: `shopping_cart:${cart2Id}`,
          streamPosition: 2n,
          clientId,
        },
      },
    ];

    // Process cart2 events
    await projection.handle(cart2Events, { database });

    // Verify aggregation from both carts
    const snapshot2 = await database
      .ref(`${collectionName}/${clientId}`)
      .once('value');
    const summary2 =
      snapshot2.val() as RealtimeDBReadModel<ClientShoppingSummary>;

    assertIsNotNull(summary2);
    assertDeepEqual(summary2.pending, undefined);
    assertDeepEqual(summary2.confirmed, {
      cartsCount: 1,
      productItemsCount: 3,
      totalAmount: 40,
    });
    assertDeepEqual(summary2.cancelled, {
      cartsCount: 1,
      productItemsCount: 5, // from cart2
      totalAmount: 75, // 5*15
    });

    // Cleanup
    await database.ref(`${collectionName}/${clientId}`).remove();
  });

  void it('should handle single-stream projection using helper', async () => {
    if (!emulatorAvailable) {
      console.log('  ⊘ Skipped: Emulator not available');
      return;
    }

    const cartId = uuid();
    const streamName = `shopping_cart:${cartId}`;
    const collectionName = `ShoppingCartDetails_${Date.now()}`;

    type ShoppingCartDetails = {
      cartId: string;
      itemsCount: number;
      totalAmount: number;
      status: 'pending' | 'confirmed' | 'cancelled';
    };

    const projection = realtimeDBSingleStreamProjection<
      ShoppingCartDetails,
      ShoppingCartEvent,
      RealtimeDBReadEventMetadata
    >({
      collectionName,
      evolve: (doc, event) => {
        const current = doc ?? {
          cartId: '',
          itemsCount: 0,
          totalAmount: 0,
          status: 'pending' as const,
        };

        switch (event.type) {
          case 'ProductItemAddedToShoppingCart':
            return {
              ...current,
              cartId: event.data.shoppingCartId,
              itemsCount: current.itemsCount + event.data.productItem.quantity,
              totalAmount:
                current.totalAmount +
                event.data.productItem.quantity *
                  event.data.productItem.unitPrice,
            };
          case 'ShoppingCartConfirmed':
            return {
              ...current,
              status: 'confirmed' as const,
            };
          case 'ShoppingCartCancelled':
            return {
              ...current,
              status: 'cancelled' as const,
            };
          default:
            return current;
        }
      },
      canHandle: [
        'ProductItemAddedToShoppingCart',
        'ShoppingCartConfirmed',
        'ShoppingCartCancelled',
      ],
    });

    const events: Array<
      ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>
    > = [
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: cartId,
          productItem: {
            productId: 'product-1',
            quantity: 3,
            unitPrice: 10,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
      {
        type: 'ShoppingCartConfirmed',
        data: {
          shoppingCartId: cartId,
          confirmedAt: new Date(),
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 2n,
        },
      },
    ];

    await projection.handle(events, { database });

    const snapshot = await database
      .ref(`${collectionName}/${streamName}`)
      .once('value');
    const details = snapshot.val() as RealtimeDBReadModel<ShoppingCartDetails>;

    assertIsNotNull(details);
    assertDeepEqual(details.cartId, cartId);
    assertDeepEqual(details.itemsCount, 3);
    assertDeepEqual(details.totalAmount, 30);
    assertDeepEqual(details.status, 'confirmed');

    // Cleanup
    await database.ref(`${collectionName}/${streamName}`).remove();
  });

  void it('should handle projection with nullable document evolve', async () => {
    if (!emulatorAvailable) {
      console.log('  ⊘ Skipped: Emulator not available');
      return;
    }

    const clientId = uuid();
    const cartId = uuid();
    const collectionName = `ClientSummaryWithInit_${Date.now()}`;

    const projection = realtimeDBMultiStreamProjection<
      ClientShoppingSummary,
      ShoppingCartEvent,
      ExtendedMetadata
    >({
      collectionName,
      getDocumentId: (event) => event.metadata.clientId,
      evolve: evolveClientSummary,
      canHandle: ['ProductItemAddedToShoppingCart'],
    });

    const events: Array<ReadEvent<ShoppingCartEvent, ExtendedMetadata>> = [
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: cartId,
          productItem: {
            productId: 'product-1',
            quantity: 2,
            unitPrice: 5,
          },
        },
        metadata: {
          messageId: uuid(),
          streamName: `shopping_cart:${cartId}`,
          streamPosition: 1n,
          clientId,
        },
      },
    ];

    await projection.handle(events, { database });

    const snapshot = await database
      .ref(`${collectionName}/${clientId}`)
      .once('value');
    const summary =
      snapshot.val() as RealtimeDBReadModel<ClientShoppingSummary>;

    assertIsNotNull(summary);
    assertDeepEqual(summary.clientId, clientId);
    assertDeepEqual(summary.pending, {
      cartId,
      productItemsCount: 2,
      totalAmount: 10,
    });

    // Cleanup
    await database.ref(`${collectionName}/${clientId}`).remove();
  });

  void it('should delete projection when evolve returns null', async () => {
    if (!emulatorAvailable) {
      console.log('  ⊘ Skipped: Emulator not available');
      return;
    }

    const cartId = uuid();
    const streamName = `shopping_cart:${cartId}`;
    const collectionName = `DeletableCart_${Date.now()}`;

    type CartStatus = {
      cartId: string;
      status: 'active' | 'deleted';
    };

    const projection = realtimeDBSingleStreamProjection<
      CartStatus,
      ShoppingCartEvent,
      RealtimeDBReadEventMetadata
    >({
      collectionName,
      evolve: (doc, event) => {
        if (event.type === 'ShoppingCartCancelled') {
          return null; // Delete projection
        }
        return doc ?? { cartId: '', status: 'active' as const };
      },
      canHandle: ['ProductItemAddedToShoppingCart', 'ShoppingCartCancelled'],
    });

    // Create projection
    const createEvents: Array<
      ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>
    > = [
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: cartId,
          productItem: { productId: 'p1', quantity: 1, unitPrice: 10 },
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 1n,
        },
      },
    ];

    await projection.handle(createEvents, { database });

    // Verify created
    let snapshot = await database
      .ref(`${collectionName}/${streamName}`)
      .once('value');
    assertIsNotNull(snapshot.val());

    // Delete projection
    const deleteEvents: Array<
      ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>
    > = [
      {
        type: 'ShoppingCartCancelled',
        data: {
          shoppingCartId: cartId,
          cancelledAt: new Date(),
        },
        metadata: {
          messageId: uuid(),
          streamName,
          streamPosition: 2n,
        },
      },
    ];

    await projection.handle(deleteEvents, { database });

    // Verify deleted
    snapshot = await database
      .ref(`${collectionName}/${streamName}`)
      .once('value');
    assertDeepEqual(snapshot.val(), null);

    // Cleanup
    await database.ref(`${collectionName}/${streamName}`).remove();
  });
});
