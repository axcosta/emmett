import { getInMemoryEventStore, type EventStore } from '@event-driven-io/emmett';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ApiE2ESpecification,
  createOpenApiValidatorOptions,
  expectResponse,
  getApplication,
  type TestRequest,
} from '../../../src';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { setEventStore } = require('../../fixtures/shopping-cart/api/operationHandlers') as {
  setEventStore: (store: EventStore) => void;
};

void describe('Operation Handlers - E2E Tests', () => {
  let given: ApiE2ESpecification;
  let clientId: string;
  let shoppingCartId: string;

  before(() => {
    const eventStore = getInMemoryEventStore();
    setEventStore(eventStore);

    given = ApiE2ESpecification.for(
      () => eventStore,
      () =>
        getApplication({
          apis: [],
          openApiValidator: createOpenApiValidatorOptions(
            path.join(__dirname, '../../fixtures/shopping-cart/api/openapi.yml'),
            {
              validateRequests: true,
              validateResponses: false,
              operationHandlers: path.join(__dirname, '../../fixtures/shopping-cart/api'),
            },
          ),
        }),
    );
  });

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = clientId;
  });

  void it('Should handle complete workflow via operation handlers', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    const addItem: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
        .set('If-Match', 'W/"1"')
        .send({ productId: '123', quantity: 2 });

    return given(openCart, addItem)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
          .set('If-Match', 'W/"2"'),
      )
      .then([expectResponse(204)]);
  });

  void it('Should reject invalid requests', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    return given(openCart)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123' }), // Missing quantity
      )
      .then([expectResponse(400)]);
  });

  void it('Should enforce business rules', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    const addItem: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
        .set('If-Match', 'W/"1"')
        .send({ productId: '123', quantity: 2 });

    const confirmCart: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
        .set('If-Match', 'W/"2"');

    return given(openCart, addItem, confirmCart)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"3"')
          .send({ productId: '456', quantity: 1 }),
      )
      .then([expectResponse(403)]);
  });
});
