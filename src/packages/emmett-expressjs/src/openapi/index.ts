/**
 * OpenAPI v3 Document type (to avoid requiring express-openapi-validator types directly)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenAPIV3Document = any;

/**
 * Configuration options for express-openapi-validator middleware.
 * This allows optional validation of API requests and responses against an OpenAPI specification.
 *
 * @see https://github.com/cdimascio/express-openapi-validator
 */
export type OpenApiValidatorOptions = {
  /**
   * Path to the OpenAPI specification file (JSON or YAML)
   * or an OpenAPI specification object.
   */
  apiSpec: string | OpenAPIV3Document;

  /**
   * Determines whether the validator should validate requests.
   * @default true
   */
  validateRequests?: boolean;

  /**
   * Determines whether the validator should validate responses.
   * @default false
   */
  validateResponses?: boolean;

  /**
   * Determines whether the validator should validate security.
   * @default true
   */
  validateSecurity?: boolean;

  /**
   * Defines how the validator should validate formats.
   * When true, uses ajv-formats for format validation.
   * When false, format validation is disabled.
   * @default true
   */
  validateFormats?: boolean;

  /**
   * The base path to the operation handlers directory.
   * When set to a path, automatically wires OpenAPI operations to handler functions
   * based on operationId or x-eov-operation-id.
   * When false, operation handlers are disabled (manual routing required).
   * @default false
   * @see https://cdimascio.github.io/express-openapi-validator-documentation/guide-operation-handlers/
   */
  operationHandlers?: string | false;

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
 * const validatorOptions = createOpenApiValidatorOptions('./openapi.yaml', {
 *   validateResponses: true,
 *   validateSecurity: false
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
