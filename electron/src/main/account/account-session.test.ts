import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { AccountSession, backoffDelay } from './account-session';
import { CloudActivity } from './cloud-activity';
import { CloudSwitchStore } from './cloud-switches';
import { InvalidGrantError, TransientAuthError } from './oidc';
import { RefreshTokenStore } from './token-store';

const memorySafe = {
  isEncryptionAvailable: () => false,
  encryptString: Buffer.from,
  decryptString: String,
} as never;

function harness(over: Partial<Record<string, unknown>> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vs-session-'));
  const switches = new CloudSwitchStore(join(dir, 'switches.json'));
  switches.set({ accountEnabled: true, prompted: true });
  const store = new RefreshTokenStore(join(dir, 'account.json'), memorySafe);
  const activity = new CloudActivity({
    isAllowed: () => switches.get().accountEnabled,
    origins: new Set(['https://voicestudio.sh']),
    fetchImpl: vi.fn(),
  });
  const tokens = (refresh: string) => ({
    access_token: `a-${refresh}`,
    refresh_token: refresh,
    expires_in: 300,
    scope: 'openid offline_access',
  });
  const oidc = {
    discover: vi.fn(async () => ({
      authorization_endpoint: 'https://voicestudio.sh/auth',
      token_endpoint: '',
      revocation_endpoint: '',
    })),
    authorizeUrl: vi.fn(() => 'https://voicestudio.sh/auth?x'),
    exchangeCode: vi.fn(async () => tokens('r1')),
    refresh: vi.fn(async () => tokens('r2')),
    revoke: vi.fn(async () => {}),
  };
  let resolveCode!: (c: string) => void;
  const loopback = {
    redirectUri: 'http://127.0.0.1:1/callback',
    code: new Promise<string>((r) => (resolveCode = r)),
    close: vi.fn(),
  };
  let t = 0;
  const openExternal = vi.fn(async () => {});
  const session = new AccountSession({
    oidc: oidc as never,
    store,
    activity,
    switches,
    openExternal,
    startLoopback: vi.fn(async () => loopback) as never,
    signedInPage: 'https://app.voicestudio.sh/app/desktop-signed-in',
    now: () => t,
    ...over,
  });
  return {
    session,
    oidc,
    store,
    switches,
    loopback,
    openExternal,
    resolveCode,
    advance: (ms: number) => (t += ms),
  };
}

it('signs in through the browser and stores the refresh token', async () => {
  const h = harness();
  const done = h.session.signIn();
  await vi.waitFor(() => expect(h.session.state().signingIn).toBe(true));
  h.resolveCode('code');
  await done;
  expect(h.store.load()).toBe('r1');
  expect(h.session.state()).toMatchObject({ signedIn: true, signingIn: false });
});

it('refuses to start sign-in while account features are off', async () => {
  const h = harness();
  h.switches.set({ accountEnabled: false });
  await expect(h.session.signIn()).rejects.toThrow(/switched off/);
  expect(h.oidc.discover).not.toHaveBeenCalled();
});

it('turning account off mid sign-in closes the listener and stores nothing', async () => {
  const h = harness();
  const done = h.session.signIn().catch((e) => e);
  // openExternal runs only after the listener exists, so close() is wired by now.
  await vi.waitFor(() => expect(h.openExternal).toHaveBeenCalled());
  h.switches.set({ accountEnabled: false });
  expect(h.loopback.close).toHaveBeenCalled();
  h.resolveCode('late-code');
  await done;
  expect(h.oidc.exchangeCode).not.toHaveBeenCalled();
  expect(h.store.load()).toBeNull();
});

it('concurrent getAccessToken calls share one refresh, and the token rotates', async () => {
  const h = harness();
  h.store.save('r1');
  const [a, b, c] = await Promise.all([
    h.session.getAccessToken(),
    h.session.getAccessToken(),
    h.session.getAccessToken(),
  ]);
  expect(h.oidc.refresh).toHaveBeenCalledOnce();
  expect(a).toEqual(b);
  expect(c?.access_token).toBe('a-r2');
  expect(h.store.load()).toBe('r2');
});

it('reuses a fresh access token and refreshes inside the 60 s window', async () => {
  const h = harness();
  h.store.save('r1');
  await h.session.getAccessToken();
  h.advance(200_000);
  await h.session.getAccessToken();
  expect(h.oidc.refresh).toHaveBeenCalledTimes(1);
  h.advance(50_000); // 250 s of 300 s used: less than 60 s left
  await h.session.getAccessToken();
  expect(h.oidc.refresh).toHaveBeenCalledTimes(2);
});

it('invalid_grant signs out with the expired notice', async () => {
  const h = harness();
  h.store.save('r1');
  h.oidc.refresh.mockRejectedValueOnce(new InvalidGrantError());
  expect(await h.session.getAccessToken()).toBeNull();
  expect(h.store.load()).toBeNull();
  expect(h.session.state()).toMatchObject({ signedIn: false, notice: 'signed_out_expired' });
});

