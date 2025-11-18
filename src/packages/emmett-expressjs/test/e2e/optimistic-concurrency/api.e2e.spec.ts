import { getInMemoryEventStore } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, describe, it } from 'node:test';
import {
  ApiE2ESpecification,
  expectResponse,
  getApplication,
  type TestRequest,
} from '../../../src';
import { shoppingCartApi } from '../../fixtures/shopping-cart/api/router';

void describe('Optimistic Concurrency - E2E Tests', () => {
  let given: ApiE2ESpecification;
  let clientId: string;
  let shoppingCartId: string;

  before(() => {
    const eventStore = getInMemoryEventStore();

    given = ApiE2ESpecification.for(
      () => eventStore,
      () => getApplication({ apis: [shoppingCartApi(eventStore)] }),
    );
  });

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = clientId;
  });

  void it('Should return ETag on resource creation', () => {
    return given()
      .when((request) => request.post(`/clients/${clientId}/shopping-carts`).send())
      .then([
        expectResponse(201, {
          headers: { etag: /W\/"1"/ },
        }),
      ]);
  });

  void it('Should reject request with wrong ETag', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    return given(openCart)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"999"')
          .send({ productId: '123', quantity: 2 }),
      )
      .then([expectResponse(412)]);
  });

  void it('Should handle complete workflow with version tracking', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    const addFirstItem: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
        .set('If-Match', 'W/"1"')
        .send({ productId: '123', quantity: 2 });

    const addSecondItem: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
        .set('If-Match', 'W/"2"')
        .send({ productId: '456', quantity: 1 });

    return given(openCart, addFirstItem, addSecondItem)
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
          .set('If-Match', 'W/"3"'),
      )
      .then([
        expectResponse(204, {
          headers: { etag: /W\/"4"/ },
        }),
      ]);
  });

  void it('Should prevent concurrent modifications', () => {
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
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"') // Using old version
          .send({ productId: '456', quantity: 1 }),
      )
      .then([expectResponse(412)]);
  });

  void it('Should enforce business rules even with correct version', () => {
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
          .set('If-Match', 'W/"3"') // Correct version but cart is closed
          .send({ productId: '456', quantity: 1 }),
      )
      .then([expectResponse(403)]);
  });
});
