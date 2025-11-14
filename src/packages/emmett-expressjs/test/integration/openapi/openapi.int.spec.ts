import { type Application } from 'express';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createOpenApiValidatorOptions, getApplication } from '../../../src';

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Test API',
    version: '1.0.0',
  },
  paths: {
    '/test': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'age'],
                properties: {
                  name: {
                    type: 'string',
                    minLength: 1,
                  },
                  age: {
                    type: 'number',
                    minimum: 0,
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
          },
          '400': {
            description: 'Bad Request',
          },
        },
      },
    },
  },
};

void describe('OpenAPI Validator Integration', () => {
  let app: Application;

  beforeEach(() => {
    app = getApplication({
      apis: [
        (router) => {
          router.post('/test', (req, res) => {
            res.status(200).json({ success: true });
          });
        },
      ],
      openApiValidator: createOpenApiValidatorOptions(openApiSpec, {
        validateRequests: true,
        validateResponses: false,
      }),
    });
  });

  void it('should accept valid request', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'John Doe', age: 30 });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
  });

  void it('should reject request with missing required field', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'John Doe' });

    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
  });

  void it('should reject request with invalid field type', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'John Doe', age: 'not a number' });

    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
  });

  void it('should reject request with negative age', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'John Doe', age: -1 });

    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
  });

  void it('should reject request with empty name', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: '', age: 30 });

    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
  });
});

void describe('OpenAPI Validator - Not Installed', () => {
  void it('should throw error when configured but package is not installed (or no error if installed)', async () => {
    const available = await import('express-openapi-validator')
      .then(() => true)
      .catch(() => false);

    if (available) {
      // Should NOT throw if the package is installed
      getApplication({
        apis: [],
        openApiValidator: createOpenApiValidatorOptions('./spec.yaml'),
      });
      return;
    }

    try {
      getApplication({
        apis: [],
        openApiValidator: createOpenApiValidatorOptions('./spec.yaml'),
      });
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.includes('express-openapi-validator')
      ) {
        throw new Error(
          `Expected error about missing package, got: ${error.message}`,
        );
      }
    }
  });
});

void describe('OpenAPI Validator - Optional', () => {
  void it('should work without OpenAPI validator configuration', async () => {
    const app = getApplication({
      apis: [
        (router) => {
          router.get('/ping', (_req, res) => {
            res.status(200).json({ message: 'pong' });
          });
        },
      ],
    });

    const response = await request(app).get('/ping');

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
  });
});

void describe('OpenAPI Validator - Operation Handlers', () => {
  void it('should automatically wire routes using operation handlers', async () => {
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API with Operation Handlers',
        version: '1.0.0',
      },
      paths: {
        '/ping': {
          get: {
            operationId: 'ping',
            'x-eov-operation-handler': 'operationHandlersExample/handlers/ping',
            responses: {
              '200': {
                description: 'Success',
              },
            },
          },
        },
        '/shopping-carts': {
          post: {
            operationId: 'createShoppingCart',
            'x-eov-operation-handler':
              'operationHandlersExample/handlers/shoppingCarts',
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
                description: 'Created',
              },
            },
          },
        },
      },
    };

    const app = getApplication({
      apis: [], // No manual routes needed with operationHandlers!
      openApiValidator: createOpenApiValidatorOptions(spec, {
        validateRequests: true,
        operationHandlers: __dirname,
      }),
    });

    // Test ping endpoint (auto-wired)
    const pingResponse = await request(app).get('/ping');
    if (pingResponse.status !== 200) {
      throw new Error(`Expected ping status 200, got ${pingResponse.status}`);
    }
    const responseMessage = pingResponse.body.message as string;
    if (responseMessage !== 'pong') {
      throw new Error(`Expected message 'pong', got ${responseMessage}`);
    }

    // Test create shopping cart endpoint (auto-wired)
    const cartResponse = await request(app)
      .post('/shopping-carts')
      .send({ clientId: 'test-client-123' });

    if (cartResponse.status !== 201) {
      throw new Error(`Expected cart status 201, got ${cartResponse.status}`);
    }
    const responseClientId = cartResponse.body.clientId as string;
    if (responseClientId !== 'test-client-123') {
      throw new Error(
        `Expected clientId 'test-client-123', got ${responseClientId}`,
      );
    }
  });

  void it('should validate requests with operation handlers', async () => {
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        '/shopping-carts': {
          post: {
            operationId: 'createShoppingCart',
            'x-eov-operation-handler':
              'operationHandlersExample/handlers/shoppingCarts',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['clientId'],
                    properties: {
                      clientId: { type: 'string', minLength: 1 },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Created' },
              '400': { description: 'Bad Request' },
            },
          },
        },
      },
    };

    const app = getApplication({
      apis: [],
      openApiValidator: createOpenApiValidatorOptions(spec, {
        validateRequests: true,
        operationHandlers: __dirname,
      }),
    });

    // Should reject invalid request (missing clientId)
    const invalidResponse = await request(app).post('/shopping-carts').send({});

    if (invalidResponse.status !== 400) {
      throw new Error(
        `Expected status 400 for invalid request, got ${invalidResponse.status}`,
      );
    }
  });
});
