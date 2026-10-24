import { useEffect, useState } from 'react';
import { getBridge } from '@/components/bridge';
import type { AccountPublicState } from '../../../../preload/index.d';

export function useAccount() {
  const account = getBridge()?.account;
  const [state, setState] = useState<AccountPublicState | undefined>();
  useEffect(() => {
    if (!account) return;
    let live = true;
    void account
      .get()
      .then((s) => live && setState(s))
      .catch(() => {});
    const off = account.onState((s) => live && setState(s));
    return () => {
      live = false;
      off();
    };
  }, [account]);
  return {
    supported: Boolean(account),
    state,
    setSwitches: async (p: { accountEnabled?: boolean; syncEnabled?: boolean }) => {
      if (!account) return;
      try {
        setState(await account.setSwitches(p));
      } catch {
        // Main applies the change for this run even when saving fails; show what is real.
        setState(await account.get().catch(() => undefined));
      }
    },
    /** Ask main again (e.g. Retry after the account details failed to load). */
    refresh: async () => {
      if (!account) return;
      setState(await account.get().catch(() => undefined));
    },
    signIn: () => account?.signIn(),
    cancelSignIn: () => account?.cancelSignIn(),
    signOut: () => account?.signOut(),
  };
}
