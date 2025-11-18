import {
  CommandHandler,
  assertNotEmptyString,
  assertPositiveNumber,
  type EventStore,
  type EventsPublisher,
} from '@event-driven-io/emmett';
import { NoContent, on, type WebApiSetup } from '@event-driven-io/emmett-expressjs';
import { type Request, type Router } from 'express';
import {
  addProductItem,
  cancel,
  confirm,
  removeProductItem,
  type AddProductItemToShoppingCart,
  type CancelShoppingCart,
  type ConfirmShoppingCart,
  type RemoveProductItemFromShoppingCart,
} from './shoppingCarts/businessLogic';
import { ShoppingCartId, evolve, initialState } from './shoppingCarts/shoppingCart';

export const handle = CommandHandler({ evolve, initialState });

/**
 * Shopping Cart API setup
 * Manually wires the operation handlers to routes, since express-openapi-validator
 * has issues loading ESM modules as operation handlers in some environments.
 */
export const shoppingCartApi =
  (
    eventStore: EventStore,
    eventPublisher: EventsPublisher,
    getUnitPrice: (_productId: string) => Promise<number>,
    getCurrentTime: () => Date,
  ): WebApiSetup =>
  (router: Router) => {
    // POST /clients/{clientId}/shopping-carts/current/product-items
    router.post(
      '/clients/:clientId/shopping-carts/current/product-items',
      on(async (request: Request) => {
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
          addProductItem(command, state),
        );

        return NoContent();
      }),
    );

    // DELETE /clients/{clientId}/shopping-carts/current/product-items
    router.delete(
      '/clients/:clientId/shopping-carts/current/product-items',
      on(async (request: Request) => {
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
          removeProductItem(command, state),
        );

        return NoContent();
      }),
    );

    // POST /clients/{clientId}/shopping-carts/current/confirm
    router.post(
      '/clients/:clientId/shopping-carts/current/confirm',
      on(async (request: Request) => {
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
        await eventPublisher.publish(confirmed);

        return NoContent();
      }),
    );

    // DELETE /clients/{clientId}/shopping-carts/current
    router.delete(
      '/clients/:clientId/shopping-carts/current',
      on(async (request: Request) => {
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

        return NoContent();
      }),
    );
  };
