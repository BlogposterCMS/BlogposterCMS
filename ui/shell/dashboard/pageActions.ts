import {
  createPublicPage,
  errorMessage,
  savePublicLayoutTemplate
} from './pageActionsData.js';
import { bpDialog } from '../../shared/dialogs/bpDialog.js';

interface DashboardActionsWindow extends Window {
  createNewPage?: () => Promise<void>;
  createNewLayout?: () => Promise<void>;
}

export async function createNewPage(): Promise<void> {
  const title = await bpDialog.prompt('New page title:', '', {
    prompt: { label: 'Page title', required: true }
  });
  if (!title) return;
  const slug = await bpDialog.prompt('Slug (optional):', '', {
    prompt: { label: 'Slug', placeholder: 'Optional' }
  }) || '';
  try {
    const pageId = await createPublicPage(window.meltdownEmit, window.ADMIN_TOKEN, title, slug);
    if (pageId) {
      window.location.reload();
    }
  } catch (err) {
    await bpDialog.alert(`Error: ${errorMessage(err)}`);
  }
}

export async function createNewLayout(): Promise<void> {
  const layoutName = await bpDialog.prompt('New layout name:', '', {
    prompt: { label: 'Layout name', required: true }
  });
  if (!layoutName) return;
  try {
    await savePublicLayoutTemplate(window.meltdownEmit, window.ADMIN_TOKEN, layoutName);
    window.location.reload();
  } catch (err) {
    await bpDialog.alert(`Error: ${errorMessage(err)}`);
  }
}

(window as DashboardActionsWindow).createNewPage = createNewPage;
(window as DashboardActionsWindow).createNewLayout = createNewLayout;
