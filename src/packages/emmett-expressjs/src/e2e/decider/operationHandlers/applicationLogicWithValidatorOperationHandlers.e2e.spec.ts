import type { Application } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createOpenApiValidatorOptions, getApplication } from '../../..';
import { HeaderNames, toWeakETag } from '../../../etag';
import {
  expectNextRevisionInResponseEtag,
  runTwice,
  statuses,
  type TestResponse,
} from '../../testing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

void describe('Shopping Cart E2E with OpenAPI Validator (operationHandlers)', () => {
  let app: Application;

  beforeEach(() => {
    app = getApplication({
      apis: [],
      openApiValidator: createOpenApiValidatorOptions(
        path.join(__dirname, 'openapi.yml'),
        {
          validateRequests: true,
          validateResponses: false,
          operationHandlers: __dirname,
        },
      ),
    });
  });

  void it('Should handle requests correctly via operationHandlers with OpenAPI validation', async () => {
    const clientId = randomUUID();

    const createResponse = await runTwice(() =>
      request(app).post(`/clients/${clientId}/shopping-carts`).send(),
    ).expect(statuses(201, 412));

    let currentRevision = expectNextRevisionInResponseEtag(
      createResponse as TestResponse<{ id: string }>,
    );
    const createdId = (createResponse.body as { id?: string }).id;

    if (!createdId) throw new Error('Expected id in response body');

    const shoppingCartId = createdId;

    const twoPairsOfShoes = { quantity: 2, productId: '123' };
    let response = await runTwice(() =>
      request(app)
        .post(
          `/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`,
        )
        .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
        .send(twoPairsOfShoes),
    ).expect(statuses(204, 412));

    currentRevision = expectNextRevisionInResponseEtag(response);

    response = await runTwice(() =>
      request(app)
        .post(`/clients/${clientId}/shopping-carts/${shoppingCartId}/confirm`)
        .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
        .send(),
    ).expect(statuses(204, 412));

    expectNextRevisionInResponseEtag(response);
  });

  void it('Should reject invalid requests (missing quantity) with OpenAPI validation', async () => {
    const clientId = randomUUID();

    const createResponse = await request(app)
      .post(`/clients/${clientId}/shopping-carts`)
      .send();

    if (createResponse.status !== 201 && createResponse.status !== 412) {
      throw new Error(
        `Expected status 201 or 412, got ${createResponse.status}`,
      );
    }

    const currentRevision = expectNextRevisionInResponseEtag(
      createResponse as TestResponse<{ id: string }>,
    );
    const shoppingCartId =
      (createResponse.body as { id?: string }).id || clientId;

    const invalidResponse = await request(app)
      .post(
        `/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`,
      )
      .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
      .send({ productId: '123' });

    if (invalidResponse.status !== 400) {
      throw new Error(
        `Expected status 400 for invalid request, got ${invalidResponse.status}`,
      );
    }
  });

  void it('Should reject invalid request with negative quantity', async () => {
    const clientId = randomUUID();

    const createResponse = await request(app)
      .post(`/clients/${clientId}/shopping-carts`)
      .send();

    if (createResponse.status !== 201 && createResponse.status !== 412) {
      throw new Error(
        `Expected status 201 or 412, got ${createResponse.status}`,
      );
    }

    const currentRevision = expectNextRevisionInResponseEtag(
      createResponse as TestResponse<{ id: string }>,
    );
    const shoppingCartId =
      (createResponse.body as { id?: string }).id || clientId;

    const invalidResponse = await request(app)
      .post(
        `/clients/${clientId}/shopping-carts/${shoppingCartId}/product-items`,
      )
      .set(HeaderNames.IF_MATCH, toWeakETag(currentRevision))
      .send({ productId: '123', quantity: -1 });

    if (invalidResponse.status !== 400) {
      throw new Error(
        `Expected status 400 for invalid request, got ${invalidResponse.status}`,
      );
    }
  });
});
