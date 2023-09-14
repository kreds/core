import { KredsResult, KredsStrategiesResult, KredsAuthenticationOutcome, KredsStrategy, KredsContext,
  KredsContextAuthenticateFunction, } from '@kreds/types';
  
export class Kreds<TUser> {
  private callbackRedirectUrl: string | undefined = undefined;
  private strategies = new Map<string, KredsStrategy<TUser>>();
  private primaryStrategy: string | undefined = undefined;
  displayUser: ((user: TUser) => any | Promise<any>) | undefined = undefined;

  setCallbackRedirectUrl(url: string) {
    this.callbackRedirectUrl = url;
  }

  buildCallbackUrl(name: string, payload: unknown): string {
    if (!this.callbackRedirectUrl) {
      throw new Error('Set redirect URL with `setCallbackRedirectUrl` first.');
    }

    const url = new URL(this.callbackRedirectUrl);
    url.searchParams.set('kreds_callback', JSON.stringify({ name, payload }));
    return url.toString();
  }

  use(name: string, strategy: KredsStrategy<TUser>): void;
  use(strategy: KredsStrategy<TUser>): void;

  use(
    nameOrStrategy: string | KredsStrategy<TUser>,
    strategy?: KredsStrategy<TUser>
  ): void {
    const name =
      typeof nameOrStrategy === 'object' ? nameOrStrategy.name : nameOrStrategy;
    strategy ??=
      typeof nameOrStrategy === 'object' ? nameOrStrategy : undefined;

    if (!name) {
      throw new Error('Strategy must have a name.');
    }

    if (!strategy) {
      throw new Error('No strategy provided.');
    }

    this.strategies.set(name, strategy);

    if (!this.primaryStrategy) {
      this.primaryStrategy = name;
    }
  }

  setPrimaryStrategy(strategyName: string): void {
    if (!this.strategies.has(strategyName)) {
      throw new Error(`Unknown authentication strategy ${strategyName}.`);
    }

    this.primaryStrategy = strategyName;
  }

  async authenticate(
    name: string,
    payload?: unknown
  ): Promise<KredsAuthenticationOutcome<TUser> | undefined>;
  async authenticate(
    context: KredsContext,
    payload?: unknown
  ): Promise<KredsAuthenticationOutcome<TUser> | undefined>;

  async authenticate(
    nameOrContext: string | KredsContext,
    payload: unknown
  ): Promise<KredsAuthenticationOutcome<TUser> | undefined> {
    const strategyName =
      typeof nameOrContext === 'string'
        ? nameOrContext
        : nameOrContext.strategyName;
    const context =
      typeof nameOrContext === 'object'
        ? nameOrContext
        : ({
            transport: 'authenticate_function',
            payload,
            strategyName,
          } as KredsContextAuthenticateFunction);

    if (strategyName) {
      const strategy = this.strategies.get(strategyName);
      if (!strategy) {
        throw new Error(`Unknown authentication strategy ${strategyName}.`);
      }

      return await strategy.authenticate(context);
    } else {
      for (const strategy of this.strategies.values()) {
        const result = await strategy.authenticate(context);

        if (result) {
          return result;
        }
      }
    }

    return undefined;
  }

  async unauthenticate(strategyName: string, payload: any) {
    const context = {
      transport: 'authenticate_function',
      payload,
      strategyName,
    } as KredsContextAuthenticateFunction;

    if (strategyName) {
      const strategy = this.strategies.get(strategyName);
      if (!strategy) {
        throw new Error(`Unknown authentication strategy ${strategyName}.`);
      }

      return await strategy.unauthenticate?.(context);
    }

    return undefined;
  }

  async store(
    strategyName: string,
    context: KredsContext,
    user: TUser
  ): Promise<void> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown authentication strategy ${strategyName}.`);
    }

    const store = strategy.store;

    if (!store) {
      throw new Error(
        `Authentication strategy ${strategyName} does not support storing.`
      );
    }

    await store(context, user);
  }

  errorResult(text: string): KredsResult {
    return {
      ok: false,
      error: text,
      action: {
        type: 'render',
        payload: [
          {
            id: 'error_paragraph',
            type: 'paragraph',
            mode: 'error',
            children: [{ id: 'error_text', type: 'text', label: text }],
          },
        ],
      },
    };
  }

  strategiesResult(): KredsStrategiesResult {
    if (!this.primaryStrategy || !this.strategies.has(this.primaryStrategy)) {
      throw new Error('No primary strategy specified.');
    }

    const result: KredsStrategiesResult = {
      ok: true,
      primary: this.primaryStrategy,
      strategies: [...this.strategies.entries()].map(([key, value]) => {
        return {
          name: key,
          label: key, // TODO: Add support for custom labels
          action: value.action,
        };
      }),
    };

    return result;
  }
}
