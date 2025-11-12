# Shopping Cart API - Express.js with Firestore and Realtime Database

Sample WebApi using Event Sourcing with Emmett, Express.js, Google Cloud Firestore (Event Store), and Firebase Realtime Database (Projections).

## Features

- **Event Sourcing** with Firestore as Event Store
- **Projections** with Firebase Realtime Database (optional)
- **Optimistic Concurrency** using ETags
- **Docker Compose** setup with Firebase Emulators
- **E2E Tests** included

## Architecture

```
Express.js API
     │
     ├─── Commands ────────┐
     │                     │
     │              ┌──────▼──────┐
     │              │  Firestore  │
     │              │ Event Store │
     │              └──────┬──────┘
     │                     │
     │                  Events
     │                     │
     │              ┌──────▼──────────┐
     │              │  Realtime DB    │
     └─── Queries ─▶│  (Projections)  │
                    └─────────────────┘
```

## Prerequisites

- **Node.js** >= 20.11.1
- **Docker** and **Docker Compose** (for running Firebase Emulators)
- **Java** >= 11 (if running emulators locally without Docker)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Firebase Emulators

#### Using Docker Compose (Recommended)

```bash
docker-compose up firebase-emulator
```

This will start:
- Firestore Emulator on port 8080
- Realtime Database Emulator on port 9000
- Emulator UI on port 4000

#### Manually (requires Firebase CLI + Java)

```bash
npm install -g firebase-tools
firebase emulators:start --only firestore,database --project demo-shopping-cart
```

### 3. Run the Application

```bash
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Open Shopping Cart
```http
POST /clients/:clientId/shopping-carts
Content-Type: application/json

{
  "shoppingCartId": "cart-001"
}
```

### Add Product to Cart
```http
POST /clients/:clientId/shopping-carts/:shoppingCartId/product-items
Content-Type: application/json
If-Match: W/"1"

{
  "productItem": {
    "productId": "prod-001",
    "quantity": 2
  }
}
```

### Get Shopping Cart
```http
GET /clients/:clientId/shopping-carts/:shoppingCartId
```

### Remove Product from Cart
```http
DELETE /clients/:clientId/shopping-carts/:shoppingCartId/product-items
Content-Type: application/json
If-Match: W/"2"

{
  "productItem": {
    "productId": "prod-001",
    "quantity": 1
  }
}
```

### Confirm Shopping Cart
```http
POST /clients/:clientId/shopping-carts/:shoppingCartId/confirm
If-Match: W/"3"
```

## Testing

### Run All Tests
```bash
npm test
```

### Run E2E Tests
```bash
# Make sure Firebase emulators are running first
docker-compose up -d firebase-emulator

# Run tests
npm run test:e2e
```

### Run Unit Tests
```bash
npm run test:unit
```

### Manual Testing with .http file

Use the `.http` file with VS Code REST Client extension or similar tools:
1. Install [REST Client extension](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
2. Open `.http` file
3. Click "Send Request" above each request

## Docker

### Build and Run with Docker Compose

```bash
# Build and run the entire stack
docker-compose --profile app up

# Or run just the emulators
docker-compose up firebase-emulator
```

### Build Docker Image

```bash
docker build -t emmett-firestore-api .
```

## Development

### Watch Mode

```bash
# Watch TypeScript compilation
npm run build:ts:watch

# Watch tests
npm run test:watch
```

### Linting

```bash
# Check code style
npm run lint

# Fix code style issues
npm run fix
```

## Project Structure

```
src/
├── index.ts                          # Main application entry point
└── shoppingCarts/
    ├── api.ts                        # API routes and handlers
    ├── api.e2e.spec.ts              # E2E tests
    ├── shoppingCart.ts               # Domain model (events, state, commands)
    └── projection.ts                 # Realtime DB projection (optional)
```

## Environment Variables

- `FIRESTORE_EMULATOR_HOST` - Firestore emulator host (default: `localhost:8080`)
- `FIREBASE_DATABASE_EMULATOR_HOST` - Realtime Database emulator host (default: `localhost:9000`)
- `FIREBASE_PROJECT_ID` - Firebase project ID (default: `demo-shopping-cart`)
- `PORT` - API server port (default: `3000`)

## Key Concepts

### Event Sourcing with Firestore

Events are stored in Firestore as the source of truth. The current state is derived by replaying events.

### Optimistic Concurrency Control

ETags are used to ensure consistency. Clients must provide the expected version when modifying a shopping cart.

### Projections (Optional)

Realtime Database can be used to store denormalized views (projections) for faster reads. These are automatically updated when events are appended.

## Troubleshooting

### Emulators not starting

Make sure ports 8080, 9000, and 4000 are available:
```bash
lsof -i :8080
lsof -i :9000
lsof -i :4000
```

### Tests failing

1. Ensure emulators are running:
   ```bash
   curl http://localhost:8080
   ```

2. Check emulator logs:
   ```bash
   docker-compose logs firebase-emulator
   ```

## Learn More

- [Emmett Documentation](https://event-driven-io.github.io/emmett/)
- [Emmett Firestore](https://event-driven-io.github.io/emmett/packages/emmett-firestore/)
- [Emmett Realtime Database](https://event-driven-io.github.io/emmett/packages/emmett-realtimedb/)
- [Emmett Express.js](https://event-driven-io.github.io/emmett/packages/emmett-expressjs/)
- [Firebase Emulators](https://firebase.google.com/docs/emulator-suite)
