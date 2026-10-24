import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, LoaderCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiJson, describeError } from '@/lib/api/client';
import { router } from '@/router';

interface RecommendedModel {
  repo_id: string;
  role: string;
  installed: boolean;
}

/**
 * Offered beside the "reference transcription needs a speech-to-text model"
 * error so the fix is one click instead of a hunt through the Model Catalogue
 * (#2929, #2678). Starts the download of the first speech-to-text model the
 * host's curated preset lists; with nothing left to install it opens the
 * catalogue, where a model can be selected.
 */
export function InstallSttButton() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const install = async () => {
    setBusy(true);
    try {
      const { models } = await apiJson<{ models: RecommendedModel[] }>('/setup/recommendations');
      const missing = models.find(
        (model) => model.role.toLowerCase() === 'asr' && !model.installed,
      );
      if (!missing) {
        await router.navigate({ to: '/settings/models' });
        return;
      }
      await apiJson('/models/install', {
        method: 'POST',
        body: JSON.stringify({ repo_id: missing.repo_id }),
      });
      await client.invalidateQueries({ queryKey: ['model-install-jobs'] });
      toast.success(t('models.started_downloading', { count: 1 }));
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" size="sm" disabled={busy} onClick={() => void install()}>
      {busy ? (
        <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
      ) : (
        <DownloadIcon />
      )}
      {t('tts_errors.install_speech_model')}
    </Button>
  );
}
