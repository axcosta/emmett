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

void describe('Basic Router - Integration Tests', () => {
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

  void it('Should open shopping cart', () => {
    return given()
      .when((request) => request.post(`/clients/${clientId}/shopping-carts`).send())
      .then([
        expectResponse(201),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ShoppingCartOpened',
            data: {
              shoppingCartId,
              clientId,
              openedAt: new Date(),
            },
          },
        ]),
      ]);
  });

  void it('Should add product items', () => {
    return given(
      existingStream(shoppingCartId, [
        {
          type: 'ShoppingCartOpened',
          data: { shoppingCartId, clientId, openedAt: new Date() },
        },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123', quantity: 2 }),
      )
      .then([
        expectResponse(204),
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

  void it('Should remove product items', () => {
    return given(
      existingStream(shoppingCartId, [
        {
          type: 'ShoppingCartOpened',
          data: { shoppingCartId, clientId, openedAt: new Date() },
        },
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
          .delete(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"2"')
          .query({ productId: '123', quantity: 1, unitPrice: 100 }),
      )
      .then([
        expectResponse(204),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ProductItemRemovedFromShoppingCart',
            data: {
              shoppingCartId,
              productItem: { productId: '123', quantity: 1, unitPrice: 100 },
            },
          },
        ]),
      ]);
  });

  void it('Should confirm shopping cart', () => {
    return given(
      existingStream(shoppingCartId, [
        {
          type: 'ShoppingCartOpened',
          data: { shoppingCartId, clientId, openedAt: new Date() },
        },
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
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
          .set('If-Match', 'W/"2"'),
      )
      .then([
        expectResponse(204),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ShoppingCartConfirmed',
            data: { shoppingCartId, confirmedAt: new Date() },
          },
        ]),
      ]);
  });

  void it('Should cancel shopping cart', () => {
    return given(
      existingStream(shoppingCartId, [
        {
          type: 'ShoppingCartOpened',
          data: { shoppingCartId, clientId, openedAt: new Date() },
        },
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
          .delete(`/clients/${clientId}/shopping-carts/${shoppingCartId}`)
          .set('If-Match', 'W/"2"'),
      )
      .then([
        expectResponse(204),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ShoppingCartCanceled',
            data: { shoppingCartId, canceledAt: new Date() },
          },
        ]),
      ]);
  });

  void it('Should reject adding items to confirmed cart', () => {
    return given(
      existingStream(shoppingCartId, [
        {
          type: 'ShoppingCartOpened',
          data: { shoppingCartId, clientId, openedAt: new Date() },
        },
        {
          type: 'ShoppingCartConfirmed',
          data: { shoppingCartId, confirmedAt: new Date() },
        },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"2"')
          .send({ productId: '123', quantity: 1 }),
      )
      .then(
        expectError(403, {
          detail: ShoppingCartErrors.CART_IS_ALREADY_CLOSED,
        }),
      );
  });
});
