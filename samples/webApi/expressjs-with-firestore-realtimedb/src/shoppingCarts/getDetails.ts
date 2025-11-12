import { merge, type ReadEvent } from '@event-driven-io/emmett';
import { realtimeDBProjection, type RealtimeDBReadEventMetadata } from '@event-driven-io/emmett-realtimedb';
import type {
  PricedProductItem,
  ShoppingCartEvent,
} from './shoppingCart';

export type ShoppingCartDetails = {
  id: string;
  clientId: string;
  productItems: PricedProductItem[];
  productItemsCount: number;
  totalAmount: number;
  status: 'Opened' | 'Confirmed' | 'Cancelled';
  openedAt: Date;
  confirmedAt?: Date | undefined;
  cancelledAt?: Date | undefined;
};

const evolve = (
  documentFromDb: ShoppingCartDetails | null,
  { type, data: event }: ReadEvent<ShoppingCartEvent, RealtimeDBReadEventMetadata>,
): ShoppingCartDetails | null => {
  switch (type) {
    case 'ProductItemAddedToShoppingCart': {
      const document = documentFromDb ?? {
        id: event.shoppingCartId,
        status: 'Opened' as const,
        productItems: [],
        totalAmount: 0,
        productItemsCount: 0,
      };

      const {
        productItem,
        productItem: { productId, quantity, unitPrice },
        clientId,
      } = event;

      return {
        ...document,
        openedAt: 'openedAt' in document ? document.openedAt : event.addedAt,
        clientId: clientId,
        productItems: merge(
          document.productItems,
          event.productItem,
          (p) => p.productId === productId && p.unitPrice === unitPrice,
          (p) => {
            return {
              ...p,
              quantity: p.quantity + quantity,
            };
          },
          () => productItem,
        ),
        totalAmount:
          document.totalAmount +
          event.productItem.unitPrice * event.productItem.quantity,
        productItemsCount:
          document.productItemsCount + event.productItem.quantity,
      };
    }
    case 'ProductItemRemovedFromShoppingCart': {
      const {
        productItem,
        productItem: { productId, quantity, unitPrice },
      } = event;

      return {
        ...documentFromDb!,
        productItems: merge(
          documentFromDb!.productItems,
          productItem,
          (p) => p.productId === productId && p.unitPrice === unitPrice,
          (p) => {
            return {
              ...p,
              quantity: p.quantity - quantity,
            };
          },
        ),
        totalAmount:
          documentFromDb!.totalAmount -
          event.productItem.unitPrice * event.productItem.quantity,
        productItemsCount:
          documentFromDb!.productItemsCount - event.productItem.quantity,
      };
    }
    case 'ShoppingCartConfirmed':
      return {
        ...documentFromDb!,
        status: 'Confirmed',
        confirmedAt: event.confirmedAt,
      };
    case 'ShoppingCartCancelled':
      return {
        ...documentFromDb!,
        status: 'Cancelled',
        cancelledAt: event.cancelledAt,
      };
    default:
      return documentFromDb;
  }
};

export const shoppingCartDetailsProjection = realtimeDBProjection<
  ShoppingCartDetails,
  ShoppingCartEvent
>({
  name: 'shopping-cart-details',
  canHandle: [
    'ProductItemAddedToShoppingCart',
    'ProductItemRemovedFromShoppingCart',
    'ShoppingCartConfirmed',
    'ShoppingCartCancelled',
  ],
  evolve,
});
