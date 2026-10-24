import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson, describeError } from '@/lib/api/client';
import { TERMINAL_MODEL_INSTALL_STATES, useModelInstallJobs } from '@/hooks/use-model-install-sync';

/**
 * One-click install of the speech-to-text model the backend recommended for
 * this machine, through the existing install job. Nothing downloads until
 * `start` is called; `onInstalled` fires once the job finishes.
 */
export function useReferenceAsrInstall(repoId: string | undefined, onInstalled: () => void) {
  const client = useQueryClient();
  const jobs = useModelInstallJobs();
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(false);
  const job = jobs.data?.jobs.find((item) => item.repo_id === repoId);
  const progress =
    job?.total_bytes && job.total_bytes > 0
      ? Math.min(100, Math.round(((job.bytes_done ?? 0) / job.total_bytes) * 100))
      : null;

  useEffect(() => {
    if (!active || !jobs.data) return;
    if (job && !TERMINAL_MODEL_INSTALL_STATES.has(job.state)) {
      seen.current = true;
      return;
    }
    if (!seen.current && !job) return;
    const failed = job && job.state !== 'done';
    setActive(false);
    seen.current = false;
    if (failed) {
      setError(job.error || job.state);
      return;
    }
    void client.invalidateQueries({ queryKey: ['model-catalogue'] }).catch(() => undefined);
    onInstalled();
  }, [active, client, job, jobs.data, onInstalled]);

  const start = async () => {
    if (!repoId || active) return;
    setError(null);
    seen.current = false;
    setActive(true);
    try {
      await apiJson('/models/install', {
        method: 'POST',
        body: JSON.stringify({ repo_id: repoId }),
      });
      await client.invalidateQueries({ queryKey: ['model-install-jobs'] });
    } catch (e) {
      setActive(false);
      setError(describeError(e));
    }
  };
  return { start, installing: active, progress, error };
}
