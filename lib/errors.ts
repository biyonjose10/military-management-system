/**
 * The three failures the security layers produce, and the status each maps to.
 *
 * `NotFoundError` is thrown for a row that exists but sits outside the viewer's
 * scope, not only for a row that does not exist. Returning 403 there would
 * confirm the record's existence to someone who may not know the unit — the
 * response itself becomes an oracle for enumerating the roster.
 */

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Not signed in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  /** The field that caused the refusal, when there was one. */
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ForbiddenError";
    this.field = field;
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function statusFor(error: unknown): number {
  if (
    error instanceof UnauthorizedError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  ) {
    return error.status;
  }
  return 500;
}
