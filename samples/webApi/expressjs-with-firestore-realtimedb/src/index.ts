import { Firestore } from '@google-cloud/firestore';
import { getInMemoryMessageBus } from '@event-driven-io/emmett';
import { getApplication, startAPI } from '@event-driven-io/emmett-expressjs';
import {
  firestoreEventStoreConsumer,
  getFirestoreEventStore,
} from '@event-driven-io/emmett-firestore';
import type { Application } from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import shoppingCarts, { type ShoppingCartConfirmed } from './shoppingCarts';
import { createRealtimeDBProcessor } from './shoppingCarts/processor';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
const realtimeDBHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || 'localhost:9000';
const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-shopping-cart';

const firestore = new Firestore({
  projectId,
  host: firestoreHost,
  ssl: false,
});

// Initialize Firebase Admin for RealtimeDB
const app = initializeApp({
  projectId,
  databaseURL: `http://${realtimeDBHost}?ns=${projectId}`,
});

const database = getDatabase(app);

const eventStore = getFirestoreEventStore({
  firestore,
});

const inMemoryMessageBus = getInMemoryMessageBus();

// dummy example to show subscription
inMemoryMessageBus.subscribe((event: ShoppingCartConfirmed) => {
  console.log('Shopping Cart confirmed: ' + JSON.stringify(event));
}, 'ShoppingCartConfirmed');

const getUnitPrice = (_productId: string) => {
  return Promise.resolve(100);
};

// Create consumer to update RealtimeDB projections
const consumer = firestoreEventStoreConsumer({
  firestore,
  processors: [createRealtimeDBProcessor(database, shoppingCarts.projections)],
  pollingIntervalMs: 500, // Poll every 500ms
});

// Start the consumer
void consumer.start();

const application: Application = getApplication({
  apis: [
    shoppingCarts.api(
      eventStore,
      database,
      inMemoryMessageBus,
      getUnitPrice,
      () => new Date(),
    ),
  ],
});

startAPI(application);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  consumer.stop();
  await firestore.terminate();
  await app.delete();
  process.exit(0);
});
