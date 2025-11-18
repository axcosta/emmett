import { getInMemoryEventStore } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ApiE2ESpecification,
  createOpenApiValidatorOptions,
  expectResponse,
  getApplication,
  type TestRequest,
} from '../../../src';
import { shoppingCartApi } from '../../fixtures/shopping-cart/api/routerWithOpenApi';

const openApiSpecPath = fileURLToPath(
  new URL('../../fixtures/shopping-cart/api/openapi.yml', import.meta.url),
);

void describe('OpenAPI Validation - E2E Tests', () => {
  let given: ApiE2ESpecification;
  let clientId: string;
  let shoppingCartId: string;

  before(() => {
    const eventStore = getInMemoryEventStore();

    given = ApiE2ESpecification.for(
      () => eventStore,
      () =>
        getApplication({
          apis: [shoppingCartApi(eventStore)],
          openApiValidator: createOpenApiValidatorOptions(openApiSpecPath, {
            validateRequests: true,
            validateResponses: false,
          }),
        }),
    );
  });

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = clientId;
  });

  void it('Should accept valid request', () => {
    return given()
      .when((request) => request.post(`/clients/${clientId}/shopping-carts`).send())
      .then([expectResponse(201)]);
  });

  void it('Should reject request with missing required field', () => {
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

  void it('Should reject request with negative quantity', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    return given(openCart)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123', quantity: -1 }),
      )
      .then([expectResponse(400)]);
  });

  void it('Should accept valid add product request', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    return given(openCart)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123', quantity: 2 }),
      )
      .then([expectResponse(204)]);
  });

  void it('Should enforce business rules (closed cart)', () => {
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
