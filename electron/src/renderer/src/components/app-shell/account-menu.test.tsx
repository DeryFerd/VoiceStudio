import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ bridge: null as unknown, navigate: vi.fn() }));
vi.mock('@/components/bridge', () => ({ getBridge: () => mock.bridge }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mock.navigate }));

import { AccountMenu } from './account-menu';

const signedIn = {
  available: true,
  accountEnabled: true,
  syncEnabled: false,
  prompted: true,
  remembered: true,
  signedIn: true,
  signingIn: false,
  notice: null as string | null,
  plan: null,
  profile: {
    email: 'ana@example.com',
    displayName: 'Ana Lima' as string | null,
    avatarUrl: null as string | null,
    personalOrganizationId: 'Or1',
    organizations: [],
  },
};

function bridgeFor(state: Record<string, unknown>) {
  const account = {
    get: vi.fn(async () => state),
    onState: vi.fn(() => () => {}),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  };
  mock.bridge = { account };
  return account;
}
async function show(state: Record<string, unknown>) {
  const account = bridgeFor(state);
  const view = render(<AccountMenu />);
  await act(async () => {});
  return { ...view, account };
}
afterEach(() => {
  cleanup();
  mock.bridge = null;
  mock.navigate.mockReset();
});

it('signed in: shows only the photo (or initials) and the name', async () => {
  await show(signedIn);
  const trigger = screen.getByRole('button', { name: /Ana Lima/ });
  expect(trigger).toHaveTextContent('ALAna Lima');
  expect(screen.queryByText(/signed_in_as/)).toBeNull();
});

it('shows the uploaded profile photo instead of initials', async () => {
  await show({
    ...signedIn,
    profile: { ...signedIn.profile, avatarUrl: 'data:image/png;base64,AAAA' },
  });
  expect(document.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  expect(screen.queryByText('AL')).toBeNull();
});

it('the menu opens Account settings in the app, or signs out', async () => {
  const { account } = await show(signedIn);
  fireEvent.click(screen.getByRole('button', { name: /Ana Lima/ }));
  fireEvent.click(await screen.findByText('account.menu_settings'));
  expect(mock.navigate).toHaveBeenCalledWith({ to: '/settings/account' });
  fireEvent.click(screen.getByRole('button', { name: /Ana Lima/ }));
  fireEvent.click(await screen.findByText('account.sign_out'));
  expect(account.signOut).toHaveBeenCalled();
});

it('signed out: a Sign in button that starts the browser sign-in', async () => {
  const { account } = await show({ ...signedIn, signedIn: false, profile: null });
  fireEvent.click(screen.getByRole('button', { name: 'account.sign_in' }));
  expect(account.signIn).toHaveBeenCalled();
});

it('while signing in it says to continue in the browser', async () => {
  await show({ ...signedIn, signedIn: false, signingIn: true, profile: null });
  expect(screen.getByRole('button', { name: 'account.continue_in_browser' })).toBeDisabled();
});

it.each([
  ['account features off', { ...signedIn, accountEnabled: false }],
  ['the build has no accounts', { ...signedIn, available: false }],
])('shows nothing when %s', async (_name, state) => {
  const { container } = await show(state);
  expect(container).toBeEmptyDOMElement();
});
