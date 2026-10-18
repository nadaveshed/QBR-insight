export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
export class PermanentProcessingError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
