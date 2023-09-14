import { KredsClientAction } from './client.js';

export interface KredsAuthorization {
  type: string;
  credentials?: string;
  /**
   * UNIX timestamp in ms.
   */
  expiresAt?: number;
}

export interface KredsResult {
  ok: boolean;
  done?: boolean;
  error?: string;
  action?: KredsClientAction;
  authorization?: KredsAuthorization;
  state?: string;
  refreshStrategy?: { name: string; payload: unknown };
}

export interface KredsAuthenticationStrategy {
  name: string;
  label: string;
  action?: KredsClientAction;
}

export interface KredsStrategiesResult extends KredsResult {
  primary: string;
  secondary?: string[];
  strategies: KredsAuthenticationStrategy[];
}

export interface KredsUserResult extends KredsResult {
  user?: any;
}
