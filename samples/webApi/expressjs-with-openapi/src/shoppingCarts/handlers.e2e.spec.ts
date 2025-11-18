import {
  getInMemoryEventStore,
  getInMemoryMessageBus,
} from '@event-driven-io/emmett';
import {
  ApiE2ESpecification,
  createOpenApiValidatorOptions,
  expectResponse,
  getApplication,
  type TestRequest,
} from '@event-driven-io/emmett-expressjs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { __setDependencies } from '../handlers/shoppingCarts';
import type { ProductItem } from './shoppingCart';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

void describe('ShoppingCart E2E (OpenAPI)', () => {
  let clientId: string;
  let shoppingCartId: string;
  let given: ApiE2ESpecification;

  before(async () => {
    const eventStore = getInMemoryEventStore();
    const messageBus = getInMemoryMessageBus();
    const getUnitPrice = (_productId: string) => Promise.resolve(100);
    const getCurrentTime = () => new Date();

    // Inject dependencies into operation handlers
    __setDependencies(eventStore, messageBus, getUnitPrice, getCurrentTime);

    given = ApiE2ESpecification.for(
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
  });

  beforeEach(() => {
    clientId = randomUUID();
    shoppingCartId = `shopping_cart:${clientId}:current`;
  });

  void describe('When empty', () => {
    void it('should add product item', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send(productItem),
        )
        .then([expectResponse(204)]);
    });

    void it('should reject invalid request (missing productId)', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send({ quantity: 5 }),
        )
        .then([expectResponse(400)]);
    });

    void it('should reject invalid request (negative quantity)', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send({ productId: 'test', quantity: -1 }),
        )
        .then([expectResponse(400)]);
    });

    void it('should reject invalid request (zero quantity)', () => {
      return given()
        .when((request) =>
          request
            .post(`/clients/${clientId}/shopping-carts/current/product-items`)
            .send({ productId: 'test', quantity: 0 }),
        )
        .then([expectResponse(400)]);
    });
  });

  void describe('When open', () => {
    const openedShoppingCart: TestRequest = (request) =>
      request
        .post(`/clients/${clientId}/shopping-carts/current/product-items`)
        .send(productItem);

    void it('should confirm shopping cart', () => {
      return given(openedShoppingCart)
        .when((request) =>
          request.post(`/clients/${clientId}/shopping-carts/current/confirm`),
        )
        .then([expectResponse(204)]);
    });

    void it('should cancel shopping cart', () => {
      return given(openedShoppingCart)
        .when((request) =>
          request.delete(`/clients/${clientId}/shopping-carts/current`),
        )
        .then([expectResponse(204)]);
    });

    void it('should remove product item', () => {
      return given(openedShoppingCart)
        .when((request) =>
          request
            .delete(`/clients/${clientId}/shopping-carts/current/product-items`)
            .query({
              productId: productItem.productId,
              quantity: productItem.quantity,
              unitPrice: 100,
            }),
        )
        .then([expectResponse(204)]);
    });
  });

  void describe('OpenAPI validation errors', () => {
    void it('should reject remove with missing query parameters', () => {
      return given()
        .when((request) =>
          request
            .delete(`/clients/${clientId}/shopping-carts/current/product-items`)
            .query({ productId: 'test' }), // missing quantity and unitPrice
        )
        .then([expectResponse(400)]);
    });

    void it('should reject remove with negative quantity', () => {
      return given()
        .when((request) =>
          request
            .delete(`/clients/${clientId}/shopping-carts/current/product-items`)
            .query({
              productId: 'test',
              quantity: -1,
              unitPrice: 100,
            }),
        )
        .then([expectResponse(400)]);
    });
  });

  const getRandomProduct = (): ProductItem => {
    return {
      productId: randomUUID(),
      quantity: Math.floor(Math.random() * 10) + 1,
    };
  };

  const productItem = getRandomProduct();
});
