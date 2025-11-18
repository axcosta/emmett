import {
  getInMemoryEventStore,
  getInMemoryMessageBus,
} from '@event-driven-io/emmett';
import {
  getApplication,
  startAPI,
  createOpenApiValidatorOptions,
} from '@event-driven-io/emmett-expressjs';
import type { Application } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __setDependencies } from './handlers/shoppingCarts';
import type { ShoppingCartConfirmed } from './shoppingCarts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize dependencies for production use
const eventStore = getInMemoryEventStore();
const messageBus = getInMemoryMessageBus();
const getUnitPrice = (_productId: string) => Promise.resolve(100);
const getCurrentTime = () => new Date();

// Inject dependencies into operation handlers
__setDependencies(eventStore, messageBus, getUnitPrice, getCurrentTime);

// dummy example to show subscription
messageBus.subscribe((event: ShoppingCartConfirmed) => {
  console.log('Shopping Cart confirmed: ' + JSON.stringify(event));
}, 'ShoppingCartConfirmed');

const application: Application = getApplication({
  apis: [],

  openApiValidator: createOpenApiValidatorOptions(
    path.join(__dirname, '../openapi.yml'),
    {
      validateRequests: true,
      validateResponses: process.env.NODE_ENV !== 'production',
      validateFormats: 'fast',
      operationHandlers: path.join(__dirname, './handlers'),
    },
  ),
});

startAPI(application);

// Export for testing
export { eventStore, messageBus };
