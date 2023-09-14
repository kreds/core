import {
  KredsAuthenticationStrategy,
  KredsAuthorization,
  KredsResult,
  KredsStrategiesResult,
  KredsUserResult,
  KredsComponent,
} from '@kreds/types';

const CALLBACK_SEARCH = 'kreds_callback';
const AUTHORIZATION_STORAGE = 'kreds_authorization';
const REFRESH_STRATEGY_STORAGE = 'kreds_refresh_strategy';

export interface KredsClientOptions {
  url: string | URL;
  prefix?: string;
}

async function fetchWithTimeout(
  resource: RequestInfo | URL,
  options: RequestInit & { timeout?: number } = {}
) {
  const { timeout = 5000 } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(id);
  return response;
}

export class KredsClient<TUser> {
  private authorization: KredsAuthorization | undefined = undefined;
  private state: string | undefined = undefined;
  private lastStrategyName: string | undefined = undefined;
  private refreshTimeout: any = undefined;

  private listenerMap: Map<string, Set<Function>> = new Map();
  private lastPromise: Promise<void> | undefined = undefined;
  private userData: TUser | undefined = undefined;
  private sortedStrategies: KredsAuthenticationStrategy[] = [];

  constructor(private options: KredsClientOptions) {
    this.initialize();
    window.addEventListener('storage', ev => {
      if (ev.key === this.itemName(AUTHORIZATION_STORAGE)) {
        this.authorization = this.tryParse(ev.newValue);
        this.onAuthorizationChanged();
      }
    });
  }

  private async wait(): Promise<{ resolve?: () => void }> {
    if (this.lastPromise) {
      await this.lastPromise;
    }

    let output: { resolve?: () => void } = {};
    const promise = new Promise<void>(resolve => {
      output.resolve = () => {
        if (this.lastPromise === promise) {
          this.lastPromise = undefined;
          this.emit('loadingStateChange');
        }
        resolve();
      };
    });

    const previous = this.lastPromise;
    this.lastPromise = promise;
    if (!previous) {
      this.emit('loadingStateChange');
    }

    return output;
  }

  get user() {
    return this.userData;
  }

  get strategies() {
    return this.sortedStrategies;
  }

  on(eventName: 'authenticationStateChange', listener: () => void): void;
  on(eventName: 'loadingStateChange', listener: () => void): void;
  on(eventName: 'error', listener: (error: Error) => void): void;
  on(
    eventName: 'render',
    listener: (components: KredsComponent[]) => void
  ): void;
  on(eventName: string, listener: Function) {
    if (!this.listenerMap.has(eventName)) {
      this.listenerMap.set(eventName, new Set());
    }

    this.listenerMap.get(eventName)!.add(listener);
  }

  off(eventName: string, listener: Function) {
    this.listenerMap.get(eventName)?.delete(listener);
  }

  private emit(eventName: string, ...payload: any[]) {
    const set = this.listenerMap.get(eventName);
    if (!set) {
      return;
    }

    set.forEach(value => value.apply(this, payload));
  }

  get isLoading() {
    return !!this.lastPromise;
  }

  private async initialize() {
    const callback = this.getCallback();
    if (callback) {
      this.removeCallback();
      this.authenticate(callback.name, callback.payload);
    } else {
      this.authorization = this.getAuthorization();
      await this.onAuthorizationChanged();
    }
    await this.updateStrategies();
  }

  private buildUrl(path: string) {
    const url = new URL(path, this.options.url);
    return url.toString();
  }

  private async onAuthorizationChanged() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    const expiresAt = this.authorization?.expiresAt;
    if (!expiresAt) {
      this.updateUser();
      return;
    }

    const remainingMs =
      expiresAt - new Date().getTime() - Math.floor(Math.random() * 30000);
    if (remainingMs < 0) {
      await this.executeRefreshStrategy();
      return;
    }

