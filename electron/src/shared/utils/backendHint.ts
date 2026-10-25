/**
 * backendHint - turns a raw backend failure message into the localized,
 * actionable advice that goes with it.
 *
 * `BackendStatus.message` is raw technical text assembled in the main process
 * from OS errors and process output, so it stays English and verbatim (it is
 * also what a bug report quotes). The advice a user can act on, though, must
 * not: "spawn UNKNOWN" means nothing to most people, and the three recurring
 * Windows startup reports - a launch the OS refused (#2440), a backend still
 * booting on a slow no-GPU host when the wait ran out (#2445), and a checkout
 * inside a synced folder (#2465) - each have one fix that the raw text never
 * names. This maps the stable shapes of those messages to i18n keys; anything
 * it does not recognise yields no hint rather than a wrong one.
 */

import { isNativeFaultExit } from './nativeExit';

export type BackendHintKey =
  | 'backend.hint_spawn_blocked'
  | 'backend.hint_smart_app_control'
  | 'backend.hint_slow_start'
  | 'backend.hint_synced_folder';

/** Cloud-sync clients whose placeholders / locks break a Python environment. */
const SYNCED_FOLDER =
  /(^|[\\/])(onedrive(\s+-\s+[^\\/]+)?|dropbox|icloud\s*drive|google\s*drive|nextcloud)([\\/]|$)/i;

/** True when the text names a path inside a cloud-synced folder. */
export function inSyncedFolder(text: string): boolean {
  return SYNCED_FOLDER.test(text);
}

/**
 * The hints that apply to a failed-backend message, most specific first.
 * Never throws; an empty list means "show the message alone".
 */
export function backendFailureHints(message: string | undefined): BackendHintKey[] {
  if (!message) return [];
  const hints: BackendHintKey[] = [];
  // The OS refused to run the program: libuv reports a blocked executable on
  // Windows as the bare `spawn UNKNOWN`, and EPERM/EACCES elsewhere.
  if (/\bCould not start\b.*\b(spawn UNKNOWN|UNKNOWN|EPERM|EACCES)\b/s.test(message)) {
    // Smart App Control has no exclusions, so the antivirus advice would send the user nowhere.
    hints.push(
      /Smart App Control/.test(message)
        ? 'backend.hint_smart_app_control'
        : 'backend.hint_spawn_blocked',
    );
  }
  // The readiness wait ran out on a launch that was not obviously dead.
  if (/did not answer on port \d+ within \d+ s/.test(message)) {
    hints.push('backend.hint_slow_start');
  }
  if (inSyncedFolder(message)) hints.push('backend.hint_synced_folder');
  return hints;
}

/** The one named reason a local engine start failed. */
export type BackendCause =
  | 'smart_app_control'
  | 'spawn_blocked'
  | 'native_crash'
  | 'missing_env'
  | 'permission'
  | 'synced_folder'
  | 'slow_start';

/** The single primary action that fixes (or best diagnoses) each cause. */
export type BackendCauseAction = 'retry' | 'choose_folder' | 'copy_diagnostics';

export const BACKEND_CAUSE_ACTION: Record<BackendCause, BackendCauseAction> = {
  smart_app_control: 'retry',
  spawn_blocked: 'retry',
  native_crash: 'copy_diagnostics',
  missing_env: 'choose_folder',
  permission: 'choose_folder',
  synced_folder: 'choose_folder',
  slow_start: 'retry',
};

/**
 * Collapses a failed-backend message into ONE named cause, most specific
 * first, or null when nothing is recognised (the raw message is then shown
 * alone with Retry). Covers `spawn UNKNOWN`, a missing Python environment, a
 * native crash such as exit code 3221225477 (0xC0000005), and EPERM/EACCES.
 */
export function backendFailureCause(message: string | undefined): BackendCause | null {
  if (!message) return null;
  if (/\bCould not start\b.*\b(spawn UNKNOWN|UNKNOWN|EPERM|EACCES)\b/s.test(message)) {
    return /Smart App Control/.test(message) ? 'smart_app_control' : 'spawn_blocked';
  }
  if (inSyncedFolder(message)) return 'synced_folder';
  const code = /exit code (-?\d+)/.exec(message)?.[1];
  const signal = /signal (SIG[A-Z]+)/.exec(message)?.[1];
  if (isNativeFaultExit({ exitCode: code ? Number(code) : null, signal })) return 'native_crash';
  // resolveSpawnPlan: "environment in X is missing (no ...)" / "is incomplete: ...".
  if (/Python environment\b.*\b(is missing|is incomplete|missing or incomplete)\b/is.test(message))
    return 'missing_env';
  if (/\b(EPERM|EACCES|permission denied|access is denied)\b/i.test(message)) return 'permission';
  if (/did not answer on port \d+ within \d+ s/.test(message)) return 'slow_start';
  return null;
}
