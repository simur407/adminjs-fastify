/* eslint-disable import/prefer-default-export */
export class WrongArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongArgumentError';
  }
}