    this.updateUser();
    this.refreshTimeout = setTimeout(() => {
      this.executeRefreshStrategy();
    }, remainingMs);
  }

  async updateStrategies(): Promise<KredsStrategiesResult> {
    const wait = await this.wait();

    try {
      this.sortedStrategies = [];
      const res = await fetchWithTimeout(this.buildUrl('./strategies'));
      const result = (await res.json()) as KredsStrategiesResult;

      if (result.ok) {
        const strategyNames = new Set<string>();
        if (result.primary) {
          strategyNames.add(result.primary);
        }

        if (result.secondary) {
          for (const name of result.secondary) {
            strategyNames.add(name);
          }
        }

        for (const strategy of result.strategies) {
          if (strategy.action) {
            strategyNames.add(strategy.name);
          }
        }

        for (const name of strategyNames) {
          const strategy = result.strategies.find(
            strategy => strategy.name === name
          );
          if (strategy) {
            this.sortedStrategies.push(strategy);
          }
        }
      }

      return result;
    } catch (e) {
      this.emit(
        'error',
        new Error('Unable to fetch authentication strategies.')
      );
      throw e;
    } finally {
      wait.resolve?.();
    }
  }

  private async executeRefreshStrategy(): Promise<KredsResult | undefined> {
    const refreshStrategy = this.getRefreshStrategy();
    if (!refreshStrategy) {
      return undefined;
    }

    return await this.authenticate(
      refreshStrategy.name,
      refreshStrategy.payload
    );
  }

  async authenticate(
    strategyName: string,
    payload?: unknown
  ): Promise<KredsResult> {
    const wait = await this.wait();

    try {
      if (this.lastStrategyName !== strategyName) {
        this.state = undefined;
      }

      if (this.state) {
        payload = {
          state: this.state,
          ...(payload || {}),
        };
      }

      const res = await fetchWithTimeout(
        this.buildUrl(`./authenticate/${strategyName}`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      const result = (await res.json()) as KredsResult;
      this.state = result.state;
      this.setOrRemoveItem(REFRESH_STRATEGY_STORAGE, result.refreshStrategy);
      this.setAuthorization(result.authorization);

      if (result.action?.type === 'redirect') {
        window.location.href = result.action.url;
      } else if (result.action?.type === 'render') {
        this.emit('render', result.action.payload);
      }

      return result;
    } catch (e) {
      this.emit('error', new Error('Unable to complete authentication.'));
      throw e;
    } finally {
      wait.resolve?.();
    }
  }

  async unauthenticate() {
    if (!this.authorization) {
      return;
    }

    const wait = await this.wait();

    try {
      const body = [this.getRefreshStrategy()];
      this.setOrRemoveItem(REFRESH_STRATEGY_STORAGE);
      this.setOrRemoveItem(AUTHORIZATION_STORAGE);
      this.authorization = undefined;
      this.onAuthorizationChanged();

      await fetchWithTimeout(this.buildUrl(`./unauthenticate`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.emit('error', new Error('Error while logging out.'));
      throw e;
    } finally {
      wait.resolve?.();
    }
  }

  async updateUser() {
    if (!this.authorization) {
      this.userData = undefined;
      this.emit('authenticationStateChange');
      return;
    }

    const result = await this.fetchUser();

    if (result.ok) {
      if (result.user) {
        this.userData = result.user;
        this.emit('authenticationStateChange');
      } else {
        this.executeRefreshStrategy();
      }
    } else {
      this.userData = undefined;
    }
  }

  private async fetchUser(): Promise<KredsUserResult> {
    const wait = await this.wait();

    try {
      const res = await fetchWithTimeout(this.buildUrl(`./user`), {
        headers: this.getRequestHeaders(),
      });
      return await res.json();
    } finally {
      wait.resolve?.();
    }
  }

  private getCallback(): { name: string; payload: unknown } | undefined {
    const params = new URLSearchParams(window.location.search);
    const str = params.get(CALLBACK_SEARCH);
    if (!str) {
      return undefined;
    }

    try {
      const json = JSON.parse(str);
      if (typeof json.name === 'string') {
        return json;
      }
    } catch {
      return undefined;
    }
  }

  private removeCallback(): void {
    const params = new URLSearchParams(window.location.search);
    params.delete(CALLBACK_SEARCH);
    const urlSuffix = params + window.location.hash;
    window.history.replaceState(
      null,
      '',
      urlSuffix ? `?${urlSuffix}` : window.location.pathname
    );
  }

  private getRefreshStrategy(): { name: string; payload: unknown } | undefined {
    const json = this.getItem(REFRESH_STRATEGY_STORAGE);
    if (json && typeof json.name === 'string') {
      return json;
    }

    return undefined;
  }

  private getAuthorization(): KredsAuthorization | undefined {
    const json = this.getItem(AUTHORIZATION_STORAGE);
    if (
      json &&
      typeof json.type === 'string' &&
      typeof json.credentials === 'string'
    ) {
      return json;
    }

    return undefined;
  }

  private setAuthorization(authorization: KredsAuthorization | undefined) {
    this.setOrRemoveItem(AUTHORIZATION_STORAGE, authorization);
    this.authorization = authorization;
    this.onAuthorizationChanged();
  }

  private tryParse(data: string | null | undefined): any {
    if (!data) {
      return undefined;
    }

    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  private itemName(name: string): string {
    return (this.options.prefix || '') + name;
  }

  private getItem(name: string): any {
    name = this.itemName(name);
    return this.tryParse(localStorage.getItem(name));
  }

  private setOrRemoveItem(name: string, data?: any) {
    name = this.itemName(name);
    if (!data) {
      localStorage.removeItem(name);
    } else {
      localStorage.setItem(name, JSON.stringify(data));
    }
  }

  getRequestHeaders(): { authorization?: string } {
    const authorization = this.authorization;

    return {
      authorization: authorization
        ? `${authorization.type} ${authorization.credentials}`
        : undefined,
    };
  }
}
