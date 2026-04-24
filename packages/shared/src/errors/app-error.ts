export enum ErrorCode {
  // Auth
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_REVOKED = "TOKEN_REVOKED",
  TOKEN_REUSE_DETECTED = "TOKEN_REUSE_DETECTED",
  EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS",
  INVITE_EXPIRED = "INVITE_EXPIRED",
  INVITE_ALREADY_ACCEPTED = "INVITE_ALREADY_ACCEPTED",

  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",

  // Resources
  NOT_FOUND = "NOT_FOUND",
  TEAM_NOT_FOUND = "TEAM_NOT_FOUND",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  CONNECTOR_NOT_FOUND = "CONNECTOR_NOT_FOUND",
  DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND",

  // Rate Limiting
  RATE_LIMITED = "RATE_LIMITED",

  // Connectors
  CONNECTOR_AUTH_FAILED = "CONNECTOR_AUTH_FAILED",
  CONNECTOR_SYNC_FAILED = "CONNECTOR_SYNC_FAILED",
  CONNECTOR_ALREADY_EXISTS = "CONNECTOR_ALREADY_EXISTS",
  OAUTH_STATE_INVALID = "OAUTH_STATE_INVALID",

  // Plan
  PLAN_LIMIT_EXCEEDED = "PLAN_LIMIT_EXCEEDED",
  QUERY_LIMIT_EXCEEDED = "QUERY_LIMIT_EXCEEDED",
  CONNECTOR_LIMIT_EXCEEDED = "CONNECTOR_LIMIT_EXCEEDED",

  // Billing
  BILLING_ERROR = "BILLING_ERROR",
  NO_ACTIVE_SUBSCRIPTION = "NO_ACTIVE_SUBSCRIPTION",

  // Search
  SEARCH_FAILED = "SEARCH_FAILED",
  EMBEDDING_FAILED = "EMBEDDING_FAILED",
  GENERATION_FAILED = "GENERATION_FAILED",

  // Internal
  INTERNAL = "INTERNAL",
  DATABASE_ERROR = "DATABASE_ERROR",
  REDIS_ERROR = "REDIS_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: unknown;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): AppErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = "Insufficient permissions"): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static notFound(resource = "Resource"): AppError {
    return new AppError(
      ErrorCode.NOT_FOUND,
      `${resource} not found`,
      404
    );
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(
      ErrorCode.VALIDATION_ERROR,
      message,
      400,
      details
    );
  }

  static rateLimited(retryAfterSeconds?: number): AppError {
    return new AppError(
      ErrorCode.RATE_LIMITED,
      "Rate limit exceeded. Please try again later.",
      429,
      retryAfterSeconds ? { retryAfter: retryAfterSeconds } : undefined
    );
  }

  static planLimitExceeded(limit: string): AppError {
    return new AppError(
      ErrorCode.PLAN_LIMIT_EXCEEDED,
      `Plan limit exceeded: ${limit}. Please upgrade your plan.`,
      402
    );
  }

  static internal(message = "An unexpected error occurred"): AppError {
    return new AppError(ErrorCode.INTERNAL, message, 500);
  }
}

export interface AppErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
