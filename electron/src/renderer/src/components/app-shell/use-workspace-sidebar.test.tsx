import { renderHook, act } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  path: '/stories',
  narrow: true,
  layout: {
    libraryOpen: true,
    expandedLibraryContext: null as string | null,
    autoCollapseSidebar: true,
  },
}));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: any) => select({ location: { pathname: state.path } }),
}));
vi.mock('@/lib/store/workspace', () => ({
  useWorkspace: () => state.layout,
  setWorkspace: (patch: object) => {
    Object.assign(state.layout, patch);
  },
}));
import { useWorkspaceSidebarState } from './use-workspace-sidebar';
beforeEach(() => {
  state.path = '/stories';
  state.narrow = true;
  state.layout = { libraryOpen: true, expandedLibraryContext: null, autoCollapseSidebar: true };
  vi.stubGlobal('matchMedia', () => ({
    matches: state.narrow,
    addEventListener() {},
    removeEventListener() {},
  }));
});
it('expands an automatically collapsed sidebar even when libraryOpen is already true', () => {
  const { result, rerender } = renderHook(useWorkspaceSidebarState);
  expect(result.current.compact).toBe(true);
  act(() => result.current.setOpen(true));
  rerender();
  expect(result.current.compact).toBe(false);
  act(() => result.current.setOpen(false));
  rerender();
  expect(result.current.compact).toBe(true);
});
it('does not carry a forced expansion to another workspace', () => {
  const { result, rerender } = renderHook(useWorkspaceSidebarState);
  act(() => result.current.setOpen(true));
  rerender();
  state.path = '/gallery';
  rerender();
  expect(result.current.compact).toBe(true);
});
it('uses the icon rail beside a section pane, including the Clone and Home library', () => {
  state.narrow = false;
  for (const path of ['/clone', '/', '/design']) {
    state.path = path;
    const { result } = renderHook(useWorkspaceSidebarState);
    expect(result.current.compact, path).toBe(true);
  }
  state.layout.autoCollapseSidebar = false;
  state.path = '/clone';
  expect(renderHook(useWorkspaceSidebarState).result.current.compact).toBe(false);
});
it('keeps the full navigation where a page has no pane of its own and syncs explicit collapse', () => {
  state.path = '/integrations';
  state.narrow = false;
  const { result, rerender } = renderHook(useWorkspaceSidebarState);
  expect(result.current.compact).toBe(false);
  act(() => result.current.setOpen(false));
  rerender();
  expect(result.current.compact).toBe(true);
});

it('keeps the full sidebar on a secondary workspace when auto-collapse is off', () => {
  state.layout.autoCollapseSidebar = false;
  const { result, rerender } = renderHook(useWorkspaceSidebarState);
  expect(result.current.compact).toBe(false);
  state.path = '/projects';
  rerender();
  expect(result.current.compact).toBe(false);
  // The library no longer lives in the navigation column, so there is no duplicate to hide.
  state.path = '/personas';
  rerender();
  expect(result.current.compact).toBe(false);
  // The explicit close still works.
  state.path = '/tools';
  act(() => result.current.setOpen(false));
  rerender();
  expect(result.current.compact).toBe(true);
});
