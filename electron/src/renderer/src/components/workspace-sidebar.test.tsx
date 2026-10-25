import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FilmIcon } from 'lucide-react';
import { MAC_TRAFFIC_LIGHTS_INLINE_END } from '@shared/utils/windowChrome';
import { SecondarySidebar } from './workspace-sidebar';

const platform = vi.hoisted(() => ({ mac: false }));
vi.mock('@/components/bridge', () => ({ isMac: () => platform.mac }));
vi.mock('@/hooks/use-window-fullscreen', () => ({ useWindowFullscreen: () => false }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('allows a 40% wider spacious pane and restores the saved width on remount', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const pane = (
    <SecondarySidebar title="Dub" icon={FilmIcon} size="spacious">
      <section>Preview</section>
    </SecondarySidebar>
  );
  const first = render(pane);
  const separator = screen.getByRole('separator');
  expect(separator).toHaveAttribute('aria-valuemax', '750');
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(separator).toHaveAttribute('aria-valuenow', '436');
  expect(localStorage.getItem('voicestudio.secondary-sidebar.spacious')).toBe('436');
  first.unmount();
  render(pane);
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '436');
});

it('pins a footer outside the scrolling content and reports collapse so a page can re-home it', () => {
  const onCollapsedChange = vi.fn();
  render(
    <SecondarySidebar
      title="Stories"
      icon={FilmIcon}
      footer={<button type="button">Generate</button>}
      onCollapsedChange={onCollapsedChange}
    >
      <section>Setup</section>
    </SecondarySidebar>,
  );
  const footer = document.querySelector('[data-slot="secondary-sidebar-footer"]');
  const content = document.querySelector('[data-slot="secondary-sidebar-content"]');
  expect(footer).not.toBeNull();
  expect(content?.contains(footer)).toBe(false); // never scrolls away with the setup cards
  expect(screen.getByRole('button', { name: 'Generate' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /collapse/i }));
  expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
  expect(document.querySelector('[data-slot="secondary-sidebar-footer"]')).toBeNull();
});

it("switches between a page's controls and its section library, hiding the pinned footer in the library", () => {
  render(
    <SecondarySidebar
      title="Design"
      icon={FilmIcon}
      library={<div>Voices list</div>}
      libraryLabel="Saved voices"
      footer={<button type="button">Generate</button>}
    >
      <section>Controls body</section>
    </SecondarySidebar>,
  );
  expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByText('Voices list')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Saved voices' }));
  expect(screen.getByText('Voices list')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Design' }));
  expect(screen.getByRole('button', { name: 'Generate' })).toBeVisible();
});

it.each([
  ['ltr', 'ArrowRight'],
  ['rtl', 'ArrowLeft'],
])(
  'selects section tabs with the keyboard in %s without discarding controls',
  (direction, forward) => {
    render(
      <SecondarySidebar
        title="Design"
        icon={FilmIcon}
        library={<div>Voices list</div>}
        libraryLabel="Saved voices"
      >
        <input aria-label="Draft" defaultValue="My next voice" />
      </SecondarySidebar>,
    );
    screen.getByRole('tablist').style.direction = direction;
    const controls = screen.getByRole('tab', { name: 'Design' });
    controls.focus();
    fireEvent.keyDown(controls, { key: forward });
    const library = screen.getByRole('tab', { name: 'Saved voices' });
    expect(library).toHaveFocus();
    expect(library).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Voices list')).toBeVisible();
    fireEvent.keyDown(library, { key: 'Home' });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('My next voice');
    expect(controls).toHaveFocus();
  },
);

it('preserves edits in a section library when switching back to the controls', () => {
  render(
    <SecondarySidebar
      title="Stories"
      icon={FilmIcon}
      library={<input aria-label="Project name" defaultValue="Draft" />}
      libraryLabel="Projects"
    >
      <section>Controls</section>
    </SecondarySidebar>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), {
    target: { value: 'My story' },
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Stories' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
  expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('My story');
});

it('reports a retained library as inactive when its tab is hidden', () => {
  render(
    <SecondarySidebar
      title="Dub"
      icon={FilmIcon}
      library={(active) => <input aria-label="Load active" value={String(active)} readOnly />}
      libraryLabel="Projects"
    >
      <section>Controls</section>
    </SecondarySidebar>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
  const field = screen.getByRole('textbox', { name: 'Load active' });
  expect(field).toHaveValue('true');
  fireEvent.click(screen.getByRole('tab', { name: 'Dub' }));
  expect(field).toHaveValue('false');
  fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
  expect(screen.getByRole('textbox', { name: 'Load active' })).toBe(field);
  expect(field).toHaveValue('true');
});

it('insets its header beside the macOS traffic lights instead of moving it down', () => {
  platform.mac = true;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // The column starts right of a 64px rail, still under the lights' reach.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 64,
  } as DOMRect);
  render(
    <SecondarySidebar title="Voice" icon={FilmIcon}>
      <section>Body</section>
    </SecondarySidebar>,
  );
  const header = document.querySelector<HTMLElement>('[data-slot="secondary-sidebar-header"]')!;
  expect(header.style.paddingTop).toBe('');
  expect(header.style.paddingInlineStart).toBe(`${MAC_TRAFFIC_LIGHTS_INLINE_END - 64 + 12}px`);
  platform.mac = false;
});

it('leaves a column clear of the traffic lights untouched', () => {
  platform.mac = true;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 300,
  } as DOMRect);
  render(
    <SecondarySidebar title="Voice" icon={FilmIcon}>
      <section>Body</section>
    </SecondarySidebar>,
  );
  const header = document.querySelector<HTMLElement>('[data-slot="secondary-sidebar-header"]')!;
  expect(header.style.paddingInlineStart).toBe('');
  platform.mac = false;
});

it('collapses to one expand control, leaving the titlebar row empty', () => {
  render(
    <SecondarySidebar title="Voice" icon={FilmIcon} collapsed onCollapsedChange={vi.fn()}>
      <section>Body</section>
    </SecondarySidebar>,
  );
  const header = document.querySelector<HTMLElement>('[data-slot="secondary-sidebar-header"]')!;
  expect(header.querySelector('button')).toBeNull();
  expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-expanded', 'false');
});
