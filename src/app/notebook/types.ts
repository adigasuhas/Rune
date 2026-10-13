export interface NotebookAttachment {
  id: string;
  pageId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface NotebookPage {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  tags: string[];
  reviewStatus?: string;
  authorId?: string | null;
  author?: { id: string; name: string | null; email: string; avatarUrl?: string | null } | null;
  attachments?: NotebookAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Notebook {
  id: string;
  title: string;
  projectId?: string;
  isPersonal: boolean;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
    color: string;
  } | null;
  page?: NotebookPage | null;
  /** From the library list: a glimpse of the document, not the document. */
  summary?: { updatedAt: string; tags: string[]; excerpt: string } | null;
}

export interface RevisionListItem {
  id: string;
  contentLength: number;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

export interface OutlineEntry {
  offset: number;
  line: number;
  level: number;
  text: string;
}
