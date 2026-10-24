import { expect, it, vi } from 'vitest';
import {
  cloudAccountsAvailable,
  cloudOrigins,
  dashboardLinks,
  resolveCloudEnvironment,
} from './cloud-config';

it('packaged builds are locked to production whatever the env var says', () => {
  expect(resolveCloudEnvironment({ packaged: true, requested: 'local' }).name).toBe('prod');
});

it('developer builds honour VOICESTUDIO_CLOUD_ENV and default to dev', () => {
  expect(resolveCloudEnvironment({ packaged: false, requested: 'local' }).issuer).toBe(
    'http://localhost:8092',
  );
  expect(resolveCloudEnvironment({ packaged: false }).name).toBe('dev');
  expect(resolveCloudEnvironment({ packaged: false, requested: 'bogus' }).name).toBe('dev');
});

it('signs in with Zitadel on its own host, not the old Keycloak realm (vssaas ADR 0093)', () => {
  const prod = resolveCloudEnvironment({ packaged: true });
  expect(prod.issuer).toBe('https://id.voicestudio.sh');
  const dev = resolveCloudEnvironment({ packaged: false, requested: 'dev' });
  expect(dev.issuer).toBe('https://dev-id.voicestudio.sh');
  for (const requested of ['prod', 'dev', 'local'])
    expect(resolveCloudEnvironment({ packaged: false, requested }).issuer).not.toContain(
      '/realms/',
    );
});

it('uses the Zitadel client ID of each environment', () => {
  expect(resolveCloudEnvironment({ packaged: false, requested: 'dev' }).clientId).toBe(
    '396555644615786670',
  );
  // Each local stack registers its own client.
  expect(resolveCloudEnvironment({ packaged: false, requested: 'local' }).clientId).toBe('');
  expect(
    resolveCloudEnvironment({ packaged: false, requested: 'local', clientId: ' 123 ' }).clientId,
  ).toBe('123');
});

it('ignores a client ID override in packaged builds', () => {
  expect(resolveCloudEnvironment({ packaged: true, clientId: 'attacker' }).clientId).not.toBe(
    'attacker',
  );
});

it('lists exactly the origins the app may contact', () => {
  expect([...cloudOrigins(resolveCloudEnvironment({ packaged: true }))].sort()).toEqual([
    'https://appapi.voicestudio.sh',
    'https://id.voicestudio.sh',
  ]);
  expect(
    [...cloudOrigins(resolveCloudEnvironment({ packaged: false, requested: 'dev' }))].sort(),
  ).toEqual(['https://dev-appapi.voicestudio.sh', 'https://dev-id.voicestudio.sh']);
});

it('lands on the dashboard after sign-in and links to its profile and plan pages', () => {
  const dev = resolveCloudEnvironment({ packaged: false, requested: 'dev' });
  expect(dev.signedInPage).toBe('https://dev-app.voicestudio.sh/app/desktop-signed-in');
  expect(dashboardLinks(resolveCloudEnvironment({ packaged: true }))).toEqual({
    profile: 'https://app.voicestudio.sh/app/settings/profile',
    plan: 'https://app.voicestudio.sh/app/settings/plan',
  });
});

it('accounts are available in developer builds and hidden in packaged builds without the flag', () => {
  expect(cloudAccountsAvailable(false)).toBe(true);
  expect(cloudAccountsAvailable(true)).toBe(false);
});

it('packaged builds also need the production client ID before accounts appear', () => {
  vi.stubGlobal('__CLOUD_ACCOUNTS__', true);
  vi.stubGlobal('__CLOUD_CLIENT_ID__', '');
  expect(cloudAccountsAvailable(true)).toBe(false);
  vi.stubGlobal('__CLOUD_CLIENT_ID__', '400000000000000001');
  expect(cloudAccountsAvailable(true)).toBe(true);
  expect(resolveCloudEnvironment({ packaged: true }).clientId).toBe('400000000000000001');
  vi.unstubAllGlobals();
});
