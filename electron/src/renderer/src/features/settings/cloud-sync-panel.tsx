import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { apiJson } from '@/lib/api/client';
import { SettingsRow } from './settings-layout';

type ChoiceKey = 'settings' | 'shortcuts' | 'favorites';
const CHOICES: ChoiceKey[] = ['settings', 'shortcuts', 'favorites'];
/** Later collections, shown locked or paused as the server lists them (guide §3). */
const LATER: Record<string, string> = {
  voices: 'cloudsync.voices',
  takes: 'cloudsync.takes',
  pronunciation: 'cloudsync.projects',
  'dub-projects': 'cloudsync.dub_projects',
  transcriptions: 'cloudsync.dictation_history',
};

interface Collection {
  name: string;
  entitled: boolean;
  enabled: boolean;
}
interface SyncView {
  enabled: boolean;
  device_id: string | null;
  choices: Record<ChoiceKey, boolean>;
  collections: Collection[];
  usage: {
    used_bytes?: number;
    limit_bytes?: number;
    collections?: Array<{ name: string; items: number; bytes: number }>;
  };
  other_devices: Array<{ device_id: string; choices: Record<string, unknown> }>;
  status: {
    conflicts: Array<{ collection: string; item_id: string; keys: string[] }>;
    needs_update: string[];
    paused: Record<string, string>;
    storage_full: boolean;
    offline: boolean;
    stopped: string | null;
    pending_mass_delete: { count: number } | null;
  };
}
interface Device {
  id: string;
  name: string;
  platform: string;
  os_version?: string;
  current?: boolean;
  last_seen_at?: string;
}

const STATUS_KEY = ['cloud-sync-status'];

