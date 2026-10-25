import { t } from '../../../i18n';
import { watchUrl } from '../../../net/client';
import { toast } from '../../../ui/kit';

/** Share a game's watch link: the system share sheet on phones, else the clipboard. */
export async function shareWatchLink(gameId: string): Promise<void> {
  const url = watchUrl(gameId);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Wizard Chess', text: t('Watch my game of Wizard Chess!'), url });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t('Watch link copied.'), { tone: 'success' });
  } catch {
    toast(url);
  }
}
