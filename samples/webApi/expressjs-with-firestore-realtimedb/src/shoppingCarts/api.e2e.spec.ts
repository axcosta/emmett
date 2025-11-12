import { Firestore } from '@google-cloud/firestore';
import { getInMemoryMessageBus } from '@event-driven-io/emmett';
import {
  ApiE2ESpecification,
  expectResponse,
  getApplication,
  type TestRequest,
} from '@event-driven-io/emmett-expressjs';
import {
  firestoreEventStoreConsumer,
  getFirestoreEventStore,
} from '@event-driven-io/emmett-firestore';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import shoppingCarts from './';
import { type ProductItem } from './shoppingCart';
import { shoppingCartApi } from './api';
import { createRealtimeDBProcessor } from './processor';

const getUnitPrice = () => {
  return Promise.resolve(100);
};

// Helper to wait for projection to be updated
const waitForProjection = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

void describe('ShoppingCart E2E with Firestore + RealtimeDB', () => {
  let clientId: string;
  let shoppingCartId: string;
  let firestore: Firestore;
  let app: App;
  let database: Database;
  let given: ApiE2ESpecification;
  let consumer: ReturnType<typeof firestoreEventStoreConsumer>;

  before(async () => {
    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
    const realtimeDBHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || 'localhost:9000';
    const projectId = 'demo-shopping-cart-test';

    firestore = new Firestore({
      projectId,
      host: firestoreHost,
      ssl: false,
    });

    // Initialize Firebase Admin for RealtimeDB
    app = initializeApp({
      projectId,
      databaseURL: `http://${realtimeDBHost}?ns=${projectId}`,
    });

    database = getDatabase(app);

    const eventStore = getFirestoreEventStore({
      firestore,
    });

    // Create and start consumer
    consumer = firestoreEventStoreConsumer({
      firestore,
      processors: [createRealtimeDBProcessor(database, shoppingCarts.projections)],
      pollingIntervalMs: 100, // Poll frequently in tests
    });

    await consumer.start();

    const inMemoryMessageBus = getInMemoryMessageBus();

    given = ApiE2ESpecification.for(
      () => eventStore,
      (eventStore) =>
        getApplication({
          apis: [
            shoppingCartApi(
              eventStore,
              database,
              inMemoryMessageBus,
              getUnitPrice,
              () => now,
            ),
          ],
        }),
    );
  });

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = `shopping_cart:${clientId}:current`;
  });

  after(async () => {
    consumer.stop();
    await firestore.terminate();
    await deleteApp(app);
  });

  void describe('When empty', () => {
    void it('should add product item', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send(productItem),
        )
        .then([expectResponse(204)]);
    });
  });

  void describe('When open', () => {
    const openedShoppingCart: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/current/product-items`)
        .send(productItem);

    void it('gets shopping cart details', async () => {
      // First add product item
      await given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send(productItem),
        )
        .then([expectResponse(204)]);

      // Wait for projection to be updated (consumer polls every 100ms, wait longer to be safe)
      await waitForProjection(1500);

      // Then read from projection
      return given()
        .when((request) =>
          request.get(`/clients/${clientId}/shopping-carts/current`).send(),
        )
        .then([
          expectResponse(200, {
            body: {
              id: shoppingCartId,
              clientId,
              productItems: [{ ...productItem, unitPrice }],
              productItemsCount: productItem.quantity,
              totalAmount: unitPrice * productItem.quantity,
              status: 'Opened',
            },
          }),
        ]);
    });
  });

  const now = new Date();
  const unitPrice = 100;

  const getRandomProduct = (): ProductItem => {
    return {
      productId: randomUUID(),
      quantity: Math.floor(Math.random() * 10) + 1,
    };
  };

  const productItem = getRandomProduct();
});
