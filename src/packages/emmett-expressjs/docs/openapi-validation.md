# OpenAPI Validator Integration

This module provides optional integration with [express-openapi-validator](https://github.com/cdimascio/express-openapi-validator) for validating HTTP requests and responses against an OpenAPI 3.x specification.

## Installation

The `express-openapi-validator` package is an **optional peer dependency**. Install it only if you want to use OpenAPI validation:

```bash
npm install express-openapi-validator
```

## Quick Start

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

You can pass the OpenAPI specification as an object instead of a file path:

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
          '201': { description: 'User created' },
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

## Configuration Options

### Request Validation

Control how incoming requests are validated:

```typescript
const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    validateRequests: {
      // Allow query parameters not defined in spec
      allowUnknownQueryParameters: false,
      // Coerce types (e.g., "123" -> 123)
      coerceTypes: true,
      // Remove properties not in spec
      removeAdditional: false,
    },
  }),
});
```

### Response Validation

Validate outgoing responses (useful in development):

```typescript
const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    validateResponses: {
      // Remove additional properties from responses
      removeAdditional: 'all',
      // Coerce response types
      coerceTypes: true,
      // Custom error handler
      onError: (error, body, req) => {
        console.error('Response validation failed:', error);
      },
    },
  }),
});
```

### Security Validation

Implement custom authentication and authorization:

```typescript
import type { SecurityHandlers } from '@event-driven-io/emmett-expressjs';

const securityHandlers: SecurityHandlers = {
  // Bearer token authentication
  bearerAuth: async (req, scopes, schema) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    
    try {
      const user = await verifyToken(token);
      req.user = user;
      
      // Check if user has required scopes
      return scopes.every(scope => user.scopes.includes(scope));
    } catch {
      return false;
    }
  },
  
  // API Key authentication
  apiKeyAuth: async (req, scopes, schema) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return false;
    
    return await validateApiKey(apiKey as string);
  },
};

const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    validateSecurity: {
      handlers: securityHandlers,
    },
  }),
});
```

### Serving the OpenAPI Specification

Serve your OpenAPI spec at a public endpoint:

```typescript
const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    // Serve spec at /api-docs/openapi.json
    serveSpec: '/api-docs/openapi.json',
  }),
});

// Now accessible at: http://localhost:3000/api-docs/openapi.json
```

### Format Validation

Control format validation behavior:

```typescript
const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    // true = enable all formats
    // false = disable format validation
    // 'fast' = fast validation (recommended)
    // 'full' = comprehensive validation
    validateFormats: 'fast',
  }),
});
```

### File Uploads

Configure file upload handling:

```typescript
const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    fileUploader: {
      dest: './uploads',
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 5, // Max 5 files
      },
    },
  }),
});
```

### Ignoring Paths

Exclude certain paths from validation:

```typescript
const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    // Using RegExp
    ignorePaths: /^\/(health|metrics)/,
    
    // Or using a function
    // ignorePaths: (path) => path.startsWith('/internal/'),
  }),
});
```

## Using Operation Handlers

Express OpenAPI Validator supports automatic routing based on `operationId` in your OpenAPI spec. This eliminates manual route definitions:

### OpenAPI Specification with operationIds

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: Shopping Cart API
  version: 1.0.0
paths:
  /clients/{clientId}/shopping-carts:
    post:
      operationId: openShoppingCart
      parameters:
        - name: clientId
          in: path
          required: true
          schema:
            type: string
      responses:
        '201':
          description: Shopping cart created
```

### Application Configuration

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = getApplication({
  apis: [], // No manual routes needed!
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    operationHandlers: path.join(__dirname, './handlers'),
  }),
});
```

### Handler Implementation

Create a handler file matching the directory structure and operationId:

```typescript
// handlers/openShoppingCart.ts
import { on } from '@event-driven-io/emmett-expressjs';
import type { Request } from 'express';

export const openShoppingCart = on(async (request: Request) => {
  const clientId = request.params.clientId;
  
  // Your business logic here
  const result = await createShoppingCart(clientId);
  
  return Created({
    createdId: result.id,
    eTag: toWeakETag(result.version),
  });
});
```

See [basic example](../examples/openapi/basic/index.ts) and [operation handlers example](../examples/openapi/operation-handlers/index.ts) for complete working examples.

**Benefits of Operation Handlers:**

- ✅ Routes automatically derived from OpenAPI spec
- ✅ Reduces boilerplate code
- ✅ Ensures implementation matches specification
- ✅ Type-safe with proper TypeScript setup

## Advanced Configuration

### Complete Options Example

```typescript
import {
  getApplication,
  createOpenApiValidatorOptions,
  type SecurityHandlers,
} from '@event-driven-io/emmett-expressjs';

const securityHandlers: SecurityHandlers = {
  bearerAuth: async (req, scopes) => {
    // Custom auth logic
    return true;
  },
};

const app = getApplication({
  apis: [myApi],
  openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
    // Request validation
    validateRequests: {
      allowUnknownQueryParameters: false,
      coerceTypes: true,
      removeAdditional: false,
    },
    
    // Response validation
    validateResponses: {
      removeAdditional: 'all',
      coerceTypes: true,
    },
    
    // Security
    validateSecurity: {
      handlers: securityHandlers,
    },
    
    // Format validation
    validateFormats: 'fast',
    
    // Serve spec
    serveSpec: '/api-docs/openapi.json',
    
    // File uploads
    fileUploader: {
      dest: './uploads',
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    },
    
    // Ignore paths
    ignorePaths: /^\/(health|metrics)/,
    
    // Validate the spec itself
    validateApiSpec: true,
    
    // $ref resolution
    $refParser: {
      mode: 'dereference',
    },
  }),
});
```

## Error Handling

Validation errors are automatically handled by the built-in problem details middleware. Invalid requests receive a `400 Bad Request` response:

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

## Best Practices

1. **Development vs Production**: Enable response validation in development, disable in production for performance
2. **Security Handlers**: Always implement proper authentication/authorization in security handlers
3. **File Uploads**: Set appropriate limits to prevent abuse
4. **Spec Serving**: Only serve specs publicly if intended for API consumers
5. **Operation Handlers**: Use operation handlers for cleaner, more maintainable code

## Complete Example

```typescript
import {
  getApplication,
  createOpenApiValidatorOptions,
  startAPI,
  type SecurityHandlers,
} from '@event-driven-io/emmett-expressjs';
import { getInMemoryEventStore } from '@event-driven-io/emmett';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const eventStore = getInMemoryEventStore();

const securityHandlers: SecurityHandlers = {
  bearerAuth: async (req, scopes) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return !!token; // Implement proper validation
  },
};

const app = getApplication({
  apis: [], // Using operation handlers
  openApiValidator: createOpenApiValidatorOptions(
    path.join(__dirname, './openapi.yaml'),
    {
      // Validation
      validateRequests: true,
      validateResponses: process.env.NODE_ENV === 'development',
      
      // Security
      validateSecurity: {
        handlers: securityHandlers,
      },
      
      // Operation handlers
      operationHandlers: path.join(__dirname, './handlers'),
      
      // Serve spec
      serveSpec: '/api-docs/openapi.json',
      
      // Ignore health checks
      ignorePaths: /^\/health$/,
    },
  ),
});

startAPI(app, { port: 3000 });
```

## See Also

- [express-openapi-validator documentation](https://cdimascio.github.io/express-openapi-validator-documentation/)
- [OpenAPI 3.x Specification](https://spec.openapis.org/oas/v3.1.0)
- [Emmett Documentation](https://event-driven-io.github.io/emmett/)

## Examples

- [Basic example](../examples/openapi/basic/index.ts) - Basic OpenAPI validation with manual routes
- [With security](../examples/openapi/with-security/index.ts) - Custom security handlers (JWT, API keys)
- [Operation handlers](../examples/openapi/operation-handlers/index.ts) - Using operation handlers for automatic routing
- [Integration tests](../test/integration/openapi/openapi.int.spec.ts) - Integration tests demonstrating various features
