/**
 * Example: Using Operation Handlers with Emmett Express.js
 *
 * This example demonstrates how to use express-openapi-validator's
 * operationHandlers feature for automatic route wiring based on OpenAPI spec.
 */

import {
  createOpenApiValidatorOptions,
  getApplication,
  startAPI,
} from '@event-driven-io/emmett-expressjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenAPI specification with operation handlers
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Shopping Cart API with Operation Handlers',
    version: '1.0.0',
    description:
      'Example API using automatic route wiring via operationHandlers',
  },
  paths: {
    '/api/ping': {
      get: {
        summary: 'Health check endpoint',
        operationId: 'ping',
        'x-eov-operation-handler': 'handlers/ping',
        responses: {
          '200': {
            description: 'Pong response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/shopping-carts': {
      post: {
        summary: 'Create a new shopping cart',
        operationId: 'createShoppingCart',
        'x-eov-operation-handler': 'handlers/shoppingCarts',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: {
                  clientId: {
                    type: 'string',
                    format: 'uuid',
                  },
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
          '400': {
            description: 'Bad Request',
          },
        },
      },
    },
    '/api/shopping-carts/{cartId}/items': {
      post: {
        summary: 'Add item to shopping cart',
        operationId: 'addItemToCart',
        'x-eov-operation-handler': 'handlers/shoppingCarts',
        parameters: [
          {
            name: 'cartId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: {
                    type: 'string',
                  },
                  quantity: {
                    type: 'integer',
                    minimum: 1,
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Item added successfully',
          },
          '400': {
            description: 'Bad Request',
          },
          '404': {
            description: 'Cart not found',
          },
        },
      },
    },
  },
};

// Create application with operationHandlers
// Note: When using operationHandlers, you don't need to manually define routes!
// The validator will automatically wire the handlers based on the OpenAPI spec

const app = getApplication({
  // With operationHandlers, the apis array can be empty or contain additional manual routes
  apis: [],

  // Configure OpenAPI validator with operation handlers
  openApiValidator: createOpenApiValidatorOptions(openApiSpec, {
    validateRequests: true,
    validateResponses: process.env.NODE_ENV !== 'production',
    validateFormats: true,

    // This is the key configuration for automatic route wiring
    // It points to the directory containing your operation handler modules
    operationHandlers: path.join(__dirname, 'operationHandlersExample'),
  }),
});

// Start the server
if (process.env.NODE_ENV !== 'test') {
  const server = startAPI(app, { port: 3001 });

  console.log(
    'Shopping Cart API with Operation Handlers running on http://localhost:3001',
  );
  console.log('');
  console.log('Routes are automatically wired from OpenAPI spec!');
  console.log('');
  console.log('Try these requests:');
  console.log('');
  console.log('✓ Health check:');
  console.log('  curl http://localhost:3001/api/ping');
  console.log('');
  console.log('✓ Create shopping cart:');
  console.log('  curl -X POST http://localhost:3001/api/shopping-carts \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log(
    '    -d \'{"clientId": "550e8400-e29b-41d4-a716-446655440000"}\'',
  );
  console.log('');
  console.log('✓ Add item to cart:');
  console.log(
    '  curl -X POST http://localhost:3001/api/shopping-carts/550e8400-e29b-41d4-a716-446655440000/items \\',
  );
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"productId": "product-123", "quantity": 2}\'');

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
}

export { app };
