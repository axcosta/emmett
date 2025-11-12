# @event-driven-io/emmett-firestore

Google Firestore adapter for Emmett Event Sourcing library.

## Installation

```bash
npm install @event-driven-io/emmett @event-driven-io/emmett-firestore @google-cloud/firestore
```

## Usage

### Basic Setup

```typescript
import { Firestore } from '@google-cloud/firestore';
import { getFirestoreEventStore } from '@event-driven-io/emmett-firestore';

const firestore = new Firestore({
  projectId: 'your-project-id',
});

const eventStore = getFirestoreEventStore({
  firestore,
});
```

### Append Events

```typescript
import { STREAM_DOES_NOT_EXIST } from '@event-driven-io/emmett';

await eventStore.appendToStream(
  'shopping-cart-123',
  [
    {
      type: 'ShoppingCartOpened',
      data: { customerId: 'customer-1' },
    },
  ],
  { expectedStreamVersion: STREAM_DOES_NOT_EXIST }
);
```

### Read Events

```typescript
const result = await eventStore.readStream('shopping-cart-123');

console.log('Current version:', result.currentStreamVersion);
console.log('Events:', result.events);
```

### Aggregate Stream

```typescript
type ShoppingCart = {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
  status: 'open' | 'confirmed';
};

const { state } = await eventStore.aggregateStream<ShoppingCart, CartEvent>(
  'shopping-cart-123',
  {
    initialState: () => ({
      customerId: '',
      items: [],
      status: 'open',
    }),
    evolve: (state, event) => {
      switch (event.type) {
        case 'ShoppingCartOpened':
          return { ...state, customerId: event.data.customerId };
        case 'ProductAdded':
          return {
            ...state,
            items: [...state.items, event.data],
          };
        default:
          return state;
      }
    },
  }
);
```

## Firestore Structure

The package uses **subcollections** for optimal performance and organization:

### Collections Hierarchy

```
/streams/                                    (root collection)
  {streamName}/                              (document - stream metadata)
    version: number
    createdAt: Timestamp
    updatedAt: Timestamp
    
    /events/                                 (subcollection - stream events)
      {streamVersion}/                       (document ID: "0000000000", "0000000001", etc)
        type: string
        data: object
        metadata: object
        timestamp: Timestamp
        globalPosition: number
        streamVersion: number

/_counters/                                  (system collection)
  global_position/
    value: number
    updatedAt: Timestamp
```

### Example Structure

```
/streams/
  User-1234/
    version: 2
    createdAt: 2025-11-11T02:00:00Z
    updatedAt: 2025-11-11T02:05:00Z
    
    /events/
      0000000000: { type: "UserRegistered", data: {...}, globalPosition: 0 }
      0000000001: { type: "UserSignedIn", data: {...}, globalPosition: 5 }
      0000000002: { type: "UserSignedOut", data: {...}, globalPosition: 12 }

  Order-5678/
    version: 0
    createdAt: 2025-11-11T02:10:00Z
    updatedAt: 2025-11-11T02:10:00Z
    
    /events/
      0000000000: { type: "OrderCreated", data: {...}, globalPosition: 1 }
```

### Why Subcollections?

**Benefits:**
- ✅ **Natural isolation** - Each stream has its own event subcollection
- ✅ **Better performance** - No need to filter by `streamName`
- ✅ **Automatic ordering** - Document IDs provide natural sort order
- ✅ **No composite indexes needed** - Simple queries
- ✅ **Better scalability** - Firestore distributes subcollections efficiently

**No Indexes Required!** The subcollection structure works with Firestore's default indexes.

## Limitations

- **No projections support** (yet) - This adapter focuses on event storage only
- **Transaction limits**: Firestore transactions are limited to 500 operations and 10MB
- **Manual indexes**: Composite indexes must be created manually in Firestore Console
- **Polling-based consumers**: Unlike MongoDB, Firestore doesn't have native change streams

## Consumer Example

```typescript
import { firestoreEventStoreConsumer } from '@event-driven-io/emmett-firestore';

const consumer = firestoreEventStoreConsumer({
  firestore,
  processors: [
    {
      async handle(events) {
        console.log('Processing', events.length, 'events');
        // Your processing logic
      },
    },
  ],
  pollingIntervalMs: 1000, // Optional, defaults to 1000ms
});

await consumer.start();
// ... later
await consumer.stop();
```

## Configuration Options

```typescript
type FirestoreEventStoreConfig = {
  firestore: Firestore;
  streamsCollectionName?: string;        // Default: 'streams'
};
```

## License

MIT
