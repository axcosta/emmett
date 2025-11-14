/**
 * Operation handlers for ping endpoint
 *
 * The exported function names must match the operationId in the OpenAPI spec
 */

import type { Request, Response } from 'express';

export const ping = (_req: Request, res: Response) => {
  res.status(200).json({ message: 'pong' });
};
