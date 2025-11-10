import type { NextFunction, Request, Response } from 'express';
import { ProblemDocument } from 'http-problem-details';
import { sendProblem, type ErrorToProblemDetailsMapping } from '..';

export const problemDetailsMiddleware =
  (mapError?: ErrorToProblemDetailsMapping) =>
  (
    error: Error,
    request: Request,
    response: Response,
    _next: NextFunction,
  ): void => {
    let problemDetails: ProblemDocument | undefined;

    if (mapError) problemDetails = mapError(error, request);

    problemDetails =
      problemDetails ?? defaultErrorToProblemDetailsMapping(error);

    sendProblem(response, problemDetails.status, { problem: problemDetails });
  };

export const defaultErrorToProblemDetailsMapping = (
  error: Error,
): ProblemDocument => {
  let statusCode = 500;

  // Prefer standard `status` code if present (e.g., express-openapi-validator)
  const errObj = error as unknown as Record<string, unknown>;
  const maybeStatus = errObj['status'];
  if (
    typeof maybeStatus === 'number' &&
    maybeStatus >= 100 &&
    maybeStatus < 600
  ) {
    statusCode = maybeStatus;
  }

  const maybeErrorCode = errObj['errorCode'];
  if (
    typeof maybeErrorCode === 'number' &&
    maybeErrorCode >= 100 &&
    maybeErrorCode < 600
  ) {
    statusCode = maybeErrorCode;
  }

  return new ProblemDocument({
    detail: error.message,
    status: statusCode,
  });
};
