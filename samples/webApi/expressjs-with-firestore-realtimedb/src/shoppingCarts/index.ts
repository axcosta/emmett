import { shoppingCartApi } from './api';
import { shoppingCartDetailsProjection } from './getDetails';

export default {
  api: shoppingCartApi,
  projections: [shoppingCartDetailsProjection],
};

export * from './api';
export * from './businessLogic';
export * from './shoppingCart';
export * from './getDetails';
