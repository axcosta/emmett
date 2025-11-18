/**
 * Operation handlers for shopping cart endpoints
 *
 * The exported function names must match the operationId in the OpenAPI spec
 */

import {
  CommandHandler,
  assertNotEmptyString,
  assertPositiveNumber,
  getInMemoryEventStore,
  getInMemoryMessageBus,
  type EventStore,
  type EventsPublisher,
} from '@event-driven-io/emmett';
import type { Request, Response } from 'express';
import {
  addProductItem as addProductItemCommand,
  cancel,
  confirm,
  removeProductItem as removeProductItemCommand,
  type AddProductItemToShoppingCart,
  type CancelShoppingCart,
  type ConfirmShoppingCart,
  type RemoveProductItemFromShoppingCart,
} from '../shoppingCarts/businessLogic';
import {
  ShoppingCartId,
  evolve,
  initialState,
} from '../shoppingCarts/shoppingCart';

export const handle = CommandHandler({ evolve, initialState });

// Module-level dependencies (can be replaced for testing)
let eventStore: EventStore = getInMemoryEventStore();
let messageBus: EventsPublisher = getInMemoryMessageBus();
let getUnitPrice = (_productId: string) => Promise.resolve(100);
let getCurrentTime = () => new Date();

// For testing: allow injection of dependencies
export const __setDependencies = (
  newEventStore: EventStore,
  newMessageBus?: EventsPublisher,
  newGetUnitPrice?: (_productId: string) => Promise<number>,
  newGetCurrentTime?: () => Date,
) => {
  eventStore = newEventStore;
  if (newMessageBus) messageBus = newMessageBus;
  if (newGetUnitPrice) getUnitPrice = newGetUnitPrice;
  if (newGetCurrentTime) getCurrentTime = newGetCurrentTime;
};

// POST /clients/{clientId}/shopping-carts/current/product-items
export const addProductItem = async (request: Request, response: Response) => {
  try {
    const clientId = assertNotEmptyString(request.params.clientId);
    const shoppingCartId = ShoppingCartId(clientId);
    const productId = assertNotEmptyString(request.body.productId);

    const command: AddProductItemToShoppingCart = {
      type: 'AddProductItemToShoppingCart',
      data: {
        shoppingCartId,
        clientId,
        productItem: {
          productId,
          quantity: assertPositiveNumber(request.body.quantity),
          unitPrice: await getUnitPrice(productId),
        },
      },
      metadata: { clientId, now: getCurrentTime() },
    };

    await handle(eventStore, shoppingCartId, (state) =>
      addProductItemCommand(command, state),
    );

    response.status(204).send();
  } catch (error) {
    const status = error instanceof Error && error.message.includes('already closed') ? 403 : 400;
    response.status(status).json({
      type: 'about:blank',
      title: status === 403 ? 'Forbidden' : 'Bad Request',
      status,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// DELETE /clients/{clientId}/shopping-carts/current/product-items
export const removeProductItem = async (request: Request, response: Response) => {
  try {
    const clientId = assertNotEmptyString(request.params.clientId);
    const shoppingCartId = ShoppingCartId(clientId);

    const command: RemoveProductItemFromShoppingCart = {
      type: 'RemoveProductItemFromShoppingCart',
      data: {
        shoppingCartId,
        productItem: {
          productId: assertNotEmptyString(request.query.productId),
          quantity: assertPositiveNumber(Number(request.query.quantity)),
          unitPrice: assertPositiveNumber(Number(request.query.unitPrice)),
        },
      },
      metadata: { clientId, now: getCurrentTime() },
    };

    await handle(eventStore, shoppingCartId, (state) =>
      removeProductItemCommand(command, state),
    );

    response.status(204).send();
  } catch (error) {
    const status = error instanceof Error && error.message.includes('already closed') ? 403 : 400;
    response.status(status).json({
      type: 'about:blank',
      title: status === 403 ? 'Forbidden' : 'Bad Request',
      status,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// POST /clients/{clientId}/shopping-carts/current/confirm
export const confirmShoppingCart = async (request: Request, response: Response) => {
  try {
    const clientId = assertNotEmptyString(request.params.clientId);
    const shoppingCartId = ShoppingCartId(clientId);

    const command: ConfirmShoppingCart = {
      type: 'ConfirmShoppingCart',
      data: { shoppingCartId },
      metadata: { clientId, now: getCurrentTime() },
    };

    const {
      newEvents: [confirmed, ..._rest],
    } = await handle(eventStore, shoppingCartId, (state) =>
      confirm(command, state),
    );

    // This is just example, it'll run in-proc
    // so don't do that if you care about delivery guarantees
    await messageBus.publish(confirmed);

    response.status(204).send();
  } catch (error) {
    const status = error instanceof Error && error.message.includes('already closed') ? 403 : 400;
    response.status(status).json({
      type: 'about:blank',
      title: status === 403 ? 'Forbidden' : 'Bad Request',
      status,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// DELETE /clients/{clientId}/shopping-carts/current
export const cancelShoppingCart = async (request: Request, response: Response) => {
  try {
    const clientId = assertNotEmptyString(request.params.clientId);
    const shoppingCartId = ShoppingCartId(clientId);

    const command: CancelShoppingCart = {
      type: 'CancelShoppingCart',
      data: { shoppingCartId },
      metadata: { clientId, now: getCurrentTime() },
    };

    await handle(eventStore, shoppingCartId, (state) =>
      cancel(command, state),
    );

    response.status(204).send();
  } catch (error) {
    const status = error instanceof Error && error.message.includes('already closed') ? 403 : 400;
    response.status(status).json({
      type: 'about:blank',
      title: status === 403 ? 'Forbidden' : 'Bad Request',
      status,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
