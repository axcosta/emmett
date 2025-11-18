import {
  getInMemoryEventStore,
  getInMemoryMessageBus,
} from '@event-driven-io/emmett';
import {
  ApiSpecification,
  createOpenApiValidatorOptions,
  existingStream,
  expectError,
  expectNewEvents,
  expectResponse,
  getApplication,
} from '@event-driven-io/emmett-expressjs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { __setDependencies } from '../handlers/shoppingCarts';
import { type PricedProductItem, type ShoppingCartEvent } from './shoppingCart';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getUnitPrice = (_productId: string) => Promise.resolve(100);

void describe('ShoppingCart Integration Tests (OpenAPI)', () => {
  let clientId: string;
  let shoppingCartId: string;
  let eventStore: ReturnType<typeof getInMemoryEventStore>;
  const messageBus = getInMemoryMessageBus();
  const oldTime = new Date();
  const now = new Date();

  beforeEach(async () => {
    clientId = randomUUID();
    shoppingCartId = `shopping_cart:${clientId}:current`;

    // Create a new event store for each test
    eventStore = getInMemoryEventStore();
    __setDependencies(eventStore, messageBus, getUnitPrice, () => now);
  });

  void describe('When empty', () => {
    void it('should add product item', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send(productItem),
        )
        .then([
          expectNewEvents(shoppingCartId, [
            {
              type: 'ProductItemAddedToShoppingCart',
              data: {
                shoppingCartId,
                clientId,
                productItem,
                addedAt: now,
              },
              metadata: { clientId },
            },
          ]),
        ]);
    });

    void it('should reject invalid request (missing quantity)', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send({ productId: 'test' }), // missing quantity
        )
        .then([
          expectError(400, {
            status: 400,
            title: 'Bad Request',
          }),
        ]);
    });

    void it('should reject invalid request (negative quantity)', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send({ productId: 'test', quantity: -1 }),
        )
        .then([
          expectError(400, {
            status: 400,
            title: 'Bad Request',
          }),
        ]);
    });
  });

  void describe('When opened with product item', () => {
    void it('should confirm', () => {
      return given(
        existingStream(shoppingCartId, [
          {
            type: 'ProductItemAddedToShoppingCart',
            data: {
              shoppingCartId,
              clientId,
              productItem,
              addedAt: oldTime,
            },
            metadata: { clientId },
          },
        ]),
      )
        .when((request) =>
          request.post(`/clients/${clientId}/shopping-carts/current/confirm`),
        )
        .then([
          expectResponse(204),
          expectNewEvents(shoppingCartId, [
            {
              type: 'ShoppingCartConfirmed',
              data: {
                shoppingCartId,
                confirmedAt: now,
              },
              metadata: { clientId },
            },
          ]),
        ]);
    });

    void it('should remove product item', () => {
      return given(
        existingStream(shoppingCartId, [
          {
            type: 'ProductItemAddedToShoppingCart',
            data: {
              shoppingCartId,
              clientId,
              productItem,
              addedAt: oldTime,
            },
            metadata: { clientId },
          },
        ]),
      )
        .when((request) =>
          request
            .delete(`/clients/${clientId}/shopping-carts/current/product-items`)
            .query({
              productId: productItem.productId,
              quantity: productItem.quantity,
              unitPrice: productItem.unitPrice,
            }),
        )
        .then([
          expectResponse(204),
          expectNewEvents(shoppingCartId, [
            {
              type: 'ProductItemRemovedFromShoppingCart',
              data: {
                shoppingCartId,
                productItem,
                removedAt: now,
              },
              metadata: { clientId },
            },
          ]),
        ]);
    });

    void it('should cancel', () => {
      return given(
        existingStream(shoppingCartId, [
          {
            type: 'ProductItemAddedToShoppingCart',
            data: {
              shoppingCartId,
              clientId,
              productItem,
              addedAt: oldTime,
            },
            metadata: { clientId },
          },
        ]),
      )
        .when((request) =>
          request.delete(`/clients/${clientId}/shopping-carts/current`),
        )
        .then([
          expectResponse(204),
          expectNewEvents(shoppingCartId, [
            {
              type: 'ShoppingCartCancelled',
              data: {
                shoppingCartId,
                cancelledAt: now,
              },
              metadata: { clientId },
            },
          ]),
        ]);
    });
  });

  void describe('When confirmed', () => {
    void it('should not add products', () => {
      return given(
        existingStream(shoppingCartId, [
          {
            type: 'ProductItemAddedToShoppingCart',
            data: {
              shoppingCartId,
              clientId,
              productItem,
              addedAt: oldTime,
            },
            metadata: { clientId },
          },
          {
            type: 'ShoppingCartConfirmed',
            data: { shoppingCartId, confirmedAt: oldTime },
            metadata: { clientId },
          },
        ]),
      )
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send(productItem),
        )
        .then(
          expectError(403, {
            detail: 'Shopping Cart already closed',
            status: 403,
            title: 'Forbidden',
            type: 'about:blank',
          }),
        );
    });
  });

  const given = ApiSpecification.for<ShoppingCartEvent>(
    () => eventStore,
    () =>
      getApplication({
        apis: [],
        openApiValidator: createOpenApiValidatorOptions(
          path.join(__dirname, '../../openapi.yml'),
          {
            validateRequests: true,
            validateResponses: false,
            operationHandlers: path.join(__dirname, '../handlers'),
          },
        ),
      }),
  );

  const getRandomProduct = (): PricedProductItem => {
    return {
      productId: randomUUID(),
      unitPrice: 100,
      quantity: Math.floor(Math.random() * 10) + 1,
    };
  };

  const productItem = getRandomProduct();
});
