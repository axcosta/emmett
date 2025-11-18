import { getInMemoryEventStore, type EventStore } from '@event-driven-io/emmett';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { createRequire } from 'node:module';
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
import { ShoppingCartErrors } from '../../fixtures/shopping-cart/businessLogic';
import type { ShoppingCartEvent } from '../../fixtures/shopping-cart/shoppingCart';
const require = createRequire(import.meta.url);
const { setEventStore } = require('../../fixtures/shopping-cart/api/operationHandlers') as {
  setEventStore: (store: EventStore) => void;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
void describe('Operation Handlers - Integration Tests', () => {
  const given = ApiSpecification.for<ShoppingCartEvent>(
    () => getInMemoryEventStore(),
    (eventStore) => {
      // Inject event store into operation handlers BEFORE creating the app
      setEventStore(eventStore);

      return getApplication({
        apis: [],
        openApiValidator: createOpenApiValidatorOptions(
          path.join(__dirname, '../../fixtures/shopping-cart/api/openapi.yml'),
          {
            validateRequests: true,
            validateResponses: false,
            operationHandlers: path.join(__dirname, '../../fixtures/shopping-cart/api'),
          },
        ),
      });
    },
  );

  let clientId: string;
  let shoppingCartId: string;

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = clientId;
  });

  void it('Should open shopping cart via operation handler', () => {
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

  void it('Should add product items via operation handler', () => {
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

  void it('Should validate requests via OpenAPI', () => {
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

  void it('Should enforce business rules', () => {
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