function size(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Settings → Account → Sync: what this device syncs, its devices, and what went wrong. */
export function CloudSyncPanel() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: ({ signal }) => apiJson<SyncView>('/api/cloud-sync/status', { signal }),
    refetchInterval: 5000,
  });
  const view = status.data;
  const devices = useQuery({
    queryKey: ['cloud-sync-devices'],
    queryFn: ({ signal }) => apiJson<{ devices: Device[] }>('/api/cloud-sync/devices', { signal }),
    enabled: Boolean(view?.enabled && !view.status.stopped),
  });
  const [draft, setDraft] = useState<Record<ChoiceKey, boolean>>({
    settings: true,
    shortcuts: false,
    favorites: false,
  });
  const [turningOff, setTurningOff] = useState<ChoiceKey | null>(null);
  const [failed, setFailed] = useState(false);

  const act = async (path: string, body?: unknown, method = 'POST') => {
    setFailed(false);
    try {
      const next = await apiJson<SyncView>(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (next && 'enabled' in next) client.setQueryData(STATUS_KEY, next);
      await client.invalidateQueries({ queryKey: STATUS_KEY });
      await client.invalidateQueries({ queryKey: ['cloud-sync-devices'] });
    } catch {
      setFailed(true);
    }
  };

  if (status.isError)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('cloudsync.unavailable')}
      </p>
    );
  if (!view) return null;

  if (!view.enabled)
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{t('cloudsync.choose')}</p>
        {CHOICES.map((key) => (
          <SettingsRow key={key} id={`sync-${key}`} title={t(`cloudsync.${key}`)}>
            <Switch
              aria-label={t(`cloudsync.${key}`)}
              checked={draft[key]}
              onCheckedChange={(on) => setDraft({ ...draft, [key]: on })}
            />
          </SettingsRow>
        ))}
        <Button
          variant="outline"
          onClick={() => void act('/api/cloud-sync/on', { choices: draft })}
        >
          {t('cloudsync.turn_on')}
        </Button>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t('common.error')}
          </p>
        )}
      </div>
    );

  const stopped = view.status.stopped;
  const usageOf = (name: string) => view.usage.collections?.find((c) => c.name === name);
  const listed = (name: string) => view.collections.find((c) => c.name === name);
  const setChoice = (key: ChoiceKey, on: boolean, remove: boolean) =>
    void act(
      '/api/cloud-sync/choices',
      { choices: { ...view.choices, [key]: on }, remove_from_cloud: remove ? [key] : [] },
      'PUT',
    );
  const nameOf = (id: string) => devices.data?.devices.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="space-y-3">
      {stopped === 'device_revoked' && (
        <div role="alert" className="space-y-2 text-sm">
          <p>{t('cloudsync.device_revoked')}</p>
          <Button
            variant="outline"
            onClick={() =>
              void act('/api/cloud-sync/on', { choices: view.choices, new_device: true })
            }
          >
            {t('cloudsync.set_up_again')}
          </Button>
        </div>
      )}
      {stopped === 'account_suspended' && (
        <p role="alert" className="text-sm">
          {t('cloudsync.account_suspended')}
        </p>
      )}
      {view.status.storage_full && (
        <p role="alert" className="text-sm">
          {t('cloudsync.storage_full', {
            used: size(view.usage.used_bytes),
            limit: size(view.usage.limit_bytes),
          })}
        </p>
      )}
      {view.status.offline && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('account.offline')}
        </p>
      )}
      {view.status.pending_mass_delete && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {t('cloudsync.mass_delete', { count: view.status.pending_mass_delete.count })}
          </span>
          <Button variant="outline" onClick={() => void act('/api/cloud-sync/confirm-deletes')}>
            {t('cloudsync.confirm_remove')}
          </Button>
        </div>
      )}
      {view.status.conflicts.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('cloudsync.conflict', { keys: view.status.conflicts.at(-1)!.keys.join(', ') })}
        </p>
      )}

      <p className="text-sm font-medium">{t('cloudsync.choose')}</p>
      {CHOICES.map((key) => {
        const server = listed(key);
        const paused = server ? !server.enabled : Boolean(view.status.paused[key]);
        const used = usageOf(key);
        return (
          <SettingsRow
            key={key}
            id={`sync-${key}`}
            title={t(`cloudsync.${key}`)}
            description={
              paused
                ? t('cloudsync.paused')
                : view.status.needs_update.includes(key)
                  ? t('cloudsync.needs_update', { area: t(`cloudsync.${key}`) })
                  : used
                    ? t('cloudsync.size', { size: size(used.bytes) })
                    : undefined
            }
          >
            <Switch
              aria-label={t(`cloudsync.${key}`)}
              checked={view.choices[key]}
              onCheckedChange={(on) => (on ? setChoice(key, true, false) : setTurningOff(key))}
            />
          </SettingsRow>
        );
      })}
      {turningOff && (
        <div role="dialog" className="space-y-2 rounded-md border p-3 text-sm">
          <p>{t('cloudsync.turned_off_prompt', { area: t(`cloudsync.${turningOff}`) })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setChoice(turningOff, false, false);
                setTurningOff(null);
              }}
            >
              {t('cloudsync.keep_in_cloud')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setChoice(turningOff, false, true);
                setTurningOff(null);
              }}
            >
              {t('cloudsync.remove_from_cloud', {
                count: usageOf(turningOff)?.items ?? 0,
                size: size(usageOf(turningOff)?.bytes),
              })}
            </Button>
          </div>
        </div>
      )}
      {view.collections
        .filter((c) => LATER[c.name])
        .map((c) => (
          <SettingsRow
            key={c.name}
            id={`sync-${c.name}`}
            title={t(LATER[c.name])}
            description={
              !c.entitled ? t('cloudsync.pro') : !c.enabled ? t('cloudsync.paused') : undefined
            }
          >
            <Switch aria-label={t(LATER[c.name])} checked={false} disabled />
          </SettingsRow>
        ))}

      {view.other_devices.map((other) => (
        <Button
          key={other.device_id}
          variant="ghost"
          onClick={() => void act(`/api/cloud-sync/use-choices-of/${other.device_id}`)}
        >
          {t('cloudsync.use_choices_of', { device: nameOf(other.device_id) })}
        </Button>
      ))}

      {(devices.data?.devices.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('cloudsync.devices')}</p>
          {devices.data!.devices.map((device) => {
            const here = device.current || device.id === view.device_id;
            const details = [
              device.os_version || device.platform,
              device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString() : null,
            ].filter(Boolean);
            return (
              <div key={device.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    {device.name}
                    {here && (
                      <span className="text-muted-foreground"> · {t('cloudsync.this_device')}</span>
                    )}
                  </span>
                  {details.length > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {details.join(' · ')}
                    </span>
                  )}
                </span>
                {/* This device leaves sync by switching it off; Remove is for the others. */}
                {!here && (
                  <Button
                    variant="ghost"
                    onClick={() => void act(`/api/cloud-sync/devices/${device.id}/revoke`)}
                  >
                    {t('cloudsync.remove_device')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('common.error')}
        </p>
      )}
    </div>
  );
}
