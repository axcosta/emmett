import { getInMemoryEventStore } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, describe, it } from 'node:test';
import {
  ApiE2ESpecification,
  expectResponse,
  type TestRequest,
} from '../../../src';
import { getApplication } from '../../../src';
import { shoppingCartApi } from '../../fixtures/shopping-cart/api/router';

void describe('Basic Router - E2E Tests', () => {
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

  void it('Should open shopping cart', () => {
    return given()
      .when((request) => request.post(`/clients/${clientId}/shopping-carts`).send())
      .then([expectResponse(201)]);
  });

  void describe('When cart is open', () => {
    const openCart: TestRequest = (request) =>
      request.post(`/clients/${clientId}/shopping-carts`).send();

    void it('Should add product items', () => {
      return given(openCart)
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
            .set('If-Match', 'W/"1"')
            .send({ productId: '123', quantity: 2 }),
        )
        .then([expectResponse(204)]);
    });

    void it('Should remove product items', () => {
      const addItem: TestRequest = (request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123', quantity: 2 });

      return given(openCart, addItem)
        .when((request) =>
          request
            .delete(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
            .set('If-Match', 'W/"2"')
            .query({ productId: '123', quantity: 1, unitPrice: 100 }),
        )
        .then([expectResponse(204)]);
    });

    void it('Should confirm shopping cart', () => {
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

    void it('Should cancel shopping cart', () => {
      const addItem: TestRequest = (request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123', quantity: 2 });

      return given(openCart, addItem)
        .when((request) =>
          request
            .delete(`/clients/${clientId}/shopping-carts/${shoppingCartId}`)
            .set('If-Match', 'W/"2"'),
        )
        .then([expectResponse(204)]);
    });
  });

  void describe('When cart is confirmed', () => {
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

    void it('Should reject adding items', () => {
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
});
