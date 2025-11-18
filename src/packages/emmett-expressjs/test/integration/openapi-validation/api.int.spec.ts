import { getInMemoryEventStore } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ApiSpecification,
  createOpenApiValidatorOptions,
  existingStream,
  expectError,
  expectNewEvents,
  expectResponse,
  getApplication,
} from '../../../src';
import { shoppingCartApi } from '../../fixtures/shopping-cart/api/routerWithOpenApi';
import { ShoppingCartErrors } from '../../fixtures/shopping-cart/businessLogic';
import type { ShoppingCartEvent } from '../../fixtures/shopping-cart/shoppingCart';

const openApiSpecPath = fileURLToPath(
  new URL('../../fixtures/shopping-cart/api/openapi.yml', import.meta.url),
);

void describe('OpenAPI Validation - Integration Tests', () => {
  const given = ApiSpecification.for<ShoppingCartEvent>(
    () => getInMemoryEventStore(),
    (eventStore) =>
      getApplication({
        apis: [shoppingCartApi(eventStore)],
        openApiValidator: createOpenApiValidatorOptions(openApiSpecPath, {
          validateRequests: true,
          validateResponses: false,
        }),
      }),
  );

  let clientId: string;
  let shoppingCartId: string;

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = clientId;
  });

  void it('Should validate and accept valid request', () => {
    return given()
      .when((request) => request.post(`/clients/${clientId}/shopping-carts`).send())
      .then([
        expectResponse(201),
        expectNewEvents(shoppingCartId, [
          {
            type: 'ShoppingCartOpened',
            data: { shoppingCartId, clientId, openedAt: new Date() },
          },
        ]),
      ]);
  });

  void it('Should reject request with missing required field (quantity)', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, openedAt: new Date() } },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123' }), // Missing quantity
      )
      .then(expectResponse(400));
  });

  void it('Should reject request with negative quantity', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, openedAt: new Date() } },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"1"')
          .send({ productId: '123', quantity: -1 }),
      )
      .then(expectResponse(400));
  });

  void it('Should accept valid add product request', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, openedAt: new Date() } },
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

  void it('Should validate business rules (closed cart)', () => {
    return given(
      existingStream(shoppingCartId, [
        { type: 'ShoppingCartOpened', data: { shoppingCartId, clientId, openedAt: new Date() } },
        { type: 'ShoppingCartConfirmed', data: { shoppingCartId, confirmedAt: new Date() } },
      ]),
    )
      .when((request) =>
        request
          .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`)
          .set('If-Match', 'W/"2"')
          .send({ productId: '123', quantity: 1 }),
      )
      .then(expectError(403, { detail: ShoppingCartErrors.CART_IS_ALREADY_CLOSED }));
  });
});
