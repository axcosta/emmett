/**
 * Example: Using OpenAPI Validator with Emmett Express.js
 *
 * This example demonstrates how to integrate express-openapi-validator
 * with an Emmett Express.js application for automatic API validation.
 */

import {
  createOpenApiValidatorOptions,
  getApplication,
  startAPI,
  type WebApiSetup,
} from '@event-driven-io/emmett-expressjs';
import type { Router } from 'express';

// Example OpenAPI 3.0 specification
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Shopping Cart API',
    version: '1.0.0',
    description: 'Example API with OpenAPI validation',
  },
  paths: {
    '/shopping-carts/{cartId}/items': {
      post: {
        summary: 'Add item to shopping cart',
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
                    minLength: 1,
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
          '201': {
            description: 'Item added successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    cartId: { type: 'string' },
                    itemCount: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad Request - Validation Error',
          },
          '404': {
            description: 'Shopping cart not found',
          },
        },
      },
    },
    '/shopping-carts/{cartId}': {
      get: {
        summary: 'Get shopping cart',
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
        responses: {
          '200': {
            description: 'Shopping cart details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          productId: { type: 'string' },
                          quantity: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Shopping cart not found',
          },
        },
      },
    },
  },
};

// Mock shopping cart data (in a real app, this would use EventStore)
const shoppingCarts = new Map<
  string,
  { id: string; items: Array<{ productId: string; quantity: number }> }
>();

// Define API routes
const shoppingCartApi: WebApiSetup = (router: Router) => {
  router.post('/shopping-carts/:cartId/items', (req, res) => {
    const { cartId } = req.params;
    const { productId, quantity } = req.body as {
      productId: string;
      quantity: number;
    };

    let cart = shoppingCarts.get(cartId);

    if (!cart) {
      cart = { id: cartId, items: [] };
      shoppingCarts.set(cartId, cart);
    }

    cart.items.push({ productId, quantity });

    res.status(201).json({
      cartId: cart.id,
      itemCount: cart.items.length,
    });
  });

  router.get('/shopping-carts/:cartId', (req, res) => {
    const { cartId } = req.params;
    const cart = shoppingCarts.get(cartId);

    if (!cart) {
      return res.status(404).json({ message: 'Shopping cart not found' });
    }

    res.status(200).json(cart);
  });
};

// Create and configure the application
const app = getApplication({
  apis: [shoppingCartApi],

  // Configure OpenAPI validator
  openApiValidator: createOpenApiValidatorOptions(openApiSpec, {
    // Validate all incoming requests
    validateRequests: true,

    // Validate responses in development (disable in production for performance)
    validateResponses: process.env.NODE_ENV !== 'production',

    // Use full format validation
    validateFormats: 'full',

    // Security validation (if you have security schemes in your spec)
    validateSecurity: false,
  }),
});

// Start the server
if (process.env.NODE_ENV !== 'test') {
  const server = startAPI(app, { port: 3000 });

  console.log('Shopping Cart API running on http://localhost:3000');
  console.log('OpenAPI validation is enabled');
  console.log('');
  console.log('Try these requests:');
  console.log('');
  console.log('✓ Valid request:');
  console.log(
    '  curl -X POST http://localhost:3000/shopping-carts/550e8400-e29b-41d4-a716-446655440000/items \\',
  );
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"productId": "product-123", "quantity": 2}\'');
  console.log('');
  console.log('✗ Invalid request (missing quantity):');
  console.log(
    '  curl -X POST http://localhost:3000/shopping-carts/550e8400-e29b-41d4-a716-446655440000/items \\',
  );
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"productId": "product-123"}\'');
  console.log('');
  console.log('✗ Invalid request (negative quantity):');
  console.log(
    '  curl -X POST http://localhost:3000/shopping-carts/550e8400-e29b-41d4-a716-446655440000/items \\',
  );
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"productId": "product-123", "quantity": -1}\'');
  console.log('');
  console.log('✗ Invalid request (invalid UUID format):');
  console.log(
    '  curl -X POST http://localhost:3000/shopping-carts/invalid-uuid/items \\',
  );
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"productId": "product-123", "quantity": 2}\'');

  process.on('SIGINT', () => {
    console.log('\\nShutting down...');
    server.close(() => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
}

export { app };
