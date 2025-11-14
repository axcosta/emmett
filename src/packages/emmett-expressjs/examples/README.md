# Emmett Express.js Examples

This directory contains working examples demonstrating various features of `@event-driven-io/emmett-expressjs`.

## Available Examples

### 1. Basic OpenAPI Validation
**Location:** [openapi/basic/](./openapi/basic/)

Demonstrates basic OpenAPI 3.x validation with express-openapi-validator.

**Features:**
- Request validation against OpenAPI spec
- Type coercion for query parameters
- Format validation (UUID, etc.)
- Error responses as Problem Details (RFC 7807)

**Run:**
```bash
cd openapi/basic
npm install  # Install dependencies (if needed)
npm start    # Run the example
```

### 2. OpenAPI with Security Handlers
**Location:** [openapi/with-security/](./openapi/with-security/)

Shows how to implement custom authentication and authorization handlers.

**Features:**
- Bearer token (JWT) authentication
- API key authentication
- Custom security validation
- Scope-based authorization

**Run:**
```bash
cd openapi/with-security
npm start
```

### 3. Operation Handlers
**Location:** [openapi/operation-handlers/](./openapi/operation-handlers/)

Demonstrates automatic route-to-handler mapping based on OpenAPI operationId.

**Features:**
- Automatic routing based on `operationId`
- Reduces boilerplate code
- Type-safe handler functions
- Operation-specific handlers

**Run:**
```bash
cd openapi/operation-handlers
npm start
```

## Testing Examples

All examples can be tested by making HTTP requests to the running servers. Each example prints curl commands you can use for testing.

## Requirements

- Node.js 18+
- npm or pnpm
- Express.js 4.x
- express-openapi-validator (optional, but required for OpenAPI examples)

## Learn More

- 📚 [OpenAPI Validation Guide](../docs/openapi-validation.md)
- 📖 [Full Documentation](https://event-driven-io.github.io/emmett/)
- 💬 [GitHub Discussions](https://github.com/event-driven-io/emmett/discussions)
