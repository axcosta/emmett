import express, {
  Router,
  type Application,
  type RequestHandler,
} from 'express';
import 'express-async-errors';
import http from 'http';
import { createRequire } from 'node:module';
import { problemDetailsMiddleware } from './middlewares/problemDetailsMiddleware';
import type { OpenApiValidatorOptions } from './openapi';
import type { ErrorToProblemDetailsMapping } from './responses';

// #region web-api-setup
export type WebApiSetup = (router: Router) => void;
// #endregion web-api-setup

export type ApplicationOptions = {
  apis: WebApiSetup[];
  mapError?: ErrorToProblemDetailsMapping;
  enableDefaultExpressEtag?: boolean;
  disableJsonMiddleware?: boolean;
  disableUrlEncodingMiddleware?: boolean;
  disableProblemDetailsMiddleware?: boolean;
  /**
   * Optional OpenAPI validator configuration.
   * When provided, enables request/response validation against an OpenAPI specification.
   * Requires the 'express-openapi-validator' package to be installed.
   *
   * @see https://github.com/cdimascio/express-openapi-validator
   * @example
   * ```typescript
   * import { getApplication, createOpenApiValidatorOptions } from '@event-driven-io/emmett-expressjs';
   *
   * const app = getApplication({
   *   apis: [myApi],
   *   openApiValidator: createOpenApiValidatorOptions('./openapi.yaml', {
   *     validateResponses: true
   *   })
   * });
   * ```
   */
  openApiValidator?: OpenApiValidatorOptions;
};

export const getApplication = (options: ApplicationOptions) => {
  const app: Application = express();

  const {
    apis,
    mapError,
    enableDefaultExpressEtag,
    disableJsonMiddleware,
    disableUrlEncodingMiddleware,
    disableProblemDetailsMiddleware,
    openApiValidator,
  } = options;

  const router = Router();

  // disabling default etag behaviour
  // to use etags in if-match and if-not-match headers
  app.set('etag', enableDefaultExpressEtag ?? false);

  // add json middleware
  if (!disableJsonMiddleware) app.use(express.json());

  // enable url encoded urls and bodies
  if (!disableUrlEncodingMiddleware)
    app.use(
      express.urlencoded({
        extended: true,
      }),
    );

  // add OpenAPI validator middleware if configured
  if (openApiValidator) {
    try {
      const require = createRequire(import.meta.url);
      // express-openapi-validator exports a default with .middleware (ESM/CJS compatibility)
      const mod = require('express-openapi-validator') as Record<
        string,
        unknown
      >;
      const provider = (mod.default ?? mod) as Record<string, unknown>;

      if (typeof provider.middleware !== 'function') {
        throw new Error(
          'Invalid express-openapi-validator module: missing middleware export',
        );
      }

      // Serve OpenAPI spec if configured
      if (openApiValidator.serveSpec) {
        if (typeof openApiValidator.apiSpec === 'string') {
          // If apiSpec is a file path, serve it as a static file
          app.use(
            openApiValidator.serveSpec,
            express.static(openApiValidator.apiSpec),
          );
        } else {
          // If apiSpec is an object, serve it as JSON
          app.get(openApiValidator.serveSpec, (_req, res) => {
            res.json(openApiValidator.apiSpec);
          });
        }
      }

      const factory = provider.middleware as (
        opts: OpenApiValidatorOptions,
      ) => RequestHandler | RequestHandler[];
      const middleware = factory(openApiValidator);
      if (Array.isArray(middleware)) {
        for (const m of middleware) app.use(m);
      } else {
        app.use(middleware);
      }
    } catch {
      console.warn(
        'OpenAPI validator configuration provided but express-openapi-validator package is not installed. ' +
          'Install it with: npm install express-openapi-validator',
      );
      throw new Error(
        'express-openapi-validator package is required when openApiValidator option is used',
      );
    }
  }

  for (const api of apis) {
    api(router);
  }
  app.use(router);

  // add problem details middleware
  if (!disableProblemDetailsMiddleware)
    app.use(problemDetailsMiddleware(mapError));

  return app;
};

export type StartApiOptions = {
  port?: number;
};

export const startAPI = (
  app: Application,
  options: StartApiOptions = { port: 3000 },
) => {
  const { port } = options;
  const server = http.createServer(app);

  server.on('listening', () => {
    console.info('server up listening');
  });

  return server.listen(port);
};
