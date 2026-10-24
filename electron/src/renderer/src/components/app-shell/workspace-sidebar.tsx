import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PanelLeftIcon, PanelLeftOpenIcon, SettingsIcon } from 'lucide-react';
import { brandIcon, brandArtwork } from '@/lib/brand';
import { appVersion, isMac } from '@/components/bridge';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePaneResize } from '@/hooks/use-pane-resize';
import { useWindowFullscreen } from '@/hooks/use-window-fullscreen';
import { useWorkspace } from '@/lib/store/workspace';
import { useWorkspaceSidebarState } from './use-workspace-sidebar';
import { WorkspaceNavigation } from './workspace-menu';
import { StatusBar } from './status-bar';

export function versionTranslationKey(development: boolean) {
  return development ? ('app.version_dev' as const) : ('app.version' as const);
}

export function WorkspaceSidebar() {
  const { t } = useTranslation();
  const mac = isMac();
  // Fullscreen hides the traffic lights, so their reserved corner is given back to the brand.
  const trafficLights = mac && !useWindowFullscreen();
  const versionLabel = t(versionTranslationKey(import.meta.env.DEV), {
    version: appVersion(),
  });
  const { libraryOpen } = useWorkspace();
  // One source of truth for "rail or full sidebar": the header toggle and the
  // sidebar's own buttons used to keep separate copies of this state.
  const { compact, compactViewport, forceExpanded, secondaryWorkspace, setOpen } =
    useWorkspaceSidebarState();
  const sidebarResize = usePaneResize({
    storageKey: 'voicestudio.nav-width',
    side: 'left',
    minimum: 196,
    initial: 216,
    maximum: 288,
    reserve: compactViewport && secondaryWorkspace && forceExpanded ? 520 : 640,
    enabled: libraryOpen,
  });
  return (
    <>
      {compact && (
        <aside
          aria-label={t('clone.saved_profiles')}
          data-slot="compact-main-sidebar"
          onDoubleClick={() => setOpen(true)}
          className={cn(
            'brand-sidebar relative isolate grid h-dvh min-h-0 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden bg-sidebar',
            mac ? 'w-16' : 'w-12 border-r border-border/50',
          )}
        >
          {mac && (
            <span
              aria-hidden="true"
              data-slot="compact-sidebar-divider"
              className={cn(
                'pointer-events-none absolute right-0 bottom-0 w-px bg-border/50',
                trafficLights ? 'top-[72px]' : 'top-12',
              )}
            />
          )}
          <div
            className={cn(
              'workspace-titlebar flex shrink-0 justify-center',
              trafficLights ? 'min-h-[72px] items-end pb-1' : 'h-12 items-center',
            )}
          >
            {/* The rail can always reopen itself, on every platform: the
                brand icon alone gave Windows/Linux no local control. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('clone.toggle_sidebar')}
              aria-expanded={false}
              onClick={() => setOpen(true)}
              className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {mac ? (
                <PanelLeftOpenIcon className="size-5" aria-hidden="true" />
              ) : (
                <img src={brandIcon} alt="" className="size-6 shrink-0" />
              )}
            </Button>
          </div>
          <WorkspaceNavigation compact />
          {!mac && <StatusBar compact />}
          <div
            className={cn(
              'shrink-0 border-t border-border/50 py-2',
              mac ? 'grid grid-cols-2 items-center gap-1 px-1' : 'flex flex-col items-center gap-1',
            )}
          >
            <Link
              to="/settings"
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
              className={cn(
                buttonVariants({
                  variant: 'ghost',
                  size: mac ? 'icon-xs' : 'icon-sm',
                }),
                'workspace-nav-item',
              )}
            >
              <SettingsIcon
                className="workspace-nav-icon"
                data-tone="settings"
                data-motion="turn"
              />
            </Link>
            {mac && <StatusBar compact inline />}
          </div>
        </aside>
      )}
      {libraryOpen && !compact && (
        <aside
          ref={sidebarResize.host}
          style={{ width: sidebarResize.width }}
          aria-label={t('app.name')}
          className="brand-sidebar relative isolate grid h-full min-h-0 min-w-0 shrink-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-r border-border/50 bg-sidebar"
        >
          <img
            src={brandArtwork}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 w-full object-cover object-right opacity-25 [mask-image:linear-gradient(black,transparent)] dark:opacity-40"
          />
          <header
            className={cn(
              'workspace-titlebar flex shrink-0 gap-2 px-3',
              // The traffic lights get their own row above the brand, so the narrow
              // column never has to reserve their width beside the wordmark.
              trafficLights ? 'min-h-[72px] items-end pb-2' : 'items-center',
            )}
          >
            <Link
              to="/"
              aria-label={`${t('app.name')} ${versionLabel}`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img src={brandIcon} alt="" className="size-6 shrink-0" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-base font-semibold">{t('app.name')}</span>
                <span className="text-[11px] leading-none text-muted-foreground tabular-nums">
                  {versionLabel}
                </span>
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('common.close')}
              onClick={() => setOpen(false)}
            >
              <PanelLeftIcon />
            </Button>
          </header>
          <div
            {...sidebarResize.separatorProps}
            aria-label={t('app.name')}
            className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none outline-none hover:bg-primary/15 focus-visible:bg-primary/30"
          />
          {/* Navigation first, like the compact rail: it stays at a fixed
              position under the header instead of riding the library's height. */}
          <div className="min-h-0 min-w-0 overflow-y-auto">
            <WorkspaceNavigation />
          </div>
          <div className="flex min-w-0 shrink-0 flex-col border-t border-border/50">
            <StatusBar
              footerLeading={
                mac ? (
                  <Link
                    to="/settings"
                    aria-label={t('nav.settings')}
                    title={t('nav.settings')}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                      'workspace-nav-item',
                    )}
                  >
                    <SettingsIcon
                      className="workspace-nav-icon"
                      data-tone="settings"
                      data-motion="turn"
                    />
                  </Link>
                ) : undefined
              }
            />
            {!mac && (
              <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2">
                <Link
                  to="/settings"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'workspace-nav-item',
                  )}
                >
                  <SettingsIcon
                    className="workspace-nav-icon"
                    data-tone="settings"
                    data-motion="turn"
                  />
                  {t('nav.settings')}
                </Link>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
