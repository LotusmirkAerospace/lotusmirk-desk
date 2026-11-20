export class DeskError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DeskError';
    this.code = code;
  }
}
