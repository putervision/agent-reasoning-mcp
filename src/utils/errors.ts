export class ReasoningError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseError extends ReasoningError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', details);
  }
}

export class ValidationError extends ReasoningError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends ReasoningError {
  constructor(message: string, details?: unknown) {
    super(message, 'NOT_FOUND_ERROR', details);
  }
}

export class ConflictError extends ReasoningError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT_ERROR', details);
  }
}
