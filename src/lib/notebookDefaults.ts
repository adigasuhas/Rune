import { db } from './db';
import { buildDefaultSectionContent } from './notebookSections';

export { DEFAULT_PROJECT_SECTIONS, buildDefaultSectionContent } from './notebookSections';

/**
 * Seeds a brand-new project notebook's single document with the default
 * section skeleton. Shared by the two notebook-creation paths
 * (`POST /api/notebooks` and `POST /api/projects/[id]/notebook`) so they
 * can't drift apart.
 */
export async function seedProjectNotebookSections(notebookId: string, authorId: string): Promise<void> {
  await db.notebookPage.create({
    data: {
      notebookId,
      title: 'Notebook',
      content: buildDefaultSectionContent(),
      tags: [],
      authorId
    }
  });
}
