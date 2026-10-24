import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// The main navigation sits directly under the sidebar header, above the voice
// library, so its position never depends on how tall the library is.

const route = vi.hoisted(() => ({ pathname: '/clone' }));
const sidebar = vi.hoisted(() => ({ compact: false, setOpen: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: any) => select({ location: route }),
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: string }) =>
      key === 'app.version_dev'
        ? `v${values?.version} · Dev`
        : key === 'app.version'
          ? `v${values?.version}`
          : key,
  }),
}));
vi.mock('@/lib/store/workspace', () => ({
  useWorkspace: () => ({ libraryOpen: true, libraryTab: 'voices' }),
  setWorkspace: vi.fn(),
}));
vi.mock('@/components/bridge', () => ({ appVersion: () => '0.5.7', isMac: () => false }));
vi.mock('@/lib/brand', () => ({ brandIcon: 'icon.png', brandArtwork: 'art.png' }));
vi.mock('@/hooks/use-pane-resize', () => ({
  usePaneResize: () => ({ host: { current: null }, width: 280, separatorProps: {} }),
}));
vi.mock('@/hooks/use-backend-status', () => ({ useBackendStatus: () => ({ stage: 'ready' }) }));
vi.mock('@/features/clone/voices-sidebar', () => ({
  VoicesSidebar: () => <div data-testid="library" />,
}));
vi.mock('./workspace-menu', () => ({
  WorkspaceNavigation: () => <nav data-testid="navigation" />,
}));
vi.mock('./status-bar', () => ({ StatusBar: () => <div data-testid="status" /> }));
vi.mock('./system-notifications', () => ({ SystemNotifications: () => null }));

vi.mock('./use-workspace-sidebar', () => ({
  useWorkspaceSidebarState: () => ({
    compact: sidebar.compact,
    compactViewport: false,
    forceExpanded: false,
    secondaryWorkspace: false,
    setOpen: sidebar.setOpen,
  }),
}));
import { versionTranslationKey, WorkspaceSidebar } from './workspace-sidebar';

beforeEach(() => {
  sidebar.compact = false;
  sidebar.setOpen.mockClear();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

it('expands the compact rail on double-click without changing single-click navigation', () => {
  sidebar.compact = true;
  render(<WorkspaceSidebar />);
  const rail = screen.getByRole('complementary', { name: 'clone.saved_profiles' });
  fireEvent.click(rail);
  expect(sidebar.setOpen).not.toHaveBeenCalled();
  fireEvent.doubleClick(rail);
  expect(sidebar.setOpen).toHaveBeenCalledWith(true);
});

it('keeps only navigation and status in the slim expanded sidebar', () => {
  render(<WorkspaceSidebar />);
  const navigation = screen.getByTestId('navigation');
  const status = screen.getByTestId('status');
  expect(navigation.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // The saved voices and takes live in the section's own secondary sidebar.
  expect(screen.queryByTestId('library')).toBeNull();
});

it('shows the app version beneath the brand name in the expanded sidebar', () => {
  render(<WorkspaceSidebar />);
  const brand = screen.getByRole('link', { name: 'app.name v0.5.7 · Dev' });
  expect(brand).toHaveTextContent('app.name');
  expect(brand).toHaveTextContent('v0.5.7 · Dev');
});

it('uses the plain version label outside development builds', () => {
  expect(versionTranslationKey(true)).toBe('app.version_dev');
  expect(versionTranslationKey(false)).toBe('app.version');
});

