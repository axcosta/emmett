import { getInMemoryEventStore } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import {
  ApiSpecification,
  existingStream,
  expectError,
  expectNewEvents,
  expectResponse,
  getApplication,
} from '../../../src';
import { shoppingCartApi } from '../../fixtures/shopping-cart/api/router';
import { ShoppingCartErrors } from '../../fixtures/shopping-cart/businessLogic';
import type { ShoppingCartEvent } from '../../fixtures/shopping-cart/shoppingCart';

void describe('Optimistic Concurrency - Integration Tests', () => {
  const given = ApiSpecification.for<ShoppingCartEvent>(
    () => getInMemoryEventStore(),
    (eventStore) => getApplication({ apis: [shoppingCartApi(eventStore)] }),
  );

  let clientId: string;
  let shoppingCartId: string;

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = clientId;
  });

  void it('Should use ETags for version control', () => {
    return given()
      .when((request) => request.post(`/clients/${clientId}/shopping-carts`).send())
      .then([
        expectResponse(201, {
          headers: { etag: /W\/"1"/ },
        }),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ShoppingCartOpened',
            data: { shoppingCartId, clientId },
          },
        ]),
      ]);
  });

  void it('Should reject request with wrong ETag version', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, now: new Date() } },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"999"') // Wrong version
          .send({ productId: '123', quantity: 2 }),
      )
      .then(expectResponse(412)); // Precondition Failed
  });

  void it('Should accept request with correct ETag version', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, now: new Date() } },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"') // Correct version
          .send({ productId: '123', quantity: 2 }),
      )
      .then([
        expectResponse(204, {
          headers: { etag: /W\/"2"/ },
        }),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ProductItemAddedToShoppingCart',
            data: {
              shoppingCartId,
              productItem: { productId: '123', quantity: 2, unitPrice: 100 },
            },
          },
        ]),
      ]);
  });

  void it('Should handle multiple version increments', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, now: new Date() } },
        {
          type: 'ProductItemAddedToShoppingCart',
          data: {
            shoppingCartId,
            productItem: { productId: '123', quantity: 2, unitPrice: 100 },
          },
        },
        {
          type: 'ProductItemAddedToShoppingCart',
          data: {
            shoppingCartId,
            productItem: { productId: '456', quantity: 1, unitPrice: 100 },
          },
        },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
          .set('If-Match', 'W/"3"'),
      )
      .then([
        expectResponse(204, {
          headers: { etag: /W\/"4"/ },
        }),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ShoppingCartConfirmed',
            data: { shoppingCartId },
          },
        ]),
      ]);
  });

  void it('Should prevent concurrent modifications', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, now: new Date() } },
        {
          type: 'ProductItemAddedToShoppingCart',
          data: {
            shoppingCartId,
            productItem: { productId: '123', quantity: 2, unitPrice: 100 },
          },
        },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"') // Old version (current is 2)
          .send({ productId: '456', quantity: 1 }),
      )
      .then(expectResponse(412));
  });

  void it('Should validate business rules with correct version', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, now: new Date() } },
        { type: 'ShoppingCartConfirmed', data: { shoppingCartId, confirmedAt: new Date() } },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"2"') // Correct version
          .send({ productId: '123', quantity: 1 }),
      )
      .then(expectError(403, { detail: ShoppingCartErrors.CART_IS_ALREADY_CLOSED }));
  });
});
