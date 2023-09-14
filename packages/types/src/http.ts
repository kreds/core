export interface KredsHttpCookieOptions {
  httpOnly?: boolean;
  sameSite?: boolean;
  secure?: boolean;
  expiresAt?: Date;
}

export interface KredsHttpAuthorization {
  type: string;
  credentials?: string;
}

export interface KredsHttpAdapter {
  getCookie(name: string): string | undefined;
  setCookie(
    name: string,
    value: string,
    options?: KredsHttpCookieOptions
  ): void;
  clearCookie(name: string): void;
  getRequestHeader(name: string): string | string[] | undefined;
  setResponseHeader(name: string, value: string | string[] | undefined): void;
  getAuthorization(): KredsHttpAuthorization | undefined;
}
