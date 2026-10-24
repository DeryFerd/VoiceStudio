/**
 * VoiceStudio Cloud endpoints (vssaas docs/specs/desktop-account-client.md). One block per
 * environment. Sign-in is Zitadel on its own host (vssaas ADR 0093); the app discovers the
 * endpoints from `${issuer}/.well-known/openid-configuration`.
 */
export type CloudEnvName = 'prod' | 'dev' | 'local';

export interface CloudEnvironment {
  name: CloudEnvName;
  issuer: string;
  accountApi: string;
  syncApi: string;
  /** The web dashboard: the browser lands here after sign-in, and the account screen links to it. */
  dashboard: string;
  signedInPage: string;
  clientId: string;
}

const ENVIRONMENTS: Record<
  CloudEnvName,
  Omit<CloudEnvironment, 'name' | 'clientId' | 'signedInPage'> & { clientId: () => string }
> = {
  prod: {
    issuer: 'https://id.voicestudio.sh',
    accountApi: 'https://appapi.voicestudio.sh/v1/account',
    syncApi: 'https://appapi.voicestudio.sh/v1/sync',
    dashboard: 'https://app.voicestudio.sh',
    // Assigned by Zitadel when the production app is registered; injected at build time.
    clientId: () => (typeof __CLOUD_CLIENT_ID__ === 'string' ? __CLOUD_CLIENT_ID__ : ''),
  },
  dev: {
    issuer: 'https://dev-id.voicestudio.sh',
    accountApi: 'https://dev-appapi.voicestudio.sh/v1/account',
    syncApi: 'https://dev-appapi.voicestudio.sh/v1/sync',
    dashboard: 'https://dev-app.voicestudio.sh',
    // The desktop (native, public) client registered on the dev Zitadel.
    clientId: () => '396555644615786670',
  },
  local: {
    issuer: 'http://localhost:8092',
    accountApi: 'http://127.0.0.1:8080/v1/account',
    syncApi: 'http://127.0.0.1:8090/v1/sync',
    dashboard: 'http://127.0.0.1:3000',
    // Every local stack registers its own client (vssaas `idctl app -public`): set
    // VOICESTUDIO_CLOUD_CLIENT_ID to it.
    clientId: () => '',
  },
};

export function resolveCloudEnvironment(opts: {
  packaged: boolean;
  requested?: string;
  /** VOICESTUDIO_CLOUD_CLIENT_ID; honoured in developer builds only. */
  clientId?: string;
}): CloudEnvironment {
  const requested = opts.requested as CloudEnvName | undefined;
  const name: CloudEnvName = opts.packaged
    ? 'prod'
    : requested && Object.hasOwn(ENVIRONMENTS, requested)
      ? requested
      : 'dev';
  const { clientId, ...endpoints } = ENVIRONMENTS[name];
  const override = opts.packaged ? '' : (opts.clientId?.trim() ?? '');
  return {
    name,
    ...endpoints,
    signedInPage: `${endpoints.dashboard}/app/desktop-signed-in`,
    clientId: override || clientId(),
  };
}

/** Sync origins join in S1; S0 talks only to the issuer and the account API. */
export function cloudOrigins(env: CloudEnvironment): Set<string> {
  return new Set([new URL(env.issuer).origin, new URL(env.accountApi).origin]);
}

/** The dashboard pages the account screen opens in the browser. */
export function dashboardLinks(env: CloudEnvironment): { profile: string; plan: string } {
  return {
    profile: `${env.dashboard}/app/settings/profile`,
    plan: `${env.dashboard}/app/settings/plan`,
  };
}

/**
 * On in developer builds; packaged builds need VOICESTUDIO_CLOUD_ACCOUNTS=1 and the production
 * client ID (VOICESTUDIO_CLOUD_CLIENT_ID) at build time, so releases ship it dark until the
 * vssaas production API launches.
 */
export function cloudAccountsAvailable(packaged: boolean): boolean {
  if (!packaged) return true;
  return (
    typeof __CLOUD_ACCOUNTS__ === 'boolean' &&
    __CLOUD_ACCOUNTS__ &&
    typeof __CLOUD_CLIENT_ID__ === 'string' &&
    __CLOUD_CLIENT_ID__ !== ''
  );
}
