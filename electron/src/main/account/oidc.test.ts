import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { CloudActivity, type FetchImpl } from './cloud-activity';
import { cloudOrigins, resolveCloudEnvironment } from './cloud-config';
import { InvalidGrantError, OidcClient, TransientAuthError, base64url, createPkce } from './oidc';

// The dev environment carries a fixed Zitadel client ID (prod's arrives at build time).
const env = resolveCloudEnvironment({ packaged: false, requested: 'dev' });
const discovery = {
  issuer: env.issuer,
  authorization_endpoint: `${env.issuer}/oauth/v2/authorize`,
  token_endpoint: `${env.issuer}/oauth/v2/token`,
  revocation_endpoint: `${env.issuer}/oauth/v2/revoke`,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = (fetchImpl: FetchImpl, now = () => 0) =>
  new OidcClient(
    env,
    new CloudActivity({ isAllowed: () => true, origins: cloudOrigins(env), fetchImpl }),
    now,
  );

it('PKCE challenge is base64url(SHA-256(verifier)) with spec lengths', () => {
  const p = createPkce();
  expect(p.challenge).toBe(base64url(createHash('sha256').update(p.verifier).digest()));
  expect(Buffer.from(p.verifier, 'base64url')).toHaveLength(64);
  expect(Buffer.from(p.state, 'base64url')).toHaveLength(32);
  expect(p.verifier).not.toMatch(/[+/=]/);
});

it('refuses a discovery document for another issuer', async () => {
  const c = client(vi.fn(async () => json({ ...discovery, issuer: 'https://evil.example' })));
  await expect(c.discover()).rejects.toThrow(/issuer/);
});

it('caches discovery for 24 hours', async () => {
  let t = 0;
  const fetchImpl = vi.fn(async () => json(discovery));
  const c = client(fetchImpl, () => t);
  await c.discover();
  t = 23 * 3600_000;
  await c.discover();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  t = 25 * 3600_000;
  await c.discover();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('builds the authorize URL from the contract', () => {
  const url = new URL(
    client(vi.fn()).authorizeUrl(discovery, 'http://127.0.0.1:5000/callback', {
      state: 's',
      challenge: 'c',
    }),
  );
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: env.clientId,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:5000/callback',
    scope: 'openid offline_access',
    state: 's',
    code_challenge: 'c',
    code_challenge_method: 'S256',
  });
});

it('rejects a token response without offline_access', async () => {
  const fetchImpl = vi.fn(async (u: string) =>
    u.endsWith('openid-configuration')
      ? json(discovery)
      : json({ access_token: 'a', refresh_token: 'r', expires_in: 300, scope: 'openid' }),
  );
  await expect(
    client(fetchImpl).exchangeCode('c', 'http://127.0.0.1:1/callback', 'v'),
  ).rejects.toThrow(/offline_access/);
});

it('maps refresh errors: invalid_grant vs transient', async () => {
  const respond = (r: Response) =>
    vi.fn(async (u: string) => (u.endsWith('openid-configuration') ? json(discovery) : r));
  await expect(
    client(respond(json({ error: 'invalid_grant' }, 400))).refresh('r'),
  ).rejects.toBeInstanceOf(InvalidGrantError);
  await expect(client(respond(json({}, 503))).refresh('r')).rejects.toBeInstanceOf(
    TransientAuthError,
  );
});

it('sends form-encoded refresh with the public client id and no secret', async () => {
  const fetchImpl = vi.fn<FetchImpl>(async (u: string) =>
    u.endsWith('openid-configuration')
      ? json(discovery)
      : json({
          access_token: 'a',
          refresh_token: 'r2',
          expires_in: 300,
          scope: 'openid offline_access',
        }),
  );
  await client(fetchImpl).refresh('r1');
  const body = new URLSearchParams(String(fetchImpl.mock.calls[1][1]!.body));
  expect(Object.fromEntries(body)).toEqual({
    grant_type: 'refresh_token',
    client_id: env.clientId,
    refresh_token: 'r1',
  });
});
