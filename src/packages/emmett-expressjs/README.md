# @event-driven-io/emmett-expressjs

Express.js integration for Emmett - Event Sourcing development made simple.

## Features

- 🚀 **Express.js Application Setup** - Quick and easy Express.js configuration for Emmett applications
- ❌ **Problem Details Error Handling** - RFC 7807 compliant error responses
- ✅ **OpenAPI 3.x Validation** (Optional) - Request/response validation with express-openapi-validator
- 🧪 **Testing Utilities** - Built-in utilities for API testing and E2E tests

## Installation

```bash
npm install @event-driven-io/emmett-expressjs express
```

For OpenAPI validation support (optional):

```bash
npm install express-openapi-validator
```

## Quick Start

```typescript
import { getApplication } from '@event-driven-io/emmett-expressjs';
import type { Application } from 'express';

// Create Express application with Emmett defaults
const app: Application = getApplication();

// Define your routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

## OpenAPI Validation

The package supports optional OpenAPI 3.x validation through `express-openapi-validator`. This feature validates HTTP requests and responses against your OpenAPI specification.

### Basic Setup

```typescript
import { getApplication } from '@event-driven-io/emmett-expressjs';
import type { OpenAPIV3Document } from '@event-driven-io/emmett-expressjs/openapi';

const apiSpec: OpenAPIV3Document = {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
  paths: {
    '/api/users': {
      get: {
        responses: {
          '200': {
            description: 'User list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  }
};

const app = getApplication({
  openApiValidator: {
    apiSpec,
    validateRequests: true,
    validateResponses: true,
  }
});
```

### Advanced Features

- **Security Handlers** - Custom authentication/authorization handlers
- **Operation Handlers** - Automatic route-to-handler mapping based on operationId
- **Request Coercion** - Automatic type conversion for query params
- **File Upload Support** - Multipart form data validation
- **Format Validation** - Email, UUID, date-time, etc.

📚 **See the [OpenAPI Validation Guide](./docs/openapi-validation.md) for complete documentation.**

## Testing Utilities

The package provides utilities for testing your Express.js APIs:

```typescript
import { getApplication } from '@event-driven-io/emmett-expressjs';
import {
  apiSpecification,
  type TestResponse,
} from '@event-driven-io/emmett-expressjs/testing';

describe('My API', () => {
  let given: ReturnType<typeof apiSpecification>;

  beforeEach(() => {
    const app = getApplication();
    // Add your routes...
    given = apiSpecification(app);
  });

  it('should return health status', async () => {
    const response: TestResponse = await given
      .when((request) => request.get('/api/health'))
      .then((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ok' });
      });
  });
});
```

## Examples

Check out the [examples/](./examples/) directory for complete working examples:

- [Basic Usage](./examples/openapi/basic/) - Simple OpenAPI validation setup
- [With Security](./examples/openapi/with-security/) - Custom security handlers (JWT, API keys)
- [Operation Handlers](./examples/openapi/operation-handlers/) - Automatic route-to-handler mapping

## Documentation

📚 **Full documentation:** https://event-driven-io.github.io/emmett/

**Package-specific guides:**
- [OpenAPI Validation Guide](./docs/openapi-validation.md)

## Error Handling

The package automatically converts errors to RFC 7807 Problem Details responses:

```typescript
import { ProblemDocument } from 'http-problem-details';

app.get('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);

  if (!user) {
    throw new ProblemDocument({
      status: 404,
      title: 'User not found',
      detail: `User with id ${req.params.id} does not exist`,
    });
  }

  res.json(user);
});
```

## Requirements

- Node.js 18+
- Express.js 4.x
- TypeScript 5.0+ (recommended)

## License

MIT

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) for details.

## Support

- 📖 [Documentation](https://event-driven-io.github.io/emmett/)
- 💬 [GitHub Discussions](https://github.com/event-driven-io/emmett/discussions)
- 🐛 [Issue Tracker](https://github.com/event-driven-io/emmett/issues)
