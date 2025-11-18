[![](https://dcbadge.vercel.app/api/server/fTpqUTMmVa?style=flat)](https://discord.gg/fTpqUTMmVa) [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" height="20px" />](https://www.linkedin.com/in/oskardudycz/) [![Github Sponsors](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&link=https://github.com/sponsors/event-driven-io)](https://github.com/sponsors/event-driven-io) [![blog](https://img.shields.io/badge/blog-event--driven.io-brightgreen)](https://event-driven.io/?utm_source=event_sourcing_nodejs) [![blog](https://img.shields.io/badge/%F0%9F%9A%80-Architecture%20Weekly-important)](https://www.architecture-weekly.com/?utm_source=event_sourcing_nodejs)

![](../../../docs/public/logo.png)

# Emmett - Event-sourced WebApi with Express.js and OpenAPI

This sample demonstrates a complete event-sourced shopping cart API using:

- **Event Sourcing** with Emmett
- **Express.js** for REST API
- **OpenAPI 3.0** specification with validation
- **Operation Handlers** for automatic route wiring
- **In-memory storage** (no external dependencies)
- **Comprehensive testing** (unit, integration, E2E)

Read more in:
- [Emmett getting started guide](https://event-driven-io.github.io/emmett/getting-started.html)
- [OpenAPI validation documentation](../../../src/packages/emmett-expressjs/docs/openapi-validation.md)

## Key Features

### 🚀 No External Dependencies
- Uses in-memory event store (`getInMemoryEventStore()`)
- Uses in-memory message bus (`getInMemoryMessageBus()`)
- Perfect for learning, prototyping, and testing
- Run with just `npm install && npm start`

### 📝 OpenAPI-First Design
- Complete OpenAPI 3.0 specification in [`openapi.yml`](./openapi.yml)
- Automatic request/response validation
- API contract drives implementation
- Served spec at `/api-docs/openapi.json`

### 🔧 Operation Handlers
- Routes automatically wired from OpenAPI `operationId`
- No manual route definitions needed
- Implementation matches specification by design
- Type-safe with TypeScript

### ✅ Comprehensive Testing
- **Unit tests**: Pure business logic (`businessLogic.unit.spec.ts`)
- **Integration tests**: Handlers with event store (`handlers.int.spec.ts`)
- **E2E tests**: Full application flow (`handlers.e2e.spec.ts`)
- OpenAPI validation error scenarios included

## Prerequisites

No external dependencies required! Just Node.js 18+.

Install packages:

```bash
npm install
```

## Running

Start the server:

```bash
npm start
```

The API will be available at **http://localhost:3000**

### OpenAPI Specification

View the OpenAPI spec:
- **JSON**: http://localhost:3000/api-docs/openapi.json
- **YAML**: [openapi.yml](./openapi.yml)

## Testing

Run all tests:

```bash
npm test
```

Run specific test suites:

```bash
npm run test:unit    # Unit tests (business logic)
npm run test:int     # Integration tests (with event store)
npm run test:e2e     # E2E tests (full application)
```

### Manual Testing

Use the [.http](./.http) file with VS Code REST Client extension to test endpoints manually.

## Running with Docker

Build:

```bash
docker-compose --profile app build
```

Run:

```bash
docker-compose --profile app up
```

## API Endpoints

All endpoints defined in [openapi.yml](./openapi.yml):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/clients/{clientId}/shopping-carts/current/product-items` | Add product to cart |
| DELETE | `/clients/{clientId}/shopping-carts/current/product-items` | Remove product from cart |
| POST | `/clients/{clientId}/shopping-carts/current/confirm` | Confirm shopping cart |
| DELETE | `/clients/{clientId}/shopping-carts/current` | Cancel shopping cart |
| GET | `/api-docs/openapi.json` | Get OpenAPI specification |

## Project Structure

```
expressjs-with-openapi/
├── openapi.yml                         # OpenAPI 3.0 specification
├── src/
│   ├── index.ts                       # Application entry point
│   ├── handlers/
│   │   └── shoppingCarts.ts          # Operation handlers (auto-wired routes)
│   └── shoppingCarts/
│       ├── businessLogic.ts          # Command handlers & business rules
│       ├── businessLogic.unit.spec.ts # Unit tests
│       ├── shoppingCart.ts           # Events, state, evolve function
│       ├── handlers.int.spec.ts      # Integration tests
│       ├── handlers.e2e.spec.ts      # E2E tests
│       └── index.ts                  # Module exports
├── .http                              # Manual HTTP tests
├── Dockerfile                         # Docker configuration
├── docker-compose.yml                 # Docker Compose setup
└── package.json                       # Dependencies & scripts
```

## How It Works

### 1. OpenAPI Specification

The [`openapi.yml`](./openapi.yml) file defines the API contract:

```yaml
paths:
  /clients/{clientId}/shopping-carts/current/product-items:
    post:
      operationId: addProductItem
      x-eov-operation-handler: handlers/shoppingCarts
      # ... request/response schemas
```

### 2. Operation Handlers

The `operationId` maps to exported functions in [`src/handlers/shoppingCarts.ts`](./src/handlers/shoppingCarts.ts):

```typescript
// Exported function name matches operationId
export const addProductItem = on(async (request: Request) => {
  // Handler implementation
});
```

### 3. Automatic Route Wiring

In [`src/index.ts`](./src/index.ts), routes are wired automatically:

```typescript
const application = getApplication({
  apis: [], // No manual routes!

  openApiValidator: createOpenApiValidatorOptions(
    'openapi.yml',
    {
      validateRequests: true,
      operationHandlers: './handlers',
    },
  ),
});
```

### 4. Event Sourcing

Commands trigger events, stored in the in-memory event store:

```typescript
const eventStore = getInMemoryEventStore();

await handle(eventStore, shoppingCartId, (state) =>
  addProductItem(command, state),
);
```

## Key Differences from Other Samples

| Feature | expressjs-with-mongodb | expressjs-with-openapi |
|---------|------------------------|------------------------|
| **Storage** | MongoDB | In-memory |
| **Projections** | Yes (getDetails, getShortInfo) | No |
| **API Definition** | Manual routes in code | OpenAPI specification |
| **Route Wiring** | Express Router | Operation Handlers |
| **Validation** | Manual | Automatic (OpenAPI) |
| **External Deps** | MongoDB, Testcontainers | None |
| **GET Endpoints** | Yes (read models) | No (write-only API) |

## Business Logic

The business logic remains identical to other samples, demonstrating:

- **Commands**: `AddProductItem`, `RemoveProductItem`, `Confirm`, `Cancel`
- **Events**: `ProductItemAdded`, `ProductItemRemoved`, `ShoppingCartConfirmed`, `ShoppingCartCancelled`
- **State management**: Event-sourced aggregate
- **Business rules**:
  - Cannot modify closed carts
  - Cannot confirm empty carts
  - Product quantity must be positive
  - etc.

## Learn More

### Documentation
- [Emmett Documentation](https://event-driven-io.github.io/emmett/)
- [OpenAPI Validation Guide](../../../src/packages/emmett-expressjs/docs/openapi-validation.md)
- [Event Sourcing Basics](https://event-driven.io/en/event_sourcing_basics/)

### Related Tools
- [express-openapi-validator](https://github.com/cdimascio/express-openapi-validator)
- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.0)

### Other Samples
- [expressjs-with-mongodb](../expressjs-with-mongodb) - With MongoDB storage & projections
- [expressjs-with-postgresql](../expressjs-with-postgresql) - With PostgreSQL storage
- [expressjs-with-esdb](../expressjs-with-esdb) - With EventStoreDB

## License

MIT

## Contributing

Contributions welcome! See [CONTRIBUTING.md](../../../CONTRIBUTING.md).
