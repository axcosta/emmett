/**
 * Example: Using Security Handlers with OpenAPI Validator
 *
 * This example demonstrates how to implement custom authentication
 * and authorization using OpenAPI security schemes.
 */

import {
  createOpenApiValidatorOptions,
  getApplication,
  startAPI,
  type SecurityHandlers,
  type WebApiSetup,
} from '@event-driven-io/emmett-expressjs';
import type { Router } from 'express';

// OpenAPI specification with security schemes
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Secure Shopping Cart API',
    version: '1.0.0',
  },
  // Define security schemes
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
  },
  paths: {
    '/shopping-carts': {
      post: {
        summary: 'Create shopping cart',
        security: [{ bearerAuth: ['cart:write'] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: {
                  clientId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Shopping cart created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    clientId: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
          },
        },
      },
      get: {
        summary: 'List shopping carts',
        security: [{ bearerAuth: ['cart:read'] }],
        responses: {
          '200': {
            description: 'List of shopping carts',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      clientId: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/reports': {
      get: {
        summary: 'Admin reports',
        security: [{ apiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Admin report data',
          },
        },
      },
    },
  },
};

// Mock user database
const users = new Map([
  ['token-user-123', { id: 'user-123', scopes: ['cart:read', 'cart:write'] }],
  [
    'token-admin-456',
    { id: 'admin-456', scopes: ['cart:read', 'cart:write', 'admin'] },
  ],
]);

// Mock API keys
const apiKeys = new Set(['admin-key-abc123', 'admin-key-xyz789']);

// Define security handlers
const securityHandlers: SecurityHandlers = {
  // Bearer token authentication
  bearerAuth: async (req, scopes) => {
    const authHeader = req.headers.authorization as string | undefined;

    if (!authHeader?.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.replace('Bearer ', '');
    const user = users.get(token);

    if (!user) {
      return false;
    }

    // Attach user to request for use in handlers
    req.user = user;

    // Check if user has all required scopes
    if (scopes.length > 0) {
      return scopes.every((scope) => user.scopes.includes(scope));
    }

    return true;
  },

  // API Key authentication
  apiKeyAuth: async (req) => {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return false;
    }

    return apiKeys.has(apiKey);
  },
};

// Define API routes (manual routes, not using operation handlers)
const shoppingCartApi: WebApiSetup = (router: Router) => {
  router.post('/shopping-carts', (req, res) => {
    const { clientId } = req.body as { clientId: string };
    const cartId = `cart-${Date.now()}`;

    res.status(201).json({
      id: cartId,
      clientId,
    });
  });

  router.get('/shopping-carts', (_req, res) => {
    res.json([
      { id: 'cart-1', clientId: 'client-1' },
      { id: 'cart-2', clientId: 'client-2' },
    ]);
  });

  router.get('/admin/reports', (_req, res) => {
    res.json({
      totalCarts: 42,
      totalRevenue: 12345.67,
    });
  });
};

// Create application with security handlers
const app = getApplication({
  apis: [shoppingCartApi],
  openApiValidator: createOpenApiValidatorOptions(openApiSpec, {
    validateRequests: true,
    validateResponses: true,

    // Configure security validation with custom handlers
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    validateSecurity: {
      handlers: securityHandlers,
    },

    // Serve the OpenAPI spec at /api-docs
    serveSpec: '/api-docs/openapi.json',
  }),
});

// Example usage:
if (import.meta.url === `file://${process.argv[1]}`) {
  startAPI(app);

  console.log(`
🚀 Secure Shopping Cart API running!

Try these requests:

1. Create cart (with valid token):
   curl -X POST http://localhost:3000/shopping-carts \\
     -H "Authorization: Bearer token-user-123" \\
     -H "Content-Type: application/json" \\
     -d '{"clientId": "client-123"}'

2. Create cart (with invalid token - should fail):
   curl -X POST http://localhost:3000/shopping-carts \\
     -H "Authorization: Bearer invalid-token" \\
     -H "Content-Type: application/json" \\
     -d '{"clientId": "client-123"}'

3. List carts (requires cart:read scope):
   curl http://localhost:3000/shopping-carts \\
     -H "Authorization: Bearer token-user-123"

4. Admin reports (requires API key):
   curl http://localhost:3000/admin/reports \\
     -H "X-API-Key: admin-key-abc123"

5. View OpenAPI spec:
   curl http://localhost:3000/api-docs/openapi.json

Valid tokens:
- token-user-123 (scopes: cart:read, cart:write)
- token-admin-456 (scopes: cart:read, cart:write, admin)

Valid API keys:
- admin-key-abc123
- admin-key-xyz789
`);
}

export { app };
