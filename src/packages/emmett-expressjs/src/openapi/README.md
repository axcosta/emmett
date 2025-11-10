# OpenAPI Validator Integration

This module provides optional integration with [express-openapi-validator](https://github.com/cdimascio/express-openapi-validator) for validating HTTP requests and responses against an OpenAPI 3.x specification.

## Installation

The `express-openapi-validator` package is an **optional peer dependency**. Install it only if you want to use OpenAPI validation:

```bash
npm install express-openapi-validator
```

## Usage

### Basic Configuration

```typescript
import {
  getApplication,
  createOpenApiValidatorOptions,
} from '@event-driven-io/emmett-expressjs';

const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    validateRequests: true,
    validateResponses: true,
  }),
});
```

### Using OpenAPI Spec Object

You can also pass the OpenAPI specification as an object instead of a file path:

```typescript
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'My API',
    version: '1.0.0',
  },
  paths: {
    '/api/users': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created',
          },
        },
      },
    },
  },
};

const app = getApplication({
  apis: [usersApi],
  openApiValidator: createOpenApiValidatorOptions(openApiSpec),
});
```

### Configuration Options

The `createOpenApiValidatorOptions` helper provides sensible defaults, but you can customize the behavior:

```typescript
const validatorOptions = createOpenApiValidatorOptions('./openapi.yaml', {
  // Validate incoming requests (default: true)
  validateRequests: true,

  // Validate outgoing responses (default: false)
  validateResponses: true,

  // Validate security requirements (default: true)
  validateSecurity: false,

  // Enable format validation with ajv-formats (default: true)
  validateFormats: true,

  // Paths to ignore during validation
  ignorePaths: /^\/health/,
});

const app = getApplication({
  apis: [myApi],
  openApiValidator: validatorOptions,
});
```

### Using Operation Handlers

Express OpenAPI Validator supports automatic routing based on `operationId` in your OpenAPI spec. This is a powerful pattern that eliminates the need for manual route definitions:

```typescript
// Define your OpenAPI spec with operationIds
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Shopping Cart API',
    version: '1.0.0',
  },
  paths: {
    '/shopping-carts/{cartId}': {
      get: {
        operationId: 'getShoppingCart', // Maps to handlers/getShoppingCart.ts
        parameters: [
          {
            name: 'cartId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Shopping cart details' },
        },
      },
    },
  },
};

// Configure with operation handlers path
const app = getApplication({
  apis: [], // No manual route definitions needed!
  openApiValidator: createOpenApiValidatorOptions(openApiSpec, {
    operationHandlers: './handlers', // Path to handlers directory
  }),
});
```

Your handler files should export the handler function matching the `operationId`:

```typescript
// handlers/getShoppingCart.ts
import type { Request, Response } from 'express';

export default async (req: Request, res: Response) => {
  const { cartId } = req.params;
  // Your business logic here
  res.json({ id: cartId, items: [] });
};
```

**Benefits of Operation Handlers:**

- ✅ Routes are automatically derived from OpenAPI spec
- ✅ Reduces boilerplate and eliminates manual route/handler mapping
- ✅ Ensures API implementation stays in sync with specification
- ✅ Type-safe when combined with OpenAPI code generation tools

See the [operation handlers example](./exampleWithOperationHandlers.ts) for a complete working implementation.

### Direct Configuration

You can also pass the validator options directly without using the helper:

```typescript
import type { OpenApiValidatorOptions } from '@event-driven-io/emmett-expressjs';

const validatorOptions: OpenApiValidatorOptions = {
  apiSpec: './openapi.yaml',
  validateRequests: true,
  validateResponses: false,
};

const app = getApplication({
  apis: [myApi],
  openApiValidator: validatorOptions,
});
```

## Error Handling

Validation errors are automatically handled by the built-in problem details middleware. Invalid requests will receive a `400 Bad Request` response with detailed error information:

```json
{
  "status": 400,
  "title": "Bad Request",
  "detail": "request.body.email should match format \"email\"",
  "errors": [
    {
      "path": ".email",
      "message": "should match format \"email\"",
      "errorCode": "format.email"
    }
  ]
}
```

## Benefits

- **Contract-First Development**: Ensure your API implementation matches your OpenAPI specification
- **Request Validation**: Automatically validate request parameters, query strings, headers, and body
- **Response Validation**: Verify that your API returns responses matching the specification (useful in development)
- **Security Validation**: Enforce security requirements defined in your OpenAPI spec
- **Better Error Messages**: Get detailed validation errors with precise information about what failed

## Important Notes

1. **Optional Dependency**: The validator is completely optional. Your application will work without it if not configured.
2. **Performance**: Request validation adds minimal overhead. Response validation should typically be disabled in production.
3. **Compatibility**: Requires OpenAPI 3.x specifications. OpenAPI 2.0 (Swagger) is not supported.
4. **Middleware Order**: The validator is applied before your API routes, ensuring requests are validated before reaching your handlers.

## Complete Example

```typescript
import {
  getApplication,
  createOpenApiValidatorOptions,
  startAPI,
} from '@event-driven-io/emmett-expressjs';
import { getPostgreSQLEventStore } from '@event-driven-io/emmett-postgresql';

const eventStore = getPostgreSQLEventStore(process.env.DATABASE_URL);

const app = getApplication({
  apis: [usersApi(eventStore), productsApi(eventStore)],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    validateRequests: true,
    validateResponses: process.env.NODE_ENV === 'development',
    ignorePaths: /^\/(health|metrics)/,
  }),
});

const server = startAPI(app, { port: 3000 });
```

## See Also

- [express-openapi-validator documentation](https://github.com/cdimascio/express-openapi-validator)
- [OpenAPI 3.x Specification](https://spec.openapis.org/oas/v3.1.0)
- [Emmett Getting Started Guide](https://event-driven-io.github.io/emmett/getting-started)
