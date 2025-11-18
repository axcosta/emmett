import {
  DeciderCommandHandler,
  getInMemoryEventStore,
  STREAM_DOES_NOT_EXIST,
  assertNotEmptyString,
  assertPositiveNumber,
  assertUnsignedBigInt,
  type EventStore,
} from '@event-driven-io/emmett';
import type { Request } from 'express';
import { Created, NoContent, on } from '../../../../src';
import { getETagValueFromIfMatch, toWeakETag } from '../../../../src/etag';
import { decider } from '../businessLogic';
import type { PricedProductItem, ProductItem } from '../shoppingCart';

// Add Product Item Request Type
type AddProductItemRequest = Request<
  Partial<{ shoppingCartId: string }>,
  unknown,
  Partial<{ productId: string; quantity: number }>
>;

// Lazy singleton to avoid polluting global namespace in tests
let eventStoreInstance: EventStore | null = null;

const getEventStore = (): EventStore => {
  if (!eventStoreInstance) {
    eventStoreInstance = getInMemoryEventStore();
  }
  return eventStoreInstance;
};

export const setEventStore = (store: EventStore) => {
  eventStoreInstance = store;
};

const handle = DeciderCommandHandler(decider);

const dummyPriceProvider = (_productId: string) => {
  return 100;
};

// POST /clients/{clientId}/shopping-carts
export const openShoppingCart = on(async (request: Request) => {
  const clientId = assertNotEmptyString(request.params.clientId);
  const shoppingCartId = clientId;

  const result = await handle(
    getEventStore(),
    shoppingCartId,
    {
      type: 'OpenShoppingCart',
      data: { clientId, shoppingCartId, openedAt: new Date() },
    },
    { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
  );

  return Created({
    createdId: shoppingCartId,
    eTag: toWeakETag(result.nextExpectedStreamVersion),
  });
});

// POST /clients/{clientId}/shopping-carts/{shoppingCartId}/product-items
export const addProductItemToShoppingCart = on(
  async (request: AddProductItemRequest) => {
    const shoppingCartId = assertNotEmptyString(request.params.shoppingCartId);
    const productItem: ProductItem = {
      productId: assertNotEmptyString(request.body.productId),
      quantity: assertPositiveNumber(request.body.quantity),
    };
    const unitPrice = dummyPriceProvider(productItem.productId);

    const result = await handle(
      getEventStore(),
      shoppingCartId,
      {
        type: 'AddProductItemToShoppingCart',
        data: { shoppingCartId, productItem: { ...productItem, unitPrice } },
      },
      {
        expectedStreamVersion: assertUnsignedBigInt(
          getETagValueFromIfMatch(request),
        ),
      },
    );

    return NoContent({
      eTag: toWeakETag(result.nextExpectedStreamVersion),
    });
  },
);

// DELETE /clients/{clientId}/shopping-carts/{shoppingCartId}/product-items
export const removeProductItemFromShoppingCart = on(
  async (request: Request) => {
    const shoppingCartId = assertNotEmptyString(request.params.shoppingCartId);
    const productItem: PricedProductItem = {
      productId: assertNotEmptyString(request.query.productId),
      quantity: assertPositiveNumber(Number(request.query.quantity)),
      unitPrice: assertPositiveNumber(Number(request.query.unitPrice)),
    };

    const result = await handle(
      getEventStore(),
      shoppingCartId,
      {
        type: 'RemoveProductItemFromShoppingCart',
        data: { shoppingCartId, productItem },
      },
      {
        expectedStreamVersion: assertUnsignedBigInt(
          getETagValueFromIfMatch(request),
        ),
      },
    );

    return NoContent({
      eTag: toWeakETag(result.nextExpectedStreamVersion),
    });
  },
);

// POST /clients/{clientId}/shopping-carts/{shoppingCartId}/confirm
export const confirmShoppingCart = on(async (request: Request) => {
  const shoppingCartId = assertNotEmptyString(request.params.shoppingCartId);

  const result = await handle(
    getEventStore(),
    shoppingCartId,
    {
      type: 'ConfirmShoppingCart',
      data: { shoppingCartId, confirmedAt: new Date() },
    },
    {
      expectedStreamVersion: assertUnsignedBigInt(
        getETagValueFromIfMatch(request),
      ),
    },
  );

  return NoContent({
    eTag: toWeakETag(result.nextExpectedStreamVersion),
  });
});

// DELETE /clients/{clientId}/shopping-carts/{shoppingCartId}
export const cancelShoppingCart = on(async (request: Request) => {
  const shoppingCartId = assertNotEmptyString(request.params.shoppingCartId);

  const result = await handle(
    getEventStore(),
    shoppingCartId,
    {
      type: 'CancelShoppingCart',
      data: { shoppingCartId, canceledAt: new Date() },
    },
    {
      expectedStreamVersion: assertUnsignedBigInt(
        getETagValueFromIfMatch(request),
      ),
    },
  );

  return NoContent({
    eTag: toWeakETag(result.nextExpectedStreamVersion),
  });
});
