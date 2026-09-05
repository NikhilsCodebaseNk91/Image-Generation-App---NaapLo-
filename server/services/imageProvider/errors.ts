export class ImageProviderError extends Error {
  public readonly code?: string;

  public constructor(message: string, code?: string) {
    super(message);
    this.name = 'ImageProviderError';
    this.code = code;
  }
}
