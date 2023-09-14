import { KredsClientAction } from './client.js';
import { KredsContext } from './server.js';

export interface KredsStrategy<TUser> {
  readonly name: string;

  /**
   * Basic action to be provided in strategies list.
   * Used to reduce the amount of API calls whenever possible.
   */
  readonly action?: KredsClientAction;

  authenticate(
    context: KredsContext
  ): Promise<KredsAuthenticationOutcome<TUser> | undefined>;
  store?(context: KredsContext, user: TUser): Promise<void>;
  unauthenticate?(context: KredsContext): Promise<void>;
}

export type KredsVerifyUserFunction<TUser, TData> = (
  context: KredsContext,
  data: TData
) => Promise<KredsAuthenticationOutcome<TUser>>;

export type KredsStoreFunction<TUser, TSession extends {}> = (
  context: KredsContext,
  user: TUser
) => Promise<TSession>;

export type KredsDestroyFunction<TData> = (
  context: KredsContext,
  payload: TData
) => Promise<void>;

export interface KredsAuthenticationOutcome<TUser> {
  done: boolean;
  action?: KredsClientAction;
  state?: string;
  isRefreshNeeded?: boolean;
  expiresAt?: Date;
  user?: TUser;
  refreshStrategy?: {
    name: string;
    payload: unknown;
  };
}

export interface KredsStrategyOptions<TUser> {
  verify: KredsVerifyUserFunction<TUser, any>;
  store?: KredsStoreFunction<TUser, any>;
  destroy?: KredsDestroyFunction<any>;
}
