import { KredsAuthorization } from './api.js';
import { KredsHttpAdapter } from './http.js';

interface KredsContextBase {
  readonly transport: 'http' | 'authenticate_function';
  authorization?: KredsAuthorization;
  readonly strategyName?: string;
  readonly payload?: unknown;
}

export interface KredsContextHttp extends KredsContextBase {
  readonly transport: 'http';
  readonly adapter: KredsHttpAdapter;
}

export interface KredsContextAuthenticateFunction extends KredsContextBase {
  readonly transport: 'authenticate_function';
}

export type KredsContext = KredsContextHttp | KredsContextAuthenticateFunction;
