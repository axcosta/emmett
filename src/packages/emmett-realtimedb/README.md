# Emmett - Firebase Realtime Database

Firebase Realtime Database support for Emmett Event Sourcing.

## Installation

```bash
npm install @event-driven-io/emmett-realtimedb firebase-admin
```

## Usage

### Setting up Firebase Admin

```typescript
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: 'your-project-id',
    clientEmail: 'your-client-email',
    privateKey: 'your-private-key',
  }),
  databaseURL: 'https://your-project-id.firebaseio.com',
});

const database = getDatabase(app);
```

### Defining Projections

```typescript
import { realtimeDBProjection } from '@event-driven-io/emmett-realtimedb';

type ShoppingCartOpened = Event<
  'ShoppingCartOpened',
  {
    shoppingCartId: string;
    clientId: string;
    openedAt: string;
  }
>;

type ProductItemAddedToShoppingCart = Event<
  'ProductItemAddedToShoppingCart',
  {
    shoppingCartId: string;
    productItem: { productId: string; quantity: number };
  }
>;

type ShoppingCartDetails = {
  shoppingCartId: string;
  clientId: string;
  productItems: Array<{ productId: string; quantity: number }>;
  openedAt: string;
};

const shoppingCartDetailsProjection = realtimeDBProjection<
  ShoppingCartDetails,
  ShoppingCartOpened | ProductItemAddedToShoppingCart
>({
  name: 'shopping-cart-details',
  canHandle: ['ShoppingCartOpened', 'ProductItemAddedToShoppingCart'],
  evolve: (document, event) => {
    if (!document) {
      if (event.type === 'ShoppingCartOpened') {
        return {
          shoppingCartId: event.data.shoppingCartId,
          clientId: event.data.clientId,
          productItems: [],
          openedAt: event.data.openedAt,
        };
      }
      return null;
    }

    if (event.type === 'ProductItemAddedToShoppingCart') {
      return {
        ...document,
        productItems: [...document.productItems, event.data.productItem],
      };
    }

    return document;
  },
});
```

### Projection with Initial State

```typescript
const shoppingCartProjection = realtimeDBProjection<
  ShoppingCartDetails,
  ShoppingCartEvent
>({
  name: 'shopping-cart',
  canHandle: ['ShoppingCartOpened', 'ProductItemAddedToShoppingCart'],
  initialState: () => ({
    shoppingCartId: '',
    clientId: '',
    productItems: [],
    openedAt: '',
  }),
  evolve: (document, event) => {
    switch (event.type) {
      case 'ShoppingCartOpened':
        return {
          ...document,
          shoppingCartId: event.data.shoppingCartId,
          clientId: event.data.clientId,
          openedAt: event.data.openedAt,
        };
      case 'ProductItemAddedToShoppingCart':
        return {
          ...document,
          productItems: [...document.productItems, event.data.productItem],
        };
      default:
        return document;
    }
  },
});
```

### Testing Projections

```typescript
import { RealtimeDBProjectionSpec, expectReadModel } from '@event-driven-io/emmett-realtimedb';
import { getDatabase } from 'firebase-admin/database';
import { describe, it, before, after } from 'node:test';

void describe('Shopping Cart Projection', () => {
  let database: Database;

  before(async () => {
    // Setup Firebase Admin for testing
    database = getDatabase();
  });

  after(async () => {
    // Cleanup
    await database.goOffline();
  });

  void it('projects shopping cart details', async () => {
    const streamName = `shopping-cart:${randomUUID()}`;

    await RealtimeDBProjectionSpec.for({
      projection: shoppingCartDetailsProjection,
      database,
      handler: async (streamName, events, db) => {
        // Your handler implementation
        // This would typically involve processing events and updating projections
      },
    })({
      streamName,
      events: [],
    })
      .when([
        {
          type: 'ShoppingCartOpened',
          data: {
            shoppingCartId: '123',
            clientId: 'client-1',
            openedAt: '2024-01-01T00:00:00Z',
          },
        },
        {
          type: 'ProductItemAddedToShoppingCart',
          data: {
            shoppingCartId: '123',
            productItem: { productId: 'product-1', quantity: 2 },
          },
        },
      ])
      .then(
        expectReadModel.withName('shopping-cart-details').toHave({
          shoppingCartId: '123',
          clientId: 'client-1',
          productItems: [{ productId: 'product-1', quantity: 2 }],
        }),
      );
  });
});
```

## Features

- **Projections**: Build read models from events stored in Firebase Realtime Database
- **Type-safe**: Full TypeScript support with proper type inference
- **Testing utilities**: Built-in test helpers for projection testing
- **Evolve pattern**: Functional approach to building projections

## Data Structure

Projections are stored in Firebase Realtime Database with the following structure:

```
streams/
  {streamName}/
    projections/
      {projectionName}/
        ...projection data...
        _metadata:
          streamId: string
          name: string
          schemaVersion: number
          streamPosition: bigint
```

## API Reference

### `realtimeDBProjection`

Creates a projection definition for Firebase Realtime Database.

**Parameters:**
- `name?: string` - Optional projection name (defaults to `_default`)
- `schemaVersion?: number` - Optional schema version (defaults to 1)
- `canHandle: string[]` - Array of event types this projection can handle
- `evolve: (document, event) => document | null` - Function to evolve the document state
- `initialState?: () => document` - Optional initial state factory

**Returns:** `RealtimeDBProjectionDefinition`

### `handleProjections`

Processes events through registered projections.

### Testing Utilities

- `RealtimeDBProjectionSpec.for()` - Creates a projection specification for testing
- `expectReadModel` - Assertion helpers for read models
- `eventInStream()` - Helper for single event test scenarios
- `eventsInStream()` - Helper for multiple events test scenarios

## Testing

This package includes comprehensive unit and end-to-end tests. For detailed testing instructions, including how to set up Firebase Emulator Suite for local testing, see [TESTING.md](TESTING.md).

```bash
# Run unit tests
npm run test:unit

# Run end-to-end tests (requires Firebase setup)
npm run test:e2e

# Run all tests
npm test
```

## License

MIT
