import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Event } from '@event-driven-io/emmett';
import {
  realtimeDBProjection,
  type RealtimeDBReadModel,
  RealtimeDBDefaultProjectionName,
} from './realtimeDBProjection';

type ShoppingCartOpened = Event<
  'ShoppingCartOpened',
  {
    shoppingCartId: string;
    clientId: string;
    openedAt: string;
  }
>;

type ProductItemAddedToShoppingCart = Event<
  'ProductItemAddedToShoppingCart',
  {
    shoppingCartId: string;
    productItem: { productId: string; quantity: number };
  }
>;

type ShoppingCartEvent = ShoppingCartOpened | ProductItemAddedToShoppingCart;

type ShoppingCartDetails = {
  shoppingCartId: string;
  clientId: string;
  productItems: Array<{ productId: string; quantity: number }>;
  openedAt: string;
};

void describe('RealtimeDB Projection', () => {
  void it('should create projection definition with default name', () => {
    const projection = realtimeDBProjection<
      ShoppingCartDetails,
      ShoppingCartEvent
    >({
      canHandle: ['ShoppingCartOpened', 'ProductItemAddedToShoppingCart'],
      evolve: (document, event) => {
        if (!document) {
          if (event.type === 'ShoppingCartOpened') {
            return {
              shoppingCartId: event.data.shoppingCartId,
              clientId: event.data.clientId,
              productItems: [],
              openedAt: event.data.openedAt,
            };
          }
          return null;
        }

        if (event.type === 'ProductItemAddedToShoppingCart') {
          return {
            ...document,
            productItems: [...document.productItems, event.data.productItem],
          };
        }

        return document;
      },
    });

    assert.strictEqual(projection.name, RealtimeDBDefaultProjectionName);
    assert.strictEqual(projection.canHandle.length, 2);
  });

  void it('should create projection definition with custom name', () => {
    const projectionName = 'shopping-cart-details';

    const projection = realtimeDBProjection<
      ShoppingCartDetails,
      ShoppingCartEvent
    >({
      name: projectionName,
      canHandle: ['ShoppingCartOpened', 'ProductItemAddedToShoppingCart'],
      evolve: (document, event) => {
        if (!document) {
          if (event.type === 'ShoppingCartOpened') {
            return {
              shoppingCartId: event.data.shoppingCartId,
              clientId: event.data.clientId,
              productItems: [],
              openedAt: event.data.openedAt,
            };
          }
          return null;
        }

        if (event.type === 'ProductItemAddedToShoppingCart') {
          return {
            ...document,
            productItems: [...document.productItems, event.data.productItem],
          };
        }

        return document;
      },
    });

    assert.strictEqual(projection.name, projectionName);
  });

  void it('should create projection with initial state', () => {
    const projection = realtimeDBProjection<
      ShoppingCartDetails,
      ShoppingCartEvent
    >({
      canHandle: ['ShoppingCartOpened', 'ProductItemAddedToShoppingCart'],
      initialState: () => ({
        shoppingCartId: '',
        clientId: '',
        productItems: [],
        openedAt: '',
      }),
      evolve: (document, event) => {
        if (event.type === 'ShoppingCartOpened') {
          return {
            ...document,
            shoppingCartId: event.data.shoppingCartId,
            clientId: event.data.clientId,
            openedAt: event.data.openedAt,
          };
        }

        if (event.type === 'ProductItemAddedToShoppingCart') {
          return {
            ...document,
            productItems: [...document.productItems, event.data.productItem],
          };
        }

        return document;
      },
    });

    assert.strictEqual(projection.name, RealtimeDBDefaultProjectionName);
  });
});