it('a network error keeps the user signed in', async () => {
  const h = harness();
  h.store.save('r1');
  h.oidc.refresh.mockRejectedValueOnce(new TransientAuthError(503));
  await expect(h.session.getAccessToken()).rejects.toBeInstanceOf(TransientAuthError);
  expect(h.store.load()).toBe('r1');
  expect(h.session.state()).toMatchObject({ signedIn: true, notice: 'offline' });
});

it('turning account features off revokes once, deletes the token and hands out nothing', async () => {
  const h = harness();
  h.store.save('r1');
  h.switches.set({ accountEnabled: false });
  await vi.waitFor(() => expect(h.oidc.revoke).toHaveBeenCalledWith('r1'));
  expect(h.store.load()).toBeNull();
  expect(await h.session.getAccessToken()).toBeNull();
  expect(h.oidc.refresh).not.toHaveBeenCalled();
});

it('sign-out deletes the token even when revocation fails', async () => {
  const h = harness();
  h.store.save('r1');
  h.oidc.revoke.mockRejectedValueOnce(new Error('offline'));
  await h.session.signOut();
  expect(h.store.load()).toBeNull();
  expect(h.session.state().signedIn).toBe(false);
});

it('backoff doubles from 1 s and caps at 5 min', () => {
  expect([0, 1, 2, 3].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000]);
  expect(backoffDelay(20)).toBe(300_000);
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const late = (refresh: string) => ({
  access_token: `a-${refresh}`,
  refresh_token: refresh,
  expires_in: 300,
  scope: 'openid offline_access',
});

it('sign-out during an in-flight refresh stays signed out', async () => {
  const h = harness();
  h.store.save('r1');
  const pending = deferred<ReturnType<typeof late>>();
  h.oidc.refresh.mockReturnValueOnce(pending.promise);
  const token = h.session.getAccessToken();
  await h.session.signOut();
  pending.resolve(late('r2'));
  expect(await token).toBeNull();
  expect(h.store.load()).toBeNull();
  expect(h.session.state().signedIn).toBe(false);
});

it('switching account features off during an in-flight refresh stores nothing', async () => {
  const h = harness();
  h.store.save('r1');
  const pending = deferred<ReturnType<typeof late>>();
  h.oidc.refresh.mockReturnValueOnce(pending.promise);
  const token = h.session.getAccessToken();
  h.switches.set({ accountEnabled: false });
  pending.resolve(late('r2'));
  expect(await token).toBeNull();
  expect(h.store.load()).toBeNull();
});

it('switching off while the code exchange is in flight stores nothing', async () => {
  const h = harness();
  const pending = deferred<ReturnType<typeof late>>();
  h.oidc.exchangeCode.mockReturnValueOnce(pending.promise);
  const done = h.session.signIn().catch(() => {});
  await vi.waitFor(() => expect(h.openExternal).toHaveBeenCalled());
  h.resolveCode('code');
  await vi.waitFor(() => expect(h.oidc.exchangeCode).toHaveBeenCalled());
  h.switches.set({ accountEnabled: false });
  pending.resolve(late('r9'));
  await done;
  expect(h.store.load()).toBeNull();
  expect(h.session.state().signedIn).toBe(false);
});

it('a leftover token is cleared at startup when account features are off', () => {
  const h = harness();
  h.store.save('r-left-over');
  h.switches.set({ accountEnabled: false });
  h.store.save('r-left-over'); // e.g. a corrupt switches file reset to off
  new AccountSession({
    oidc: h.oidc as never,
    store: h.store,
    activity: new CloudActivity({ isAllowed: () => false, origins: new Set(), fetchImpl: vi.fn() }),
    switches: h.switches,
    openExternal: vi.fn(),
    startLoopback: vi.fn() as never,
    signedInPage: 'https://app.voicestudio.sh/app/desktop-signed-in',
  });
  expect(h.store.load()).toBeNull();
});

it('Cancel during discovery never opens the browser', async () => {
  const h = harness();
  const pending = deferred<{
    authorization_endpoint: string;
    token_endpoint: string;
    revocation_endpoint: string;
  }>();
  h.oidc.discover.mockReturnValueOnce(pending.promise);
  const done = h.session.signIn().catch(() => {});
  h.session.cancelSignIn();
  pending.resolve({
    authorization_endpoint: 'https://voicestudio.sh/auth',
    token_endpoint: '',
    revocation_endpoint: '',
  });
  await done;
  expect(h.openExternal).not.toHaveBeenCalled();
  expect(h.session.state()).toMatchObject({ signingIn: false, notice: null });
});

it('Cancel during the code exchange stores nothing', async () => {
  const h = harness();
  const pending = deferred<ReturnType<typeof late>>();
  h.oidc.exchangeCode.mockReturnValueOnce(pending.promise);
  const done = h.session.signIn().catch(() => {});
  await vi.waitFor(() => expect(h.openExternal).toHaveBeenCalled());
  h.resolveCode('code');
  await vi.waitFor(() => expect(h.oidc.exchangeCode).toHaveBeenCalled());
  h.session.cancelSignIn();
  pending.resolve(late('r-cancelled'));
  await done;
  expect(h.store.load()).toBeNull();
  expect(h.session.state()).toMatchObject({ signedIn: false, notice: null });
});
