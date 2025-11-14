import {
  getInMemoryEventStore,
  type InMemoryEventStore,
} from '@event-driven-io/emmett';
import { type Application } from 'express';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createOpenApiValidatorOptions, getApplication } from '../../../src';
import { HeaderNames, toWeakETag } from '../../../src/etag';
import {
  expectNextRevisionInResponseEtag,
  runTwice,
  statuses,
  type TestResponse,
} from '../fixtures/testing';
import { shoppingCartApi } from './api';

// OpenAPI spec for shopping cart API
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Shopping Cart API',
    version: '1.0.0',
  },
  paths: {
    '/clients/{clientId}/shopping-carts': {
      post: {
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '201': { description: 'Created' },
          '412': { description: 'Precondition Failed' },
        },
      },
    },
    '/clients/{clientId}/shopping-carts/{shoppingCartId}/product-items': {
      post: {
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'shoppingCartId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
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
                  productId: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
        responses: {
          '204': { description: 'No Content' },
          '400': { description: 'Bad Request' },
          '412': { description: 'Precondition Failed' },
        },
      },
      delete: {
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'shoppingCartId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'productId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'quantity',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'unitPrice',
            in: 'query',
            required: true,
            schema: { type: 'number', minimum: 0 },
          },
        ],
        responses: {
          '204': { description: 'No Content' },
          '400': { description: 'Bad Request' },
          '412': { description: 'Precondition Failed' },
        },
      },
    },
    '/clients/{clientId}/shopping-carts/{shoppingCartId}/confirm': {
      post: {
        summary: 'Confirm shopping cart',
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'shoppingCartId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': { description: 'No Content' },
          '412': { description: 'Precondition Failed' },
        },
      },
    },
  },
};

void describe('Shopping Cart E2E with OpenAPI Validator', () => {
  let app: Application;
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = getInMemoryEventStore();
    app = getApplication({
      apis: [shoppingCartApi(eventStore)],
      openApiValidator: createOpenApiValidatorOptions(openApiSpec, {
        validateRequests: true,
        validateResponses: false,
      }),
    });
  });

  void it('Should handle requests correctly with OpenAPI validation', async () => {
    const clientId = randomUUID();

    ///////////////////////////////////////////////////
    // 1. Open Shopping Cart
    ///////////////////////////////////////////////////
    const createResponse = (await runTwice(() =>
      request(app).post(`/clients/${clientId}/shopping-carts`).send(),
    ).expect(statuses(201, 412))) as TestResponse<{ id: string }>;

    let currentRevision = expectNextRevisionInResponseEtag(createResponse);
    const current = createResponse.body;

    if (!current.id) {
      throw new Error('Expected cart id to be present');
    }

    const shoppingCartId = current.id;

    ///////////////////////////////////////////////////
    // 2. Add Two Pair of Shoes
    ///////////////////////////////////////////////////
    const twoPairsOfShoes = {
      quantity: 2,
      productId: '123',
    };
    let response = await runTwice(() =>
      request(app)
        .post(
          `/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`,
        )
        .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
        .send(twoPairsOfShoes),
    ).expect(statuses(204, 412));

    currentRevision = expectNextRevisionInResponseEtag(response);

    ///////////////////////////////////////////////////
    // 3. Confirm Shopping Cart
    ///////////////////////////////////////////////////
    response = await runTwice(() =>
      request(app)
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
        .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
        .send(),
    ).expect(statuses(204, 412));

    expectNextRevisionInResponseEtag(response);
  });

  void it('Should reject invalid requests with OpenAPI validation', async () => {
    const clientId = randomUUID();

    // Create shopping cart first
    const createResponse = await request(app)
      .post(`/clients/${clientId}/shopping-carts`)
      .send();

    if (createResponse.status !== 201) {
      throw new Error(`Expected status 201, got ${createResponse.status}`);
    }

    const shoppingCartId = (createResponse.body as { id: string }).id;
    const currentRevision = expectNextRevisionInResponseEtag(
      createResponse as TestResponse<{ id: string }>,
    );

    // Try to add item with invalid data (missing required field)
    const invalidResponse = await request(app)
      .post(
        `/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`,
      )
      .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
      .send({ productId: '123' }); // Missing quantity

    if (invalidResponse.status !== 400) {
      throw new Error(
        `Expected status 400 for invalid request, got ${invalidResponse.status}`,
      );
    }
  });

  void it('Should reject invalid request with negative quantity', async () => {
    const clientId = randomUUID();

    // Create shopping cart first
    const createResponse = await request(app)
      .post(`/clients/${clientId}/shopping-carts`)
      .send();

    if (createResponse.status !== 201) {
      throw new Error(`Expected status 201, got ${createResponse.status}`);
    }

    const shoppingCartId = (createResponse.body as { id: string }).id;
    const currentRevision = expectNextRevisionInResponseEtag(
      createResponse as TestResponse<{ id: string }>,
    );

    // Try to add item with negative quantity
    const invalidResponse = await request(app)
      .post(
        `/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`,
      )
      .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
      .send({ productId: '123', quantity: -1 });

    if (invalidResponse.status !== 400) {
      throw new Error(
        `Expected status 400 for invalid quantity, got ${invalidResponse.status}`,
      );
    }
  });
});
