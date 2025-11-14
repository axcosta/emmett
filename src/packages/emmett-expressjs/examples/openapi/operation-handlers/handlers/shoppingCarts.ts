/**
 * Operation handlers for shopping cart endpoints
 *
 * The exported function names must match the operationId in the OpenAPI spec
 */

import type { Request, Response } from 'express';

// Simple in-memory storage for demonstration
const carts = new Map<
  string,
  {
    id: string;
    clientId: string;
    items: Array<{ productId: string; quantity: number }>;
  }
>();

export const createShoppingCart = (req: Request, res: Response) => {
  const { clientId } = req.body as { clientId: string };
  const cartId = clientId; // Simplified: using clientId as cartId

  if (carts.has(cartId)) {
    return res.status(400).json({ message: 'Cart already exists' });
  }

  const cart = {
    id: cartId,
    clientId,
    items: [],
  };

  carts.set(cartId, cart);

  res.status(201).json({
    id: cart.id,
    clientId: cart.clientId,
  });
};

export const addItemToCart = (req: Request, res: Response) => {
  const { cartId } = req.params as { cartId: string };
  const { productId, quantity } = req.body as {
    productId: string;
    quantity: number;
  };

  const cart = carts.get(cartId);

  if (!cart) {
    return res.status(404).json({ message: 'Cart not found' });
  }

  cart.items.push({ productId, quantity });

  res.status(200).json({
    message: 'Item added',
    cartId: cart.id,
    itemCount: cart.items.length,
  });
};
