/**
 * OpenAPI v3 Document type (to avoid requiring express-openapi-validator types directly)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenAPIV3Document = any;

/**
 * Security handlers for custom authentication/authorization logic.
 * Maps security scheme names to handler functions.
 *
 * @see https://cdimascio.github.io/express-openapi-validator-documentation/usage-validate-security/
 */

export type SecurityHandlers = Record<
  string,
  (req: any, scopes: string[], schema: any) => boolean | Promise<boolean>
>;

/**
 * Configuration options for express-openapi-validator middleware.
 * This allows optional validation of API requests and responses against an OpenAPI specification.
 *
 * @see https://cdimascio.github.io/express-openapi-validator-documentation/
 */
export type OpenApiValidatorOptions = {
  /**
   * Path to the OpenAPI specification file (JSON or YAML)
   * or an OpenAPI specification object.
   */
  apiSpec: string | OpenAPIV3Document;

  /**
   * Determines whether the validator should validate requests.
   * Can be a boolean or an object with detailed request validation options.
   * @default true
   * @see https://cdimascio.github.io/express-openapi-validator-documentation/usage-validate-requests/
   */
  validateRequests?:
    | boolean
    | {
        /**
         * Allow unknown query parameters (not defined in the spec).
         * @default false
         */
        allowUnknownQueryParameters?: boolean;
        /**
         * Coerce types in request parameters.
         * @default true
         */
        coerceTypes?: boolean | 'array';
        /**
         * Remove additional properties not defined in the spec.
         * @default false
         */
        removeAdditional?: boolean | 'all' | 'failing';
      };

  /**
   * Determines whether the validator should validate responses.
   * Can be a boolean or an object with detailed response validation options.
   * @default false
   * @see https://cdimascio.github.io/express-openapi-validator-documentation/usage-validate-responses/
   */
  validateResponses?:
    | boolean
    | {
        /**
         * Remove additional properties from responses not defined in the spec.
         * @default false
         */
        removeAdditional?: boolean | 'all' | 'failing';
        /**
         * Coerce types in responses.
         * @default true
         */
        coerceTypes?: boolean;
        /**
         * Callback to handle response validation errors.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError?: (error: any, body: any, req: any) => void;
      };

  /**
   * Determines whether the validator should validate security.
   * Can be a boolean or an object with security handlers.
   * @default true
   * @see https://cdimascio.github.io/express-openapi-validator-documentation/usage-validate-security/
   */
  validateSecurity?:
    | boolean
    | {
        /**
         * Custom security handlers for authentication/authorization.
         */
        handlers?: SecurityHandlers;
      };

  /**
   * Defines how the validator should validate formats.
   * When true, uses ajv-formats for format validation.
   * When false, format validation is disabled.
   * Can also be 'fast' or 'full' for different validation modes.
   * @default true
   */
  validateFormats?: boolean | 'fast' | 'full';

  /**
   * The base path to the operation handlers directory.
   * When set to a path, automatically wires OpenAPI operations to handler functions
   * based on operationId or x-eov-operation-id.
   * When false, operation handlers are disabled (manual routing required).
   * @default false
   * @see https://cdimascio.github.io/express-openapi-validator-documentation/guide-operation-handlers/
   */
  operationHandlers?:
    | string
    | false
    | {
        /**
         * Base path to operation handlers directory.
         */
        basePath?: string;
        /**
         * Resolver function to map operationId to handler module path.
         */
        resolver?: (
          handlersPath: string,
          route: string,
          apiDoc: OpenAPIV3Document,
        ) => string;
      };

  /**
   * Paths or pattern to ignore during validation.
   * @default undefined
   */
  ignorePaths?: RegExp | ((path: string) => boolean);

  /**
   * Validate the OpenAPI specification itself.
   * @default true
   */
  validateApiSpec?: boolean;

  /**
   * $ref parser configuration for handling OpenAPI references.
   * @default undefined
   */
  $refParser?: {
    mode: 'bundle' | 'dereference';
  };

  /**
   * Serve the OpenAPI specification at a specific path.
   * When set to a string, the spec will be served at that path.
   * When false, the spec will not be served.
   * @default false
   * @example '/api-docs/openapi.json'
   */
  serveSpec?: string | false;

  /**
   * File upload configuration options.
   * @see https://cdimascio.github.io/express-openapi-validator-documentation/usage-file-uploads/
   */
  fileUploader?:
    | boolean
    | {
        /**
         * Destination directory for uploaded files.
         */
        dest?: string;
        /**
         * File size limit in bytes.
         */
        limits?: {
          fileSize?: number;
          files?: number;
        };
      };
};

/**
 * Helper function to create OpenAPI validator configuration with sensible defaults.
 *
 * @param apiSpec - Path to OpenAPI spec file or OpenAPI document object
 * @param options - Additional validator options
 * @returns Complete OpenApiValidatorOptions configuration
 *
 * @example
 * ```typescript
 * // Basic usage with default options
 * const validatorOptions = createOpenApiValidatorOptions('./openapi.yaml');
 *
 * // With response validation enabled
 * const validatorOptions = createOpenApiValidatorOptions('./openapi.yaml', {
 *   validateResponses: true
 * });
 *
 * // With custom security handlers
 * const validatorOptions = createOpenApiValidatorOptions('./openapi.yaml', {
 *   validateSecurity: {
 *     handlers: {
 *       bearerAuth: async (req, scopes) => {
 *         // Custom authentication logic
 *         return true;
 *       }
 *     }
 *   }
 * });
 *
 * // Serving the spec at /api-docs
 * const validatorOptions = createOpenApiValidatorOptions('./openapi.yaml', {
 *   serveSpec: '/api-docs/openapi.json'
 * });
 *
 * const app = getApplication({
 *   apis: [myApi],
 *   openApiValidator: validatorOptions
 * });
 * ```
 */
export const createOpenApiValidatorOptions = (
  apiSpec: string | OpenAPIV3Document,
  options?: Partial<Omit<OpenApiValidatorOptions, 'apiSpec'>>,
): OpenApiValidatorOptions => {
  return {
    apiSpec,
    validateRequests: options?.validateRequests ?? true,
    validateResponses: options?.validateResponses ?? false,
    validateSecurity: options?.validateSecurity ?? true,
    validateFormats: options?.validateFormats ?? true,
    operationHandlers: options?.operationHandlers,
    ignorePaths: options?.ignorePaths,
    validateApiSpec: options?.validateApiSpec ?? true,
    $refParser: options?.$refParser,
    serveSpec: options?.serveSpec ?? false,
    fileUploader: options?.fileUploader,
  };
};

/**
 * Type guard to check if express-openapi-validator is available
 */
export const isOpenApiValidatorAvailable = async (): Promise<boolean> => {
  try {
    await import('express-openapi-validator');
    return true;
  } catch {
    return false;
  }
};
