export { getFirestoreEventStore } from './eventStore/firestoreEventStore';
export type {
  FirestoreEventStore,
  FirestoreEventStoreConfig,
  FirestoreReadEventMetadata,
} from './eventStore/firestoreEventStore';

export { firestoreEventStoreConsumer } from './eventStore/consumers/firestoreEventStoreConsumer';
export type {
  FirestoreEventStoreConsumer,
  FirestoreEventStoreConsumerConfig,
  FirestoreProcessor,
} from './eventStore/consumers/firestoreEventStoreConsumer';
