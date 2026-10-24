import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresetVoicePicker } from './preset-voice-picker';
import { cloneSettingsStore, DEFAULT_CLONE_SETTINGS } from '@/lib/store/clone-settings';

const engine = vi.hoisted(() => ({
  active: null as { preset_voices?: string[]; default_voice?: string | null } | null,
}));
vi.mock('@/hooks/use-engines', () => ({ useEngines: () => ({ activeTts: engine.active }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => cloneSettingsStore.setState(() => ({ ...DEFAULT_CLONE_SETTINGS })));
afterEach(cleanup);

it('lists the engine presets and stores the pick (#2938)', () => {
  engine.active = { preset_voices: ['M1', 'F3'], default_voice: 'M1' };
  render(<PresetVoicePicker />);
  const select = screen.getByRole('combobox', { name: 'presetVoice.label' }) as HTMLSelectElement;
  expect(select.value).toBe('M1');
  expect([...select.options].map((o) => o.value)).toEqual(['M1', 'F3']);
  fireEvent.change(select, { target: { value: 'F3' } });
  expect(cloneSettingsStore.state.presetVoice).toBe('F3');
});

it('renders nothing for engines without presets', () => {
  engine.active = { preset_voices: [] };
  const { container } = render(<PresetVoicePicker />);
  expect(container).toBeEmptyDOMElement();
});
