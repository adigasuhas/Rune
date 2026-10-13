'use client';

import { LoadError } from '@/components/LoadError';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MATH_SYMBOLS } from '@/lib/mathSymbols';
import katex from 'katex';
import { PROJECT_COLORS } from '@/lib/colors';
import { NOTEBOOK_TEMPLATES, NotebookTemplate } from '@/lib/latex/templates';
import { DEFAULT_PROJECT_SECTIONS } from '@/lib/notebookSections';
import { parseMarkdownToHtml, stripPageMetadata } from '@/lib/notebookExport';
import { extractBibliographyContent, parseBibtex } from '@/lib/latex/bibliography';
import { buildLabelMap } from '@/lib/latex/crossref';
import { LatexEditor, LatexEditorHandle, SpecialKey } from '@/components/LatexEditor';
import { detectAutocompleteTrigger, filterAutocompleteItems } from '@/lib/latex/autocompleteTrigger';
import { LatexAutocomplete, LatexAutocompleteItem } from '@/components/LatexAutocomplete';
import ColorPickerPopover from '@/components/ColorPickerPopover';
import { DictationButton } from '@/components/DictationButton';
import { useConfirm } from '@/components/ConfirmDialog';
import { useNotifications } from '@/context/NotificationContext';
import { useNotebookDirty } from '@/context/NotebookDirtyContext';
import type { Notebook, NotebookPage, RevisionListItem, OutlineEntry } from './types';
import { getNotebookColor, hexToRgba, downloadPdfBlob, computeOutline, computeEquationsList, computeReferencesList } from './notebookHelpers';
import {
  BookOpen,
  FolderGit2,
  User,
  Plus,
  Search,
  Trash2,
  Download,
  Check,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Table,
  Link2,
  FileImage,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  FileDown,
  Edit2,
  Quote,
  Strikethrough,
  Code,
  RefreshCw,
  Sigma,
  Palette,
  Highlighter,
  MessageSquare,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  History,
  Command,
  Layers,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Button, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { NotebookCommentsPanel } from '@/components/NotebookCommentsPanel';

// Every environment src/lib/latex/environments.ts actually renders - offered
// by \begin{ autocomplete so typing one never produces dead LaTeX the
// renderer doesn't know what to do with.
const ENVIRONMENT_ITEMS: LatexAutocompleteItem[] = [
  { key: 'equation', label: 'Numbered equation' },
  { key: 'equation*', label: 'Unnumbered equation' },
  { key: 'align', label: 'Aligned equations, numbered' },
  { key: 'align*', label: 'Aligned equations, unnumbered' },
  { key: 'gather', label: 'Stacked equations, numbered' },
  { key: 'gather*', label: 'Stacked equations, unnumbered' },
  { key: 'cases', label: 'Piecewise definition' },
  { key: 'matrix', label: 'Matrix, no brackets' },
  { key: 'pmatrix', label: 'Matrix, parentheses' },
  { key: 'figure', label: 'Figure with caption' },
  { key: 'figure*', label: 'Full-width figure' },
  { key: 'table', label: 'Table with caption' },
  { key: 'table*', label: 'Full-width table' },
  { key: 'tabular', label: 'Tabular grid' },
  { key: 'itemize', label: 'Bulleted list' },
  { key: 'enumerate', label: 'Numbered list' },
  { key: 'description', label: 'Term/description list' },
  { key: 'quote', label: 'Block quote' },
  { key: 'verbatim', label: 'Preformatted text' },
  { key: 'abstract', label: 'Abstract block' },
];


function KatexRender({ latex, block = true }: { latex: string; block?: boolean }) {
  const containerRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(latex, containerRef.current, {
          displayMode: block,
          throwOnError: false
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, [latex, block]);
  return <span ref={containerRef} />;
}

/** When a notebook was last written in, from the library summary or the loaded page. */
function editedAt(nb: Notebook): string | null {
  return nb.summary?.updatedAt || nb.page?.updatedAt || null;
}
function relDate(iso: string | null): string {
  if (!iso) return 'Not started';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Edited today';
  if (days === 1) return 'Edited yesterday';
  if (days < 7) return `Edited ${days} days ago`;
  return `Edited ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

/**
 * A notebook drawn as a notebook: a coloured spine, a paper cover with the
 * title set in the serif, and the first line of what's inside. Used for
 * the few most recently edited documents at the top of the library.
 */
function NotebookBook({ notebook, color, onOpen }: { notebook: Notebook; color: string; onOpen: (nb: Notebook) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(notebook)}
      className="nb-book group relative flex h-[210px] w-full flex-col overflow-hidden rounded-[4px_12px_12px_4px] border border-border bg-surface pl-5 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      title={notebook.title}
    >
      <span className="absolute inset-y-0 left-0 w-3" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="absolute inset-y-0 left-3 w-px bg-black/10" aria-hidden="true" />
      <span className="flex flex-1 flex-col p-4 pl-3">
        <span className="text-[12px] text-ink-faint">{notebook.project?.name || 'Personal'}</span>
        <span className="mt-1.5 line-clamp-2 font-serif text-[20px] font-medium leading-tight tracking-[-0.01em] text-foreground">{notebook.title}</span>
        <span className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink-secondary">{notebook.summary?.excerpt || 'Empty so far.'}</span>
        <span className="mt-auto pt-3 text-[12px] text-ink-faint">{relDate(editedAt(notebook))}</span>
      </span>
    </button>
  );
}

export default function NotebookPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useNotifications();
  const { setIsDirty: setNotebookDirty } = useNotebookDirty();

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [activePage, setActivePage] = useState<NotebookPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Library (GoodNotes-style browse): 'library' shows projects as folders
  // and personal notebooks as loose covers; 'editor' is the single-document
  // writing view. Landing on /notebook always opens the library first,
  // unless a deep link says otherwise - opening a specific document is a
  // deliberate act, not the default.
  const [screen, setScreen] = useState<'library' | 'editor'>('library');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [newNotebookLockedProjectId, setNewNotebookLockedProjectId] = useState<string | null>(null);

  // Editor buffer
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('preview');
  const [pageTags, setPageTags] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [savingPage, setSavingPage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Entry metadata rail (right panel): open by default on desktop, hidden
  // on narrower viewports where it would crowd the editor.
  const [showMetadataPanel, setShowMetadataPanel] = useState(true);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Math Symbols and Image Dialog/Modal States
  const [isMathSymbolsOpen, setIsMathSymbolsOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageCaption, setImageCaption] = useState('Caption');
  const [imageLabel, setImageLabel] = useState('fig:image_label');
  const [imageUrl, setImageUrl] = useState('');
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');

  // Modal States
  const [isNewNotebookModalOpen, setIsNewNotebookModalOpen] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [newNotebookProjectId, setNewNotebookProjectId] = useState('');
  const [newNotebookIsPersonal, setNewNotebookIsPersonal] = useState(true);
  const [newNotebookColor, setNewNotebookColor] = useState<string | null>(null);

  // PDF Export
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProfile, setExportProfile] = useState<'full' | 'research' | 'minimal'>('research');
  const [exportTitleFont, setExportTitleFont] = useState<'Raleway' | 'Montserrat' | 'Poppins'>('Raleway');
  const [exportBodyFont, setExportBodyFont] = useState<'Inter' | 'Figtree' | 'Nunito' | 'Lato' | 'Open Sans' | 'JetBrains Mono' | 'Fira Code'>('Figtree');
  const [exportIncludeCover, setExportIncludeCover] = useState(false);
  const [exportIncludeHeader, setExportIncludeHeader] = useState(true);
  const [exportIncludeFooter, setExportIncludeFooter] = useState(true);
  const [exportIncludeSummary, setExportIncludeSummary] = useState(false);

  // Notebook settings modal and color override
  const [editingNotebook, setEditingNotebook] = useState<Notebook | null>(null);
  const [editNotebookTitle, setEditNotebookTitle] = useState('');
  const [editNotebookColor, setEditNotebookColor] = useState<string | null>(null);

  // Sidebar state - notebook switcher + this document's in-text outline.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [outlineFilter, setOutlineFilter] = useState('');
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [customSectionTitle, setCustomSectionTitle] = useState('');
  const addSectionRef = useRef<HTMLDivElement>(null);

  // Version history
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionListItem[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [previewingRevision, setPreviewingRevision] = useState<{ id: string; content: string; createdAt: string } | null>(null);
  const [restoringRevisionId, setRestoringRevisionId] = useState<string | null>(null);

  // Notebook-wide command palette (Ctrl/Cmd+Shift+K)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteActiveIndex, setPaletteActiveIndex] = useState(0);

  // Helper to determine notebook color (custom override or project color)

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<LatexEditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // \cite{ / \ref{ / \eqref{ / \begin{ autocomplete - `queryStart` is the
  // offset the typed-so-far argument begins at (after the last `{` or `,`),
  // so accepting a suggestion only needs to replace [queryStart, cursor).
  const [autocomplete, setAutocomplete] = useState<{
    kind: 'cite' | 'ref' | 'begin' | 'run';
    queryStart: number;
    cursor: number;
    top: number;
    left: number;
    items: LatexAutocompleteItem[];
    activeIndex: number;
  } | null>(null);

  // Review workflow + comments (project-linked notebooks).
  const [showComments, setShowComments] = useState(false);
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<string | null>(null);
  const captureCommentSelection = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 2) setPendingCommentAnchor(sel.slice(0, 400));
  };
  const [pageCommentCount, setPageCommentCount] = useState(0);
  const [pageReviewStatus, setPageReviewStatus] = useState<string>('NONE');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Split-panel resizer states
  const [splitWidth, setSplitWidth] = useState(68);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const [previewTab, setPreviewTab] = useState<'live' | 'equations' | 'references'>('live');

  // Runs (experiments / compute jobs) linked to the open document.
  const [linkedRuns, setLinkedRuns] = useState<Array<{ id: string; name: string; status: string; instrumentName: string | null }>>([]);

  useEffect(() => {
    // "Open Notebook" from a project page hands off where to land via
    // sessionStorage (the project page already created a notebook if the
    // project had none, via POST /api/projects/[id]/notebook, before
    // setting this and navigating here) - same handoff pattern used for
    // tasks/runs. Either a specific notebook to open directly, or (when a
    // project has more than one) its library folder to open expanded.
    let deepLinkNotebookId: string | undefined;
    let deepLinkFolderId: string | undefined;
    try {
      deepLinkNotebookId = sessionStorage.getItem('rune-deep-link-notebook-id') || undefined;
      if (deepLinkNotebookId) sessionStorage.removeItem('rune-deep-link-notebook-id');
      deepLinkFolderId = sessionStorage.getItem('rune-deep-link-project-folder-id') || undefined;
      if (deepLinkFolderId) sessionStorage.removeItem('rune-deep-link-project-folder-id');
    } catch { /* private mode */ }

    if (deepLinkFolderId) setExpandedProjectId(deepLinkFolderId);
    fetchNotebooks(deepLinkNotebookId);
    fetchProjects();
  }, []);

  // Initialize sidebar collapsed state from user preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const collapsed = localStorage.getItem('rune_notebook_sidebar_collapsed') === 'true';
      setIsSidebarCollapsed(collapsed);
    }
  }, []);

  // Responsive behavior: Automatically collapse sidebar on smaller viewports
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        if (window.innerWidth < 768) {
          setIsSidebarCollapsed(true);
        }
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Handle panel split view resizing
  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      const bounded = Math.max(10, Math.min(90, percentage));
      setSplitWidth(bounded);
    };

    const handleMouseUp = () => setIsDraggingSplit(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit]);

  // Close the "Add content" popover on any outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addSectionRef.current && !addSectionRef.current.contains(event.target as Node)) {
        setIsAddSectionOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle clickable references (\run{}) inside the rendered preview
  useEffect(() => {
    const previewEl = previewRef.current;
    if (!previewEl || viewMode === 'edit') return;

    const handleReferenceClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.clickable-reference');
      if (!target) return;
      e.preventDefault();
      const scrollTo = target.getAttribute('data-scroll-to');
      const runId = target.getAttribute('data-run-id');
      if (runId) {
        try { sessionStorage.setItem('rune-deep-link-run-id', runId); } catch { /* private mode */ }
        router.push('/jobs');
      } else if (scrollTo) {
        const el = document.getElementById(scrollTo);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    previewEl.addEventListener('click', handleReferenceClick);
    return () => previewEl.removeEventListener('click', handleReferenceClick);
  }, [viewMode, pageContent, router]);

  // Pull the runs linked to the open document whenever it changes.
  useEffect(() => {
    const pageId = activePage?.id;
    if (!pageId) { setLinkedRuns([]); return; }
    let cancelled = false;
    fetch(`/api/notebook-pages/${pageId}/runs`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setLinkedRuns(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setLinkedRuns([]); });
    return () => { cancelled = true; };
  }, [activePage?.id]);

  // Comment count + review status for the open document (project-linked notebooks).
  const refreshPageReviewMeta = React.useCallback(() => {
    const pageId = activePage?.id;
    const nbId = activeNotebook?.id;
    if (!pageId || !nbId) { setPageCommentCount(0); return; }
    fetch(`/api/notebooks/${nbId}/pages/${pageId}/comments`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => setPageCommentCount(Array.isArray(d) ? d.filter(c => !c.resolved).length : 0))
      .catch(() => {});
  }, [activePage?.id, activeNotebook?.id]);

  useEffect(() => {
    setPageReviewStatus((activePage as any)?.reviewStatus || 'NONE');
    setShowComments(false);
    refreshPageReviewMeta();
  }, [activePage?.id, refreshPageReviewMeta]);

  const setReview = async (status: 'READY' | 'NONE') => {
    if (!activePage || !activeNotebook) return;
    setReviewBusy(true);
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast('Review not updated', d.error || 'Try again.', 'error');
        return;
      }
      setPageReviewStatus(status);
      toast(status === 'READY' ? 'Sent for review' : 'Review request withdrawn', status === 'READY' ? 'Reviewers have been notified.' : 'The document is back to a draft.', 'success');
    } catch {
      toast('Review not updated', 'Check your connection and try again.', 'error');
    } finally {
      setReviewBusy(false);
    }
  };

  // Open Edit Notebook settings
  const handleOpenEditNotebook = (notebook: Notebook) => {
    setEditingNotebook(notebook);
    setEditNotebookTitle(notebook.title);
    setEditNotebookColor(notebook.color || null);
  };

  // Updates the notebooks list (and the open editor, if it's the one being
  // renamed) in place - no reason to touch navigation/screen state for a
  // plain rename, whether it was opened from the library or from inside
  // the editor itself.
  const handleSaveNotebookSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNotebook) return;
    if (!editNotebookTitle.trim()) return;

    try {
      const res = await fetch(`/api/notebooks/${editingNotebook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editNotebookTitle.trim(), color: editNotebookColor })
      });
      if (res.ok) {
        const updated = await res.json();
        setNotebooks(prev => prev.map(nb => nb.id === updated.id ? { ...nb, title: updated.title, color: updated.color } : nb));
        setActiveNotebook(prev => prev && prev.id === updated.id ? { ...prev, title: updated.title, color: updated.color } : prev);
        setEditingNotebook(null);
      }
    } catch (err) {
      console.error('Failed to update notebook settings:', err);
    }
  };

  // Populates the library (every notebook the caller owns, folder-grouped
  // client-side by project). Only enters the editor when a specific
  // notebook id is passed (a deep link, or right after creating one) -
  // landing on /notebook otherwise always shows the library, never
  // auto-opens whatever notebook happened to be first.
  const [loadFailed, setLoadFailed] = useState(false);
  const fetchNotebooks = async (selectNotebookId?: string) => {
    try {
      const res = await fetch('/api/notebooks');
      setLoadFailed(!res.ok);
      if (res.ok) {
        const data = await res.json();
        setNotebooks(data);
        if (selectNotebookId) {
          const target = data.find((n: any) => n.id === selectNotebookId);
          if (target) {
            await handleSelectNotebook(target);
            setScreen('editor');
          }
        }
      }
    } catch (e) {
      setLoadFailed(true);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) setProjects(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectNotebook = async (notebook: Notebook) => {
    if (activeNotebook?.id === notebook.id) return;

    if (isDirty && activePage) {
      const save = await confirm({ title: 'Save your changes first?', message: 'You have unsaved changes in this notebook. Save them before switching?', confirmLabel: 'Save and continue', cancelLabel: 'Continue without saving' });
      if (save) await handleSavePage(false);
    }

    setActiveNotebook(notebook);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}`);
      if (res.ok) {
        const fullNotebook = await res.json();
        setNotebooks(prev => prev.map(nb => nb.id === notebook.id ? fullNotebook : nb));
        setActiveNotebook(fullNotebook);
        if (fullNotebook.page) {
          setActivePage(fullNotebook.page);
          setPageTags(fullNotebook.page.tags ? fullNotebook.page.tags.join(', ') : '');
          setPageContent(stripPageMetadata(fullNotebook.page.content));
        } else {
          setActivePage(null);
          setPageTags('');
          setPageContent('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Opens a notebook cover from the library into the editor - keeps
  // `expandedProjectId` in sync with the notebook's own project so the
  // "My Notebooks" back button returns to the right folder, not the root.
  const openNotebook = async (notebook: Notebook) => {
    setExpandedProjectId(notebook.projectId || null);
    await handleSelectNotebook(notebook);
    setScreen('editor');
  };

  const goToLibrary = () => setScreen('library');

  // Opens the "New Notebook" modal. From the library root this offers the
  // full Personal/Project choice; from inside an already-expanded folder
  // it's locked to that project - creating a second (or third...) notebook
  // there shouldn't require re-picking the project you're already in.
  const openCreateNotebookModal = (lockedProjectId?: string) => {
    setNewNotebookTitle('');
    setNewNotebookColor(null);
    setNewNotebookLockedProjectId(lockedProjectId || null);
    if (lockedProjectId) {
      setNewNotebookIsPersonal(false);
      setNewNotebookProjectId(lockedProjectId);
    } else {
      setNewNotebookIsPersonal(true);
      setNewNotebookProjectId('');
    }
    setIsNewNotebookModalOpen(true);
  };

  // Create Notebook
  const handleCreateNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotebookTitle.trim()) return;

    const projectId = newNotebookLockedProjectId || (newNotebookIsPersonal ? null : newNotebookProjectId);
    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNotebookTitle,
          projectId,
          isPersonal: !projectId,
          color: newNotebookColor
        })
      });

      if (res.ok) {
        const newNb = await res.json();
        setIsNewNotebookModalOpen(false);
        setNewNotebookTitle('');
        setNewNotebookProjectId('');
        setNewNotebookIsPersonal(true);
        setNewNotebookColor(null);
        setNewNotebookLockedProjectId(null);
        setExpandedProjectId(projectId || null);
        await fetchNotebooks(newNb.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Notebook
  const handleDeleteNotebook = async (notebookId: string) => {
    if (!(await confirm({ title: 'Delete this notebook?', message: 'Its document is permanently deleted. You can’t undo this.', confirmLabel: 'Delete notebook', danger: true }))) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeNotebook?.id === notebookId) {
          setActiveNotebook(null);
          setActivePage(null);
          setScreen('library');
        }
        await fetchNotebooks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameNotebook = (notebook: Notebook) => handleOpenEditNotebook(notebook);

  // Save the notebook's single document. `manual` snapshots a version-history
  // entry (Save button / Ctrl+S) - the 3s autosave below does not, so the
  // history stays a meaningful trail of deliberate saves, not every keystroke.
  const handleSavePage = async (manual: boolean) => {
    if (!activeNotebook || !activePage) return;
    setSavingPage(true);

    const tagsArr = pageTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.startsWith('#') ? t.slice(1) : t)
      .filter(Boolean);

    const cleanContent = stripPageMetadata(pageContent);

    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cleanContent, tags: tagsArr })
      });

      if (res.ok) {
        const updated = await res.json();
        setActivePage(updated);
        setActiveNotebook(prev => prev ? { ...prev, page: updated } : prev);
        setNotebooks(prev => prev.map(nb => nb.id === activeNotebook.id ? { ...nb, page: updated } : nb));
        if (manual) {
          fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/revisions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: cleanContent })
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPage(false);
    }
  };

  const isDirty = useMemo(() => {
    if (!activePage) return false;
    const cleanSavedContent = stripPageMetadata(activePage.content);
    const tagsArr = pageTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.startsWith('#') ? t.slice(1) : t)
      .filter(Boolean);
    const savedTags = activePage.tags || [];
    const hasContentChanged = pageContent !== cleanSavedContent;
    const hasTagsChanged = JSON.stringify([...tagsArr].sort()) !== JSON.stringify([...savedTags].sort());
    return hasContentChanged || hasTagsChanged;
  }, [activePage, pageContent, pageTags]);

  const handleSavePageRef = useRef(handleSavePage);
  useEffect(() => {
    handleSavePageRef.current = handleSavePage;
  }, [handleSavePage]);

  useEffect(() => {
    setNotebookDirty(isDirty);
    return () => setNotebookDirty(false);
  }, [isDirty, setNotebookDirty]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Keyboard shortcuts: Ctrl+S to save (with a version snapshot),
  // Ctrl/Cmd+Shift+K for this document's command palette - deliberately
  // NOT plain Ctrl/Cmd+K, which is already the app-wide search/nav palette
  // (`CommandPalette.tsx`, bound globally in the layout); this one is
  // scoped to the open document (jump to a section, insert content,
  // switch notebooks) and must not fight that binding.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !savingPage) handleSavePageRef.current(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen(v => !v);
        setPaletteQuery('');
        setPaletteActiveIndex(0);
      } else if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        setIsHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, savingPage]);

  // Autosave: a few seconds after the writer stops typing, save on their
  // behalf without snapshotting a version - the manual Save button/Ctrl+S
  // above still work too, this just means forgetting to hit Save never
  // loses work.
  useEffect(() => {
    if (!isDirty || savingPage) return;
    const timer = window.setTimeout(() => {
      handleSavePageRef.current(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [isDirty, savingPage, pageContent, pageTags]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('rune_notebook_sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  };

  // Converts a #rrggbb / #rgb hex color into an rgba() string at the given alpha,
  // used for highlight backgrounds so custom colors read as a tint, not a solid block.

  // Toolbar Actions - delegates to LatexEditor's imperative handle.
  const insertTextAtCursor = (before: string, after: string = '') => {
    editorRef.current?.insertAtCursor(before, after);
  };

  // Sources for \cite{ / \ref{ / \eqref{ autocomplete - bibliography keys
  // from the document's references.bib-style block, and \label{} keys
  // within it. The helpers still take a `pages` array (they're shared with
  // the old multi-page model) - a single-element array of the notebook's
  // one document satisfies that contract unchanged.
  const docAsPagesArray = useMemo(() => (activePage ? [activePage] : []), [activePage]);

  const citeItems: LatexAutocompleteItem[] = useMemo(() => {
    const entries = parseBibtex(extractBibliographyContent(docAsPagesArray));
    return Object.values(entries).map((e) => ({
      key: e.key,
      label: [e.fields.author, e.fields.year].filter(Boolean).join(', ') || e.fields.title || ''
    }));
  }, [docAsPagesArray]);

  const refItems: LatexAutocompleteItem[] = useMemo(() => {
    const labelMap = buildLabelMap(docAsPagesArray);
    return Object.entries(labelMap)
      .filter(([key]) => !key.startsWith('page://'))
      .map(([key, info]) => ({ key, label: `${info.type} · ${info.text}` }));
  }, [docAsPagesArray]);

  const runsMap: Record<string, { name: string; status: string }> = useMemo(() => {
    const map: Record<string, { name: string; status: string }> = {};
    for (const r of linkedRuns) map[r.id] = { name: r.name, status: r.status };
    return map;
  }, [linkedRuns]);

  const runItems: LatexAutocompleteItem[] = useMemo(
    () => linkedRuns.map((r) => ({ key: r.id, label: `${r.name} · ${r.status}` })),
    [linkedRuns]
  );

  const handleCursorActivity = (value: string, cursor: number, coords: { top: number; left: number; lineHeight: number }) => {
    const trigger = detectAutocompleteTrigger(value.slice(0, cursor), cursor);
    if (!trigger) { setAutocomplete(null); return; }
    const { kind, queryStart, query } = trigger;
    const pool = kind === 'cite' ? citeItems : kind === 'begin' ? ENVIRONMENT_ITEMS : kind === 'run' ? runItems : refItems;
    const items = filterAutocompleteItems(pool, query);
    if (items.length === 0) { setAutocomplete(null); return; }
    setAutocomplete({ kind, queryStart, cursor, top: coords.top, left: coords.left, items, activeIndex: 0 });
  };

  const applyAutocomplete = (item: LatexAutocompleteItem) => {
    if (!autocomplete) return;
    const cursor = editorRef.current?.getCursor() ?? autocomplete.cursor;
    let insertion: string;
    let caretOffsetInInsertion: number;
    if (autocomplete.kind === 'begin') {
      const body = '\n  ';
      insertion = `${item.key}}${body}\n\\end{${item.key}}`;
      caretOffsetInInsertion = 1 + item.key.length + body.length;
    } else {
      const alreadyClosed = pageContent[cursor] === '}';
      insertion = item.key + (alreadyClosed ? '' : '}');
      caretOffsetInInsertion = insertion.length;
    }
    editorRef.current?.replaceRange(autocomplete.queryStart, cursor, insertion, caretOffsetInInsertion);
    setAutocomplete(null);
  };

  const handleSpecialKey = (key: SpecialKey): boolean => {
    if (!autocomplete) return false;
    if (key === 'ArrowDown') {
      setAutocomplete((a) => a && { ...a, activeIndex: (a.activeIndex + 1) % a.items.length });
      return true;
    } else if (key === 'ArrowUp') {
      setAutocomplete((a) => a && { ...a, activeIndex: (a.activeIndex - 1 + a.items.length) % a.items.length });
      return true;
    } else if (key === 'Enter' || key === 'Tab') {
      applyAutocomplete(autocomplete.items[autocomplete.activeIndex]);
      return true;
    } else if (key === 'Escape') {
      setAutocomplete(null);
      return true;
    } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End') {
      setAutocomplete(null);
      return false;
    }
    return false;
  };

  // Handle Clipboard Paste Screenshots
  const handleImagePasteUpload = async (file: File) => {
    setUploadingImage(true);
    const formData = new FormData();
    formData.append('file', file, `screenshot_${Date.now()}.png`);
    try {
      const res = await fetch('/api/notebooks/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        const syntax = `\n\\begin{figure}\n  \\includegraphics{${data.url}}\n  \\caption{Screenshot}\n\\end{figure}\n`;
        insertTextAtCursor(syntax);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingImage(false);
    }
  };

  // Attach a downloadable research artifact (PDF/data file/image) to the
  // document - distinct from the LaTeX figure-embed path above, which
  // renders an image inline rather than listing it.
  const handleUploadAttachment = async (file: File) => {
    if (!activeNotebook || !activePage) return;
    setUploadingAttachment(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/attachments`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const attachment = await res.json();
        const updatedPage = { ...activePage, attachments: [...(activePage.attachments || []), attachment] };
        setActivePage(updatedPage);
        setActiveNotebook(prev => prev ? { ...prev, page: updatedPage } : prev);
        setNotebooks(prev => prev.map(nb => nb.id === activeNotebook.id ? { ...nb, page: updatedPage } : nb));
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Couldn’t attach file', data.error || 'Try again.', 'error');
      }
    } catch (err) {
      console.error('Error uploading attachment:', err);
      toast('Couldn’t attach file', 'Try again.', 'error');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!activeNotebook || !activePage) return;
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/attachments/${attachmentId}`, { method: 'DELETE' });
      if (res.ok) {
        const updatedPage = { ...activePage, attachments: (activePage.attachments || []).filter(a => a.id !== attachmentId) };
        setActivePage(updatedPage);
        setActiveNotebook(prev => prev ? { ...prev, page: updatedPage } : prev);
        setNotebooks(prev => prev.map(nb => nb.id === activeNotebook.id ? { ...nb, page: updatedPage } : nb));
      }
    } catch (err) {
      console.error('Error deleting attachment:', err);
    }
  };


  const requestPdfExport = async () => {
    if (!activeNotebook) return;
    setIsExportingPdf(true);
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: exportProfile,
          titleFont: exportTitleFont,
          bodyFont: exportBodyFont,
          includeCover: exportIncludeCover,
          includeHeader: exportIncludeHeader,
          includeFooter: exportIncludeFooter,
          includeSummary: exportIncludeSummary
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        toast('Export failed', err.error || 'The PDF couldn’t be generated. Try again.', 'error');
        return;
      }
      const blob = await res.blob();
      downloadPdfBlob(blob, activeNotebook.title.replace(/[^a-z0-9\- ]/gi, '').trim().replace(/\s+/g, '_') || 'notebook-export');
      setIsPdfExportModalOpen(false);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      toast('Export failed', 'The PDF couldn’t be generated. Try again.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ---------------------------------------------------------------------
  // In-document outline (Feature: TOC) - parsed live from the LaTeX source,
  // not stored separately. Sections are plain text markers in the one
  // document, exactly as the writer types them.
  // ---------------------------------------------------------------------
  const outline = useMemo<OutlineEntry[]>(() => computeOutline(pageContent), [pageContent]);

  const filteredOutline = useMemo(() => {
    const q = outlineFilter.trim().toLowerCase();
    if (!q) return outline;
    return outline.filter(o => o.text.toLowerCase().includes(q));
  }, [outline, outlineFilter]);

  // Retries briefly if the Monaco instance isn't mounted yet (e.g. jumping
  // to a section right after switching out of pure Preview mode, where the
  // editor pane doesn't exist until it re-renders).
  const runWhenEditorReady = (fn: (editor: LatexEditorHandle) => void, attemptsLeft = 20) => {
    if (editorRef.current) {
      fn(editorRef.current);
    } else if (attemptsLeft > 0) {
      setTimeout(() => runWhenEditorReady(fn, attemptsLeft - 1), 50);
    }
  };

  const jumpToOutlineEntry = (entry: OutlineEntry) => {
    setViewMode((v) => (v === 'preview' ? 'split' : v));
    runWhenEditorReady((editor) => editor.setCursorOffset(entry.offset));
  };

  // Appends text to the end of the current document - used by "Add
  // content" (section headings + full templates) and the command palette's
  // insert actions. Sections are never separate pages/rows; they're just
  // `\section{}` text landing in the same document.
  const appendToDocument = (text: string) => {
    setIsAddSectionOpen(false);
    setViewMode((v) => (v === 'preview' ? 'split' : v));
    runWhenEditorReady((editor) => {
      const needsGap = pageContent.length > 0 && !pageContent.endsWith('\n\n');
      editor.setCursorOffset(pageContent.length, false);
      editor.insertAtCursor(needsGap ? '\n\n' + text : text);
    });
  };

  const insertSectionHeading = (title: string) => appendToDocument(`\\section{${title}}\n\n`);
  const insertTemplateBlock = (tpl: NotebookTemplate) => appendToDocument(tpl.content + '\n');

  const submitCustomSection = () => {
    const title = customSectionTitle.trim();
    if (!title) return;
    insertSectionHeading(title);
    setCustomSectionTitle('');
  };

  // ---------------------------------------------------------------------
  // Version history (Feature: entry version history)
  // ---------------------------------------------------------------------
  const openHistory = async () => {
    if (!activeNotebook || !activePage) return;
    setIsHistoryOpen(true);
    setPreviewingRevision(null);
    setLoadingRevisions(true);
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/revisions`);
      if (res.ok) setRevisions(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRevisions(false);
    }
  };

  const previewRevision = async (id: string) => {
    if (!activeNotebook || !activePage) return;
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/revisions/${id}`);
      if (res.ok) setPreviewingRevision(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const restoreRevision = async (id: string) => {
    if (!activeNotebook || !activePage) return;
    if (!(await confirm({ title: 'Restore this version?', message: 'The current content is saved as a new version first, so nothing is lost.', confirmLabel: 'Restore' }))) return;
    setRestoringRevisionId(id);
    try {
      const res = await fetch(`/api/notebooks/${activeNotebook.id}/pages/${activePage.id}/revisions/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setActivePage(updated);
        setPageContent(stripPageMetadata(updated.content));
        setPageTags(updated.tags ? updated.tags.join(', ') : '');
        setActiveNotebook(prev => prev ? { ...prev, page: updated } : prev);
        setNotebooks(prev => prev.map(nb => nb.id === activeNotebook.id ? { ...nb, page: updated } : nb));
        setIsHistoryOpen(false);
        setPreviewingRevision(null);
        toast('Version restored', 'The document now matches the selected version.', 'success');
      } else {
        toast('Couldn’t restore', 'Try again.', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('Couldn’t restore', 'Try again.', 'error');
    } finally {
      setRestoringRevisionId(null);
    }
  };

  // ---------------------------------------------------------------------
  // Command palette (Feature: notebook-wide command palette)
  // ---------------------------------------------------------------------
  interface PaletteItem { id: string; group: string; label: string; sublabel?: string; action: () => void }
  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    notebooks.forEach(nb => {
      if (nb.id === activeNotebook?.id) return;
      items.push({ id: `nb-${nb.id}`, group: 'Switch notebook', label: nb.title, action: () => openNotebook(nb) });
    });
    outline.forEach((h, i) => {
      items.push({ id: `outline-${i}`, group: 'Jump to section', label: h.text, sublabel: `Line ${h.line}`, action: () => jumpToOutlineEntry(h) });
    });
    if (activeNotebook && activePage) {
      DEFAULT_PROJECT_SECTIONS.forEach(name => {
        items.push({ id: `sec-${name}`, group: 'Insert section', label: name, action: () => insertSectionHeading(name) });
      });
      NOTEBOOK_TEMPLATES.forEach(tpl => {
        items.push({ id: `tpl-${tpl.name}`, group: 'Insert template', label: tpl.name, action: () => insertTemplateBlock(tpl) });
      });
      items.push({ id: 'history', group: 'Document', label: 'Version history', action: () => openHistory() });
      items.push({ id: 'export', group: 'Document', label: 'Export PDF', action: () => setIsPdfExportModalOpen(true) });
      items.push({ id: 'view-edit', group: 'View', label: 'Write', action: () => setViewMode('edit') });
      items.push({ id: 'view-split', group: 'View', label: 'Split', action: () => setViewMode('split') });
      items.push({ id: 'view-preview', group: 'View', label: 'Preview', action: () => setViewMode('preview') });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebooks, activeNotebook, activePage, outline]);

  const filteredPaletteItems = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const list = !q ? paletteItems : paletteItems.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
    return list;
  }, [paletteItems, paletteQuery]);

  useEffect(() => { setPaletteActiveIndex(0); }, [paletteQuery, isPaletteOpen]);

  const runPaletteItem = (item: PaletteItem) => {
    setIsPaletteOpen(false);
    item.action();
  };

  const equationsList = useMemo(() => computeEquationsList(pageContent), [pageContent]);

  const referencesList = useMemo(() => computeReferencesList(pageContent), [pageContent]);

  const activeCol = getNotebookColor(activeNotebook);

  // ---------------------------------------------------------------------
  // Library (GoodNotes-style): every project the caller can see becomes a
  // folder, even an empty one, so there's always somewhere to put a
  // notebook - and every project may hold more than one. Notebooks with no
  // project (isPersonal) sit at the library root, not inside any folder.
  // ---------------------------------------------------------------------
  const [libraryQuery, setLibraryQuery] = useState('');
  const libraryFolders = useMemo(() => {
    const byProject = new Map<string, { project: { id: string; name: string; color?: string | null }; notebooks: Notebook[] }>();
    for (const p of projects) byProject.set(p.id, { project: p, notebooks: [] });
    for (const nb of notebooks) {
      if (!nb.projectId) continue;
      if (!byProject.has(nb.projectId)) {
        byProject.set(nb.projectId, { project: nb.project || { id: nb.projectId, name: 'Project' }, notebooks: [] });
      }
      byProject.get(nb.projectId)!.notebooks.push(nb);
    }
    return Array.from(byProject.values()).sort((a, b) => a.project.name.localeCompare(b.project.name));
  }, [projects, notebooks]);

  const personalNotebooks = useMemo(() => notebooks.filter(nb => !nb.projectId), [notebooks]);

  const expandedFolder = expandedProjectId ? libraryFolders.find(f => f.project.id === expandedProjectId) || null : null;

  const q = libraryQuery.trim().toLowerCase();
  const matchesQuery = (nb: Notebook) => !q || [nb.title, nb.project?.name, nb.summary?.excerpt, ...(nb.summary?.tags || [])].some((t) => t?.toLowerCase().includes(q));
  const recent = [...notebooks].filter(n => editedAt(n)).sort((x, y) => new Date(editedAt(y)!).getTime() - new Date(editedAt(x)!).getTime()).slice(0, 4);

  // A row in the full list: title in the serif, a glimpse of the text, when.
  const notebookRow = (nb: Notebook) => (
    <li key={nb.id} className="group flex items-center gap-4 py-3">
      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: getNotebookColor(nb) }} aria-hidden="true" />
      <button type="button" onClick={() => openNotebook(nb)} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-serif text-[17px] font-medium text-foreground group-hover:text-primary">{nb.title}</span>
        <span className="block truncate text-[13px] text-ink-secondary">{nb.summary?.excerpt || 'Empty so far.'}</span>
      </button>
      <span className="hidden shrink-0 text-[12.5px] text-ink-faint sm:block">{relDate(editedAt(nb))}</span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" onClick={() => handleRenameNotebook(nb)} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground" title="Notebook settings" aria-label={`Settings for ${nb.title}`}>
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => handleDeleteNotebook(nb.id)} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-danger-soft hover:text-danger" title="Delete notebook" aria-label={`Delete ${nb.title}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );

  const libraryContent = (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-10 w-64 rounded-[10px] bg-surface-raised" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-[210px] rounded-[12px] bg-surface-raised" />)}</div>
        </div>
      ) : expandedFolder ? (
        <div className="space-y-8">
          <PageHeader
            className=""
            title={expandedFolder.project.name}
            meta={<button type="button" onClick={() => setExpandedProjectId(null)} className="text-[13.5px] text-ink-secondary hover:text-foreground">← All notebooks</button>}
            subtitle={`${expandedFolder.notebooks.length} ${expandedFolder.notebooks.length === 1 ? 'notebook' : 'notebooks'} in this project.`}
            actions={<Button onClick={() => openCreateNotebookModal(expandedFolder.project.id)}><Plus className="w-4 h-4" /> New notebook</Button>}
          />
          {expandedFolder.notebooks.length === 0 ? (
            <EmptyState spot="notebook" title="No notebooks in this project yet" message="Start one: a lab notebook, meeting notes, a chapter draft. Each notebook is one continuous LaTeX document." action={<Button onClick={() => openCreateNotebookModal(expandedFolder.project.id)}><Plus className="w-4 h-4" /> New notebook</Button>} />
          ) : (
            <ul className="divide-y divide-border border-t border-foreground/75">{expandedFolder.notebooks.map(notebookRow)}</ul>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          <PageHeader
            className=""
            title="Notebook"
            subtitle="Your lab notebooks and notes, written in LaTeX. One continuous document per notebook, with every saved version kept."
            actions={<Button onClick={() => openCreateNotebookModal()}><Plus className="w-4 h-4" /> New notebook</Button>}
          />

          {loadFailed && notebooks.length === 0 ? (
            <LoadError what="your notebooks" onRetry={() => fetchNotebooks()} />
          ) : notebooks.length === 0 ? (
            <EmptyState spot="notebook" title="No notebooks yet" message="Start a personal notebook, or create a project and give it one. Write in LaTeX with live maths, citations and references." action={<Button onClick={() => openCreateNotebookModal()}><Plus className="w-4 h-4" /> New notebook</Button>} />
          ) : (
            <>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="search"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="Search titles, text and tags…"
                  aria-label="Search notebooks"
                  className="h-10 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[14px] placeholder-ink-faint focus:border-border-strong focus:outline-none"
                />
              </div>

              {!q && recent.length > 0 && (
                <section>
                  <SectionHeader title="Recently edited" />
                  <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {recent.map(nb => <NotebookBook key={nb.id} notebook={nb} color={getNotebookColor(nb)} onOpen={openNotebook} />)}
                  </div>
                </section>
              )}

              {libraryFolders.filter(f => f.notebooks.length > 0 && (!q || f.notebooks.some(matchesQuery))).map(f => {
                const list = f.notebooks.filter(matchesQuery);
                return (
                  <section key={f.project.id}>
                    <SectionHeader
                      title={<span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: f.project.color || 'var(--text-faint)' }} aria-hidden="true" />{f.project.name}</span>}
                      meta={list.length}
                      right={<button type="button" onClick={() => openCreateNotebookModal(f.project.id)} className="inline-flex items-center gap-1 text-[12.5px] text-ink-secondary hover:text-foreground"><Plus className="h-3.5 w-3.5" /> Add</button>}
                    />
                    <ul className="divide-y divide-border">{list.map(notebookRow)}</ul>
                  </section>
                );
              })}
              {personalNotebooks.filter(matchesQuery).length > 0 && (
                <section>
                  <SectionHeader title="Personal" meta={personalNotebooks.filter(matchesQuery).length} />
                  <ul className="divide-y divide-border">{personalNotebooks.filter(matchesQuery).map(notebookRow)}</ul>
                </section>
              )}
              {!q && libraryFolders.some(f => f.notebooks.length === 0) && (
                <p className="text-[13.5px] text-ink-secondary">
                  Start a notebook for{' '}
                  {libraryFolders.filter(f => f.notebooks.length === 0).map((f, i, arr) => (
                    <span key={f.project.id}>
                      <button type="button" onClick={() => openCreateNotebookModal(f.project.id)} className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">{f.project.name}</button>
                      {i < arr.length - 2 ? ', ' : i === arr.length - 2 ? ' or ' : '.'}
                    </span>
                  ))}
                </p>
              )}
              {q && !notebooks.some(matchesQuery) && (
                <EmptyState compact spot="search" title={`Nothing matches “${libraryQuery.trim()}”`} message="Search looks at titles, tags and the start of each document." />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  const sidebarNavigator = (
    <div className="w-full h-full bg-surface border border-border rounded-md p-4 flex flex-col space-y-4 min-h-0">

      {/* Back to the library - the only place notebooks are browsed/switched now */}
      <button
        type="button"
        onClick={goToLibrary}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary hover:text-foreground transition-colors cursor-pointer shrink-0"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> My Notebooks
      </button>

      {/* In-document outline for the open notebook */}
      {activeNotebook ? (
        <div className="flex-1 flex flex-col min-h-0 border-t border-border pt-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[12.5px] font-semibold text-ink-secondary truncate block">
                {activeNotebook.title}
              </span>
              {activePage && (
                <span className="font-mono text-[10px] text-ink-faint" title="Last updated">
                  Updated {new Date(activePage.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <div className="relative shrink-0" ref={addSectionRef}>
              <button
                onClick={() => setIsAddSectionOpen(v => !v)}
                disabled={!activePage}
                className="p-1 text-primary hover:bg-primary-soft rounded-[3px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Add content to this document" aria-label="Add content"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {isAddSectionOpen && (
                <div className="absolute right-0 mt-1 w-64 bg-card border border-border rounded-md shadow-[var(--shadow-modal)] p-3 space-y-3 z-30">
                  <div>
                    <p className="text-[11.5px] font-semibold text-muted-foreground mb-1.5">Insert section</p>
                    <div className="flex flex-wrap gap-1">
                      {DEFAULT_PROJECT_SECTIONS.map(name => (
                        <button
                          key={name}
                          onClick={() => insertSectionHeading(name)}
                          className="px-2 py-1 bg-surface-raised border border-border hover:border-border-strong rounded text-[10.5px] text-ink-secondary hover:text-foreground transition-colors cursor-pointer"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customSectionTitle}
                      onChange={(e) => setCustomSectionTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCustomSection(); } }}
                      placeholder="Custom section title"
                      className="flex-1 min-w-0 bg-surface-raised border border-border rounded-md px-2 py-1 text-[11px] text-foreground placeholder-muted-foreground focus:outline-none focus:border-border-strong"
                    />
                    <button
                      onClick={submitCustomSection}
                      disabled={!customSectionTitle.trim()}
                      className="px-2 py-1 bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground rounded-full text-[10.5px] font-semibold cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="text-[11.5px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><Layers className="w-3 h-3" /> Insert template</p>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {NOTEBOOK_TEMPLATES.map(tpl => (
                        <button
                          key={tpl.name}
                          onClick={() => insertTemplateBlock(tpl)}
                          className="w-full text-left px-2 py-1 hover:bg-surface-sunken rounded text-[11px] text-ink-secondary hover:text-foreground transition-colors cursor-pointer truncate"
                          title={tpl.name}
                        >
                          {tpl.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Search outline */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
            <input
              type="text"
              placeholder="Search sections… (⌘⇧K for more)"
              aria-label="Search sections in this notebook"
              value={outlineFilter}
              onChange={(e) => setOutlineFilter(e.target.value)}
              className="w-full bg-surface-raised border border-border rounded-md pl-9 pr-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-none focus:border-border-strong"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-0.5 min-h-0 -mx-1">
            {filteredOutline.length === 0 ? (
              <div className="text-center py-8 text-ink-faint text-[11px] font-light px-2">
                {outline.length === 0 ? 'No sections yet. Use + above to add one.' : 'No sections match your search.'}
              </div>
            ) : (
              filteredOutline.map((h, i) => (
                <button
                  key={`${h.offset}-${i}`}
                  onClick={() => jumpToOutlineEntry(h)}
                  className={`w-full flex items-center gap-1.5 pl-[${8 + h.level * 10}px] pr-1.5 py-[5px] rounded-[3px] text-left cursor-pointer transition-colors text-ink-secondary hover:text-foreground hover:bg-surface-sunken/60`}
                  style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                  title={h.text}
                >
                  <span className={`text-[12.5px] truncate flex-1 ${h.level === 1 ? 'font-semibold' : ''}`}>{h.text}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-dashed border-border rounded-lg py-12 px-4">
          <div className="text-center">
            <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-foreground text-sm font-medium">No notebook open</p>
            <p className="text-ink-secondary text-[13px] mt-1">Pick one from My Notebooks.</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6 pb-12 w-full max-w-none h-[92vh]">
      {/* Sidebar: only in the editor - the library is its own full-width
          browsing screen with no need for an outline/back rail. */}
      {screen === 'editor' && !isSidebarCollapsed && (
        <div className="w-full md:w-[17%] min-w-[220px] flex-shrink-0 flex flex-col h-full">
          {sidebarNavigator}
        </div>
      )}

      {/* Main Panel: Library or Document Editor */}
      <div className="flex-1 min-w-0 flex flex-col h-full space-y-6">
        {screen === 'library' ? libraryContent : activeNotebook && activePage ? (
          <div className="flex-1 bg-surface border border-border rounded-md p-6 flex flex-row gap-6 min-h-0 relative">
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Header: sidebar toggle + breadcrumb/save-status, and an
                actions row below it. */}
            <div className="flex flex-col gap-3 border-b border-border/60 pb-4 mb-4 shrink-0">
              <div className="flex items-start gap-3">
              <button
                onClick={toggleSidebar}
                className="mt-0.5 p-2 bg-surface-raised border border-border rounded-md hover:bg-surface-sunken text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center shrink-0"
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                ) : (
                  <PanelLeftClose className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 select-none text-[12.5px] text-ink-faint">
                  <h1 className="font-serif text-[24px] font-medium leading-tight tracking-[-0.015em] text-foreground">
                    {activeNotebook.title}
                  </h1>
                  {activeNotebook.project && (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary">
                      <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: activeCol }} aria-hidden="true" />
                      {activeNotebook.project.name}
                    </span>
                  )}
                  <span>·</span>
                  {savingPage ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Saving…
                    </span>
                  ) : isDirty ? (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> Unsaved changes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-ink-faint">
                      <Check className="w-3 h-3" /> Saved{activePage.updatedAt ? ` ${new Date(activePage.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                  )}
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => { setIsPaletteOpen(true); setPaletteQuery(''); }}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                    title="Document command palette (Ctrl/Cmd+Shift+K)"
                  >
                    <Command className="w-3 h-3" /> ⌘⇧K
                  </button>
                </div>
              </div>
              </div>

              {/* Actions: save/export/view-toggle/review/history/settings */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleSavePage(true)}
                  disabled={savingPage || !isDirty}
                  className={`h-8 px-3 text-[13px] font-semibold rounded-[8px] transition-colors flex items-center justify-center gap-1.5 ${
                    isDirty
                      ? 'bg-primary hover:bg-primary-hover text-primary-foreground cursor-pointer'
                      : 'text-ink-faint cursor-not-allowed'
                  }`}
                  title="Save (Ctrl+S)"
                >
                  {savingPage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save</span>
                </button>

                <button
                  onClick={() => setIsPdfExportModalOpen(true)}
                  className="h-8 px-2.5 text-[13px] font-medium rounded-[8px] text-ink-secondary hover:bg-surface-sunken hover:text-foreground transition-colors flex items-center gap-1.5"
                  title="Export to PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>

                <button
                  onClick={openHistory}
                  className="h-8 px-2.5 text-[13px] font-medium rounded-[8px] text-ink-secondary hover:bg-surface-sunken hover:text-foreground transition-colors flex items-center gap-1.5"
                  title="Version history"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History</span>
                </button>

                {/* Write / Split / Preview */}
                <div className="inline-flex rounded-[9px] bg-surface-sunken p-0.5" role="group" aria-label="View">
                  {([
                    ['edit', 'Write', 'Edit the LaTeX source'],
                    ['split', 'Split', 'Source and rendered side by side'],
                    ['preview', 'Preview', 'Rendered document'],
                  ] as const).map(([val, label, tip], i) => (
                    <button
                      key={val}
                      onClick={() => setViewMode(val)}
                      title={tip}
                      aria-pressed={viewMode === val}
                      className={`h-7 px-2.5 text-[13px] font-medium rounded-[7px] transition-colors ${i > 0 ? '' : ''} ${
                        viewMode === val ? 'bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-secondary hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Review + comments — only for project-linked notebooks */}
                {activeNotebook.project && (
                  <>
                    {pageReviewStatus === 'REVIEWED' ? (
                      <span className="inline-flex h-8 items-center gap-1 px-2.5 text-[13px] font-medium text-primary">
                        <Check className="w-3.5 h-3.5" /> Reviewed
                      </span>
                    ) : pageReviewStatus === 'READY' ? (
                      <button
                        onClick={() => setReview('NONE')}
                        disabled={reviewBusy}
                        className="h-8 px-2.5 text-[13px] font-medium rounded-[8px] text-ink-secondary hover:bg-surface-sunken hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Withdraw the review request"
                      >
                        Awaiting review · withdraw
                      </button>
                    ) : (
                      <button
                        onClick={() => setReview('READY')}
                        disabled={reviewBusy}
                        className="h-8 px-2.5 text-[13px] font-medium rounded-[8px] text-ink-secondary hover:bg-surface-sunken hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Notify reviewers this document is ready"
                      >
                        Request review
                      </button>
                    )}
                    <button
                      onClick={() => setShowComments(v => !v)}
                      className={`h-8 px-2.5 text-[13px] font-medium rounded-[8px] transition-colors inline-flex items-center gap-1.5 ${
                        showComments ? 'bg-surface-sunken text-foreground' : 'text-ink-secondary hover:text-foreground hover:bg-surface-sunken'
                      }`}
                      title="Comments"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Comments{pageCommentCount > 0 ? ` (${pageCommentCount})` : ''}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowMetadataPanel((v) => !v)}
                  className={`hidden xl:inline-flex h-8 px-2.5 text-[13px] font-medium rounded-[8px] items-center gap-1.5 transition-colors cursor-pointer ${showMetadataPanel ? 'bg-surface-sunken text-foreground' : 'text-ink-secondary hover:text-foreground hover:bg-surface-sunken'}`}
                  title={showMetadataPanel ? 'Hide entry details' : 'Show entry details'}
                >
                  {showMetadataPanel ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                  Details
                </button>
              </div>
            </div>

            {/* Linked runs */}
            {linkedRuns.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-1 pb-2 shrink-0">
                <span className="text-[11.5px] font-semibold text-ink-faint">Linked runs</span>
                {linkedRuns.map(run => {
                  const s = (run.status || '').toLowerCase();
                  const tone =
                    s === 'running' ? 'border-primary text-primary'
                      : s === 'completed' ? 'border-border-strong text-ink-secondary'
                      : ['failed', 'cancelled', 'timed out'].includes(s) ? 'border-danger text-danger'
                      : 'border-border-strong text-ink-secondary';
                  return (
                    <Link
                      key={run.id}
                      href="/jobs"
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] border text-[11px] font-mono hover:bg-surface-sunken transition-colors ${tone}`}
                      title={`${run.name} · ${run.status}${run.instrumentName ? ` · ${run.instrumentName}` : ''}`}
                    >
                      {run.name}
                      <span className="opacity-70">{run.status.toLowerCase()}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Editor Text Area Panel */}
            <div ref={splitContainerRef} className={`flex-1 flex min-h-0 relative gap-4 ${viewMode === 'split' || viewMode === 'preview' ? 'flex-row' : 'flex-col'}`}>
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div
                  className={`flex flex-col min-h-0 bg-surface border border-border rounded-md overflow-hidden ${viewMode === 'split' ? '' : 'flex-1'}`}
                  style={viewMode === 'split' ? { width: `${splitWidth}%`, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' } : undefined}
                >
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 px-2.5 py-2 bg-surface-raised/50 border-b border-border select-none shrink-0">

                    {/* Group 1: Typography */}
                    <div className="flex flex-wrap items-center gap-0.5">
                      <select
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            insertTextAtCursor(`\\${val}{`, '}');
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        className="bg-surface-raised border border-border-strong rounded-lg px-2 py-1 text-[11px] text-muted-foreground focus:outline-none focus:border-border-strong cursor-pointer h-7"
                        title="Insert heading"
                      >
                        <option value="" disabled>Heading</option>
                        <option value="section">Section</option>
                        <option value="subsection">Subsection</option>
                        <option value="subsubsection">Subsubsection</option>
                      </select>

                      <span className="w-px h-4 bg-surface-sunken mx-1" />

                      <button onClick={() => insertTextAtCursor('\\textbf{', '}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Bold" aria-label="Bold">
                        <Bold className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\textit{', '}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Italic" aria-label="Italic">
                        <Italic className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\underline{', '}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Underline" aria-label="Underline">
                        <Underline className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\textrm{\\sout{', '}}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Strikethrough" aria-label="Strikethrough">
                        <Strikethrough className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Group 2: Insert Options & Layout */}
                    <div className="flex flex-wrap items-center gap-0.5">
                      <button onClick={() => insertTextAtCursor('\\begin{itemize}\n  \\item ', '\n\\end{itemize}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Bulleted list" aria-label="Bulleted list">
                        <List className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\begin{enumerate}\n  \\item ', '\n\\end{enumerate}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Numbered list" aria-label="Numbered list">
                        <ListOrdered className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\begin{quote}\n  ', '\n\\end{quote}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Blockquote" aria-label="Blockquote">
                        <Quote className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\begin{verbatim}\n', '\n\\end{verbatim}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Code block" aria-label="Code block">
                        <Code className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\begin{table}\n  \\caption{Caption}\n  \\label{tab:label}\n  \\begin{tabular}{c & c}\n    Col 1 & Col 2 \\\\\n    \\hline\n    Val 1 & Val 2\n  \\end{tabular}\n\\end{table}\n')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Table" aria-label="Table">
                        <Table className="w-4 h-4" />
                      </button>
                      <button onClick={() => insertTextAtCursor('\\href{', '}{text}')} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors" title="Link" aria-label="Link">
                        <Link2 className="w-4 h-4" />
                      </button>
                      <DictationButton onTranscript={(text) => insertTextAtCursor(text.trim() + ' ')} />
                    </div>

                    <span className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Group 3: Color & Highlights */}
                    <div className="flex flex-wrap items-center gap-0.5">
                      <ColorPickerPopover
                        icon={Palette}
                        label="Text color"
                        title="Text color. Select text first. Switches to Split view so you can see the result."
                        presets={[
                          { name: 'Red', value: '#ef4444' },
                          { name: 'Blue', value: '#3b82f6' },
                          { name: 'Green', value: '#10b981' },
                          { name: 'Yellow', value: '#f59e0b' },
                          { name: 'Purple', value: '#8b5cf6' },
                          { name: 'Pink', value: '#ec4899' },
                          { name: 'White', value: '#ffffff' },
                        ]}
                        onPick={(hex) => {
                          insertTextAtCursor(`\\textcolor{${hex}}{`, '}');
                          setViewMode((v) => (v === 'edit' ? 'split' : v));
                        }}
                      />

                      <ColorPickerPopover
                        icon={Highlighter}
                        label="Highlight"
                        title="Highlight color. Select text first. Switches to Split view so you can see the result."
                        presets={[
                          { name: 'Red', value: '#ef4444' },
                          { name: 'Blue', value: '#3b82f6' },
                          { name: 'Green', value: '#10b981' },
                          { name: 'Yellow', value: '#f59e0b' },
                          { name: 'Purple', value: '#8b5cf6' },
                        ]}
                        onPick={(hex) => {
                          const rgba = hexToRgba(hex, 0.25);
                          insertTextAtCursor(`\\colorbox{${rgba}}{`, '}');
                          setViewMode((v) => (v === 'edit' ? 'split' : v));
                        }}
                      />
                    </div>

                    <span className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Group 4: LaTeX Math & Citations */}
                    <div className="flex flex-wrap items-center gap-0.5">
                      <button onClick={() => insertTextAtCursor('$', '$')} className="px-2 py-1 hover:bg-surface-sunken rounded text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground cursor-pointer h-7 flex items-center" title="Inline equation">
                        $
                      </button>
                      <button onClick={() => insertTextAtCursor('\\begin{equation}\n  ', '\n\\end{equation}')} className="px-2 py-1 hover:bg-surface-sunken rounded text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground cursor-pointer h-7 flex items-center" title="Display equation">
                        $$
                      </button>

                      <span className="w-px h-4 bg-surface-sunken mx-1" />

                      <button onClick={() => insertTextAtCursor('\\label{', '}')} className="px-1.5 py-0.5 hover:bg-surface-sunken rounded text-[10px] font-mono font-bold text-primary hover:text-primary cursor-pointer h-7 flex items-center" title="Insert label">
                        \label
                      </button>
                      <button onClick={() => insertTextAtCursor('\\ref{', '}')} className="px-1.5 py-0.5 hover:bg-surface-sunken rounded text-[10px] font-mono font-bold text-primary hover:text-primary cursor-pointer h-7 flex items-center" title="Insert reference">
                        \ref
                      </button>
                      <button onClick={() => insertTextAtCursor('\\cite{', '}')} className="px-1.5 py-0.5 hover:bg-surface-sunken rounded text-[10px] font-mono font-bold text-primary hover:text-primary cursor-pointer h-7 flex items-center" title="Insert citation">
                        \cite
                      </button>
                      <button onClick={() => insertTextAtCursor('\\run{', '}')} className="px-1.5 py-0.5 hover:bg-surface-sunken rounded text-[10px] font-mono font-bold text-primary hover:text-primary cursor-pointer h-7 flex items-center" title="Reference a run linked to this document">
                        \run
                      </button>
                    </div>

                    <span className="w-px h-4 bg-border mx-1 shrink-0" />

                    {/* Group 5: Tools & Media */}
                    <div className="flex flex-wrap items-center gap-0.5">
                      <button onClick={() => setIsImageModalOpen(true)} className="p-1 hover:bg-surface-sunken rounded text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-colors h-7" title="Insert image">
                        <FileImage className="w-4 h-4 text-primary" />
                        {uploadingImage && <span className="text-[8px] text-ink-faint animate-pulse ml-1">Uploading…</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsMathSymbolsOpen(!isMathSymbolsOpen)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer h-7 ${isMathSymbolsOpen ? 'bg-primary/20 text-primary border border-primary/30' : 'text-primary hover:bg-surface-sunken'}`}
                        title="Show or hide math symbols"
                      >
                        <Sigma className="w-3.5 h-3.5" />
                        <span>Symbols</span>
                      </button>
                    </div>

                  </div>

                  <div className="relative flex-1 min-h-0" onBlur={() => setAutocomplete(null)}>
                    <LatexEditor
                      ref={editorRef}
                      value={pageContent}
                      onChange={setPageContent}
                      onCursorActivity={handleCursorActivity}
                      onSpecialKey={handleSpecialKey}
                      onPasteImage={handleImagePasteUpload}
                      autocompleteOpen={!!autocomplete}
                      placeholder={'\\section{Introduction}\nWrite your document here…\nUse \\begin{equation} for equations.'}
                    />
                    {autocomplete && (
                      <LatexAutocomplete
                        top={autocomplete.top}
                        left={autocomplete.left}
                        items={autocomplete.items}
                        activeIndex={autocomplete.activeIndex}
                        onSelect={applyAutocomplete}
                        onHover={(i) => setAutocomplete((a) => a && { ...a, activeIndex: i })}
                      />
                    )}
                  </div>

                  <div className="p-2 border-t border-border bg-surface flex justify-between items-center text-[9px] text-ink-faint font-mono">
                    <div className="flex items-center gap-2">
                      <span>LaTeX source</span>
                    </div>
                    <span>Paste screenshots straight into the editor.</span>
                  </div>
                </div>
              )}

              {viewMode === 'split' && (
                <div
                  onMouseDown={handleSplitMouseDown}
                  className="w-1.5 hover:w-2 bg-surface-sunken border-x border-border hover:bg-surface-sunken transition-colors cursor-col-resize flex-shrink-0 h-full relative group z-10"
                  title="Drag to resize editor and preview panes"
                >
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-surface-sunken group-hover:bg-border-strong" />
                </div>
              )}

              {(viewMode === 'preview' || viewMode === 'split') && (
                <div
                  className={`flex flex-col min-h-0 bg-surface border border-border rounded-md overflow-hidden ${viewMode === 'split' ? '' : 'flex-1'}`}
                  style={viewMode === 'split' ? { width: `${100 - splitWidth}%`, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' } : undefined}
                >
                  <div className="flex items-center justify-end px-3 py-2 bg-surface-raised/50 border-b border-border select-none shrink-0">
                    <div className="inline-flex border border-border rounded-md overflow-hidden">
                      {([
                        ['live', 'Render'],
                        ['equations', `Equations ${equationsList.length}`],
                        ['references', `References ${referencesList.length}`],
                      ] as const).map(([val, label], i) => (
                        <button
                          key={val}
                          onClick={() => setPreviewTab(val)}
                          className={`px-2 py-1 text-[10px] font-medium transition-colors ${i > 0 ? 'border-l border-border' : ''} ${
                            previewTab === val ? 'bg-primary text-primary-foreground' : 'bg-surface text-ink-secondary hover:text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    ref={previewRef}
                    tabIndex={0}
                    role="region"
                    aria-label="Notebook preview"
                    onMouseUp={previewTab === 'live' && activeNotebook.project ? captureCommentSelection : undefined}
                    className="flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 px-6 py-8 sm:px-10 prose prose-neutral max-w-none"
                  >
                    {previewTab === 'live' && !pageContent.trim() && (
                      <div className="not-prose flex flex-col items-center justify-center text-center py-16 gap-3">
                        <p className="text-sm text-ink-secondary">This document is empty.</p>
                        <button
                          onClick={() => setViewMode('edit')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-[9px] transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Start writing
                        </button>
                      </div>
                    )}
                    {previewTab === 'live' && !!pageContent.trim() && (
                      <>
                        <style>{`
                          .notebook-preview-styled {
                            font-family: var(--font-serif), Georgia, serif !important;
                            font-size: 17.5px; line-height: 1.7; color: var(--text);
                            max-width: 68ch; margin: 0 auto;
                          }
                          .notebook-preview-styled p { margin: 0 0 1em; }
                          .notebook-preview-styled h1,
                          .notebook-preview-styled h2,
                          .notebook-preview-styled h3,
                          .notebook-preview-styled h4,
                          .notebook-preview-styled h5,
                          .notebook-preview-styled h6 {
                            font-family: var(--font-serif), Georgia, serif !important;
                            font-weight: 500 !important; letter-spacing: -0.015em; color: var(--text);
                          }
                          .notebook-preview-styled .ltx-1 { font-size: 27px; margin-top: 1.6em; }
                          .notebook-preview-styled .ltx-2 { font-size: 21px; }
                          .notebook-preview-styled .ltx-3 { font-size: 18px; }
                          .notebook-preview-styled code,
                          .notebook-preview-styled pre {
                            font-family: var(--font-mono), ui-monospace, monospace !important; font-size: .86em;
                          }
                        `}</style>
                        <div
                          className="notebook-preview-styled"
                          dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(pageContent, docAsPagesArray, activePage.id, false, runsMap) }}
                        />
                      </>
                    )}

                    {previewTab === 'equations' && (
                      <div className="space-y-4">
                        <h4 className="text-[12.5px] font-semibold text-muted-foreground border-b border-border pb-2 mb-3">Equations</h4>
                        {equationsList.length === 0 ? (
                          <p className="text-xs text-ink-faint italic">No equations found in this document. Use $...$ or \begin{"{"}equation{"}"}...\end{"{"}equation{"}"} to write math.</p>
                        ) : (
                          <div className="space-y-3">
                            {equationsList.map((eq, i) => (
                              <div key={i} className="p-3 bg-surface-raised/40 border border-border rounded-md space-y-2">
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                                  <span>{eq.label}</span>
                                  <button onClick={() => insertTextAtCursor(eq.latex)} className="hover:text-foreground transition-colors cursor-pointer text-[10px] text-primary font-bold" title="Insert this equation again">
                                    Insert
                                  </button>
                                </div>
                                <div className="overflow-x-auto py-2 bg-surface-sunken/20 rounded-lg border border-border/50 flex justify-center">
                                  <KatexRender latex={eq.latex} block={true} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {previewTab === 'references' && (
                      <div className="space-y-4">
                        <h4 className="text-[12.5px] font-semibold text-muted-foreground border-b border-border pb-2 mb-3">References and citation keys</h4>
                        {referencesList.length === 0 ? (
                          <p className="text-xs text-ink-faint italic">No labels, citation keys, or cross-references in this document.</p>
                        ) : (
                          <div className="space-y-2">
                            {referencesList.map((ref, i) => (
                              <div key={i} className="p-2.5 bg-surface-raised/40 border border-border rounded-md flex items-center justify-between">
                                <div className="min-w-0">
                                  <span className="text-[11.5px] font-mono text-primary font-semibold block">{ref.type}</span>
                                  <span className="text-xs text-foreground font-bold font-mono">{ref.key}</span>
                                  <span className="text-[10px] text-muted-foreground block mt-0.5">{ref.targetText}</span>
                                </div>
                                <button
                                  onClick={() => insertTextAtCursor(ref.type === 'Citation' ? `\\cite{${ref.key}}` : `\\ref{${ref.key}}`)}
                                  className="text-[10px] text-muted-foreground hover:text-foreground font-mono bg-surface-raised border border-border-strong px-2.5 py-1 rounded-lg cursor-pointer"
                                >
                                  Insert \ref
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Slide-out Math Symbols Panel */}
            {isMathSymbolsOpen && (
              <div className="absolute top-0 right-0 w-80 h-full bg-card border-l border-border rounded-r-3xl shadow-[var(--shadow-modal)] p-5 flex flex-col z-20 transition-colors duration-[var(--duration-standard)]">
                <div className="flex justify-between items-center border-b border-border pb-3 mb-4 shrink-0">
                  <h4 className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                    <Sigma className="w-4 h-4 text-primary" /> Math symbols
                  </h4>
                  <button onClick={() => setIsMathSymbolsOpen(false)} className="p-1 hover:bg-surface-raised rounded-lg text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                  <p className="text-[10px] text-muted-foreground leading-relaxed font-mono">
                    Select a symbol to insert it at the cursor.
                  </p>
                  {MATH_SYMBOLS.map((cat) => (
                    <div key={cat.category} className="space-y-1.5">
                      <span className="text-[11.5px] font-mono text-muted-foreground block font-semibold">{cat.category}</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {cat.symbols.map((sym) => (
                          <button
                            key={sym.latex}
                            type="button"
                            onClick={() => insertTextAtCursor(sym.latex)}
                            className="p-1.5 bg-surface-raised border border-border hover:border-border-strong text-ink-secondary hover:text-foreground rounded-lg text-[11px] font-mono transition-colors text-center cursor-pointer truncate"
                            title={sym.latex}
                          >
                            {sym.display}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Entry metadata rail - author/tags/attachments/last-updated/
              related project. Collapsible via the "Details" toggle above,
              hidden below xl so it never crowds the editor. */}
          {showMetadataPanel && (
            <div className="hidden xl:flex flex-col w-52 shrink-0 border-l border-border/60 pl-5 overflow-y-auto">
              <span className="text-[11.5px] font-semibold text-ink-secondary mb-4">Document details</span>

              <div className="space-y-5 text-xs">
                <div>
                  <p className="text-ink-faint text-[11.5px] font-semibold mb-1">Author</p>
                  <p className="text-foreground font-medium">{activePage.author?.name || activePage.author?.email || 'Unknown'}</p>
                </div>

                <div>
                  <p className="text-ink-faint text-[11.5px] font-semibold mb-1">Last updated</p>
                  <p className="text-foreground font-mono">{new Date(activePage.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>

                {activeNotebook.project && (
                  <div>
                    <p className="text-ink-faint text-[11.5px] font-semibold mb-1">Project</p>
                    <Link href={`/projects/${activeNotebook.project.id}`} className="text-primary hover:text-primary-hover font-medium">
                      {activeNotebook.project.name}
                    </Link>
                  </div>
                )}

                <div>
                  <label htmlFor="nb-tags" className="block text-ink-faint text-[11.5px] font-semibold mb-1.5">Tags</label>
                  <input
                    id="nb-tags"
                    type="text"
                    value={pageTags}
                    onChange={(e) => setPageTags(e.target.value)}
                    placeholder="e.g. xrd, batch-14, draft"
                    aria-describedby="nb-tags-help"
                    className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder-muted-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                  <p id="nb-tags-help" className="mt-1 text-[12px] text-ink-faint">Separate tags with commas.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-ink-faint text-[11.5px] font-semibold">Attachments</p>
                    <button
                      type="button"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={uploadingAttachment}
                      className="text-primary hover:text-primary-hover font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {uploadingAttachment ? 'Uploading…' : '+ Add'}
                    </button>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadAttachment(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {(activePage.attachments || []).length === 0 ? (
                    <p className="text-ink-faint text-[11px]">No attachments yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(activePage.attachments || []).map((att) => (
                        <li key={att.id} className="flex items-center gap-1.5 group">
                          <Paperclip className="w-3 h-3 text-ink-faint shrink-0" />
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-ink-secondary hover:text-primary" title={att.filename}>
                            {att.filename}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-danger transition-opacity cursor-pointer shrink-0"
                            title="Remove attachment" aria-label="Remove attachment">
                            <X className="w-3 h-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg p-12">
            <BookOpen className="w-8 h-8 text-ink-faint mb-3" strokeWidth={1.5} />
            <p className="text-foreground text-sm font-medium">No notebook open</p>
            <p className="text-ink-secondary text-[13px] mt-1 max-w-sm">Pick one from My Notebooks.</p>
            <button onClick={goToLibrary} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-[12px] font-semibold rounded-[9px] transition-colors cursor-pointer">
              My Notebooks
            </button>
          </div>
        )}
      </div>

      {/* MODAL: INSERT IMAGE / FIGURE */}
      {isImageModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Insert figure</h4>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">ADD A CAPTION AND LABEL</p>
              </div>
              <button type="button" onClick={() => setIsImageModalOpen(false)} className="p-1 hover:bg-surface-raised text-ink-faint hover:text-foreground rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="notebookview-caption" className="block text-[11.5px] font-semibold text-muted-foreground mb-1">Caption</label>
                <input id="notebookview-caption"
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="e.g. Micrograph of the prepared experimental sample"
                  className="w-full bg-surface-raised border border-border-strong rounded-md px-3.5 py-2 text-foreground placeholder-muted-foreground text-xs focus:outline-none focus:border-border-strong"
                />
              </div>

              <div>
                <label htmlFor="notebookview-label-for-cross-references" className="block text-[11.5px] font-semibold text-muted-foreground mb-1">Label (for cross-references)</label>
                <input id="notebookview-label-for-cross-references"
                  type="text"
                  value={imageLabel}
                  onChange={(e) => setImageLabel(e.target.value)}
                  placeholder="fig:sample"
                  className="w-full bg-surface-raised border border-border-strong rounded-md px-3.5 py-2 text-foreground placeholder-muted-foreground text-xs focus:outline-none focus:border-border-strong font-mono"
                />
              </div>
            </div>

            <div className="flex border-b border-border">
              <button type="button" onClick={() => setImageTab('upload')} className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${imageTab === 'upload' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                Upload file
              </button>
              <button type="button" onClick={() => setImageTab('url')} className={`flex-1 pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${imageTab === 'url' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                Image URL
              </button>
            </div>

            {imageTab === 'upload' ? (
              <div className="space-y-4">
                <div onClick={() => fileInputRef.current?.click()} className="border border-dashed border-border-strong hover:border-border-strong rounded-md p-8 text-center cursor-pointer hover:bg-surface-sunken/20 transition-colors group">
                  <FileImage className="w-8 h-8 text-ink-faint group-hover:text-primary mx-auto mb-2.5 transition-colors" />
                  <span className="text-xs text-muted-foreground block font-medium">Choose an image file</span>
                  <span className="text-[9px] text-ink-faint block mt-1">PNG, JPG, or GIF up to 5 MB</span>
                  {uploadingImage && <div className="mt-3 text-[10px] text-primary font-mono animate-pulse">Uploading…</div>}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingImage(true);
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      const res = await fetch('/api/notebooks/upload', { method: 'POST', body: formData });
                      if (res.ok) {
                        const data = await res.json();
                        const captionPart = imageCaption ? `  \\caption{${imageCaption}}\n` : '';
                        const labelPart = imageLabel ? `  \\label{${imageLabel}}\n` : '';
                        const syntax = `\\begin{figure}\n  \\includegraphics{${data.url}}\n${captionPart}${labelPart}\\end{figure}\n`;
                        insertTextAtCursor(syntax);
                        setIsImageModalOpen(false);
                      }
                    } catch (err) {
                      console.error(err);
                      toast('Upload failed', 'The image couldn’t be uploaded. Try again.', 'error');
                    } finally {
                      setUploadingImage(false);
                    }
                  }}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="notebookview-image-url" className="block text-[11.5px] font-semibold text-muted-foreground mb-1">Image URL</label>
                  <input id="notebookview-image-url"
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full bg-surface-raised border border-border-strong rounded-md px-3.5 py-2 text-foreground placeholder-muted-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!imageUrl) return;
                    const captionPart = imageCaption ? `  \\caption{${imageCaption}}\n` : '';
                    const labelPart = imageLabel ? `  \\label{${imageLabel}}\n` : '';
                    const syntax = `\\begin{figure}\n  \\includegraphics{${imageUrl}}\n${captionPart}${labelPart}\\end{figure}\n`;
                    insertTextAtCursor(syntax);
                    setIsImageModalOpen(false);
                    setImageUrl('');
                  }}
                  disabled={!imageUrl}
                  className="w-full py-2 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:hover:bg-primary-hover text-primary-foreground rounded-full text-xs font-bold transition-colors cursor-pointer"
                >
                  Insert figure
                </button>
              </div>
            )}

            <div className="text-[10px] text-muted-foreground font-mono bg-surface-raised/50 p-3 rounded-lg border border-border/60 leading-relaxed">
              Tip: you can also paste screenshots into the editor with Ctrl+V.
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW NOTEBOOK */}
      {isNewNotebookModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold text-foreground">
                New notebook
              </h4>
              <button onClick={() => { setIsNewNotebookModalOpen(false); setNewNotebookLockedProjectId(null); }} className="p-1 hover:bg-surface-raised text-muted-foreground hover:text-foreground rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNotebook} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="notebookview-notebook-title" className="block text-[11.5px] font-semibold text-muted-foreground">Notebook title *</label>
                <input id="notebookview-notebook-title"
                  type="text"
                  required
                  placeholder="e.g. Lab notebook, Thesis notes"
                  value={newNotebookTitle}
                  onChange={(e) => setNewNotebookTitle(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>

              {newNotebookLockedProjectId ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-surface-sunken/40 border border-border rounded-md">
                  <FolderGit2 className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                  <span className="text-xs text-ink-secondary truncate">
                    Adding to <span className="font-semibold text-foreground">{projects.find(p => p.id === newNotebookLockedProjectId)?.name || 'this project'}</span>
                  </span>
                </div>
              ) : (
                <>
                  <div className="space-y-2 pt-2">
                    <label className="block text-[11.5px] font-semibold text-muted-foreground">Type</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
                        <input type="radio" checked={newNotebookIsPersonal} onChange={() => setNewNotebookIsPersonal(true)} className="accent-blue-500" />
                        Personal
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
                        <input type="radio" checked={!newNotebookIsPersonal} onChange={() => setNewNotebookIsPersonal(false)} className="accent-blue-500" />
                        Project
                      </label>
                    </div>
                  </div>

                  {!newNotebookIsPersonal && (
                    <div className="space-y-1 animate-fadeIn">
                      <label htmlFor="notebookview-project" className="block text-[11.5px] font-semibold text-muted-foreground">Project</label>
                      <select id="notebookview-project"
                        value={newNotebookProjectId}
                        onChange={(e) => setNewNotebookProjectId(e.target.value)}
                        required={!newNotebookIsPersonal}
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none focus:border-border-strong"
                      >
                        <option value="">Select a project…</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <label className="block text-[11.5px] font-semibold text-muted-foreground">Color (optional)</label>
                <div className="grid grid-cols-6 gap-2 max-h-24 overflow-y-auto p-1.5 bg-surface-sunken/40 rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setNewNotebookColor(null)}
                    className={`h-6 rounded-lg text-[9px] font-bold border transition-colors ${!newNotebookColor ? 'bg-surface-sunken border-ink-faint text-foreground' : 'bg-transparent border-border text-muted-foreground hover:text-foreground'}`}
                    title="Use the project color"
                  >
                    Default
                  </button>
                  {PROJECT_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewNotebookColor(c.value)}
                      className="h-6 rounded-lg border transition-colors"
                      style={{
                        backgroundColor: c.value,
                        borderColor: newNotebookColor === c.value ? '#ffffff' : 'transparent',
                        borderWidth: newNotebookColor === c.value ? '2px' : '1px'
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                <button type="button" onClick={() => { setIsNewNotebookModalOpen(false); setNewNotebookLockedProjectId(null); }} className="px-3.5 py-2 border border-border hover:border-border-strong text-muted-foreground hover:text-foreground rounded-md text-xs font-semibold cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full text-xs cursor-pointer">
                  Create notebook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXPORT PDF */}
      {isPdfExportModalOpen && activeNotebook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <FileDown className="w-4.5 h-4.5 text-primary" /> Export to PDF
              </h4>
              <button onClick={() => setIsPdfExportModalOpen(false)} className="p-1 hover:bg-surface-raised text-muted-foreground hover:text-foreground rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal">
              Export “{activeNotebook.title}” as a PDF.
            </p>

            <div className="space-y-3 pt-3 border-t border-border">
              <span className="text-[11.5px] font-semibold text-muted-foreground block">PDF options</span>

              <div className="space-y-1">
                <label htmlFor="notebookview-profile" className="text-[11.5px] text-ink-faint font-semibold">Profile</label>
                <select id="notebookview-profile"
                  value={exportProfile}
                  onChange={(e) => setExportProfile(e.target.value as any)}
                  className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-2 text-[11px] text-foreground focus:outline-none focus:border-border-strong cursor-pointer"
                >
                  <option value="research">Research report</option>
                  <option value="full">Full</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input type="checkbox" checked={exportIncludeCover} onChange={(e) => setExportIncludeCover(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5 rounded bg-surface-raised border-border cursor-pointer" />
                  Cover page
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input type="checkbox" checked={exportIncludeHeader} onChange={(e) => setExportIncludeHeader(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5 rounded bg-surface-raised border-border cursor-pointer" />
                  Header
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input type="checkbox" checked={exportIncludeFooter} onChange={(e) => setExportIncludeFooter(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5 rounded bg-surface-raised border-border cursor-pointer" />
                  Footer
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input type="checkbox" checked={exportIncludeSummary} onChange={(e) => setExportIncludeSummary(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5 rounded bg-surface-raised border-border cursor-pointer" />
                  Summary page
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button onClick={() => setIsPdfExportModalOpen(false)} disabled={isExportingPdf} className="px-3.5 py-2 border border-border hover:border-border-strong text-muted-foreground hover:text-foreground rounded-md text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                Cancel
              </button>
              <button onClick={requestPdfExport} disabled={isExportingPdf} className="px-4.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full text-xs cursor-pointer flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed">
                {isExportingPdf ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</>) : (<><FileDown className="w-3.5 h-3.5" /> Export PDF</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE/EDIT NOTEBOOK */}
      {editingNotebook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold text-foreground">Notebook settings</h4>
              <button onClick={() => setEditingNotebook(null)} className="p-1 hover:bg-surface-raised text-ink-faint hover:text-foreground rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNotebookSettings} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="notebookview-notebook-title-2" className="block text-[11.5px] font-semibold text-muted-foreground">Notebook title *</label>
                <input id="notebookview-notebook-title-2"
                  type="text"
                  required
                  value={editNotebookTitle}
                  onChange={(e) => setEditNotebookTitle(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11.5px] font-semibold text-muted-foreground">Color</label>
                <div className="grid grid-cols-6 gap-2 max-h-24 overflow-y-auto p-1.5 bg-surface-sunken/40 rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setEditNotebookColor(null)}
                    className={`h-6 rounded-lg text-[9px] font-bold border transition-colors ${!editNotebookColor ? 'bg-surface-sunken border-ink-faint text-foreground' : 'bg-transparent border-border text-muted-foreground hover:text-foreground'}`}
                    title="Use the project color"
                  >
                    Default
                  </button>
                  {PROJECT_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditNotebookColor(c.value)}
                      className="h-6 rounded-lg border transition-colors"
                      style={{
                        backgroundColor: c.value,
                        borderColor: editNotebookColor === c.value ? '#ffffff' : 'transparent',
                        borderWidth: editNotebookColor === c.value ? '2px' : '1px'
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                <button type="button" onClick={() => setEditingNotebook(null)} className="px-3.5 py-2 border border-border hover:border-border-strong text-muted-foreground hover:text-foreground rounded-md text-xs font-semibold cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full text-xs cursor-pointer">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VERSION HISTORY */}
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsHistoryOpen(false); }}>
          <div className="w-full max-w-2xl bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center shrink-0">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <History className="w-4.5 h-4.5 text-primary" /> Version history
              </h4>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1 hover:bg-surface-raised text-muted-foreground hover:text-foreground rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal shrink-0">
              A version is saved each time you save (Ctrl/Cmd+S), not on every autosave.
            </p>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="overflow-y-auto pr-1 space-y-1.5 border-r border-border/60 md:pr-3">
                {loadingRevisions ? (
                  <p className="text-xs text-ink-faint text-center py-8">Loading…</p>
                ) : revisions.length === 0 ? (
                  <p className="text-xs text-ink-faint text-center py-8">No saved versions yet.</p>
                ) : (
                  revisions.map((rev) => (
                    <button
                      key={rev.id}
                      onClick={() => previewRevision(rev.id)}
                      className={`w-full text-left px-3 py-2 rounded-md border transition-colors cursor-pointer ${previewingRevision?.id === rev.id ? 'bg-primary-soft border-primary/40' : 'border-border hover:border-border-strong hover:bg-surface-sunken/40'}`}
                    >
                      <p className="text-xs font-semibold text-foreground">{new Date(rev.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      <p className="text-[10px] text-ink-faint mt-0.5">{rev.authorName || 'Unknown'} · {rev.contentLength.toLocaleString()} chars</p>
                    </button>
                  ))
                )}
              </div>

              <div className="overflow-y-auto flex flex-col min-h-0">
                {previewingRevision ? (
                  <>
                    <pre className="flex-1 overflow-y-auto bg-surface-sunken/30 border border-border rounded-md p-3 text-[11px] font-mono text-ink-secondary whitespace-pre-wrap">{previewingRevision.content || '(empty)'}</pre>
                    <button
                      onClick={() => restoreRevision(previewingRevision.id)}
                      disabled={restoringRevisionId === previewingRevision.id}
                      className="mt-3 w-full py-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-foreground rounded-full text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      {restoringRevisionId === previewingRevision.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                      Restore this version
                    </button>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center text-xs text-ink-faint px-4">
                    Pick a version on the left to preview it.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND PALETTE */}
      {isPaletteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[70] pt-[12vh] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsPaletteOpen(false); }}>
          <div className="w-full max-w-lg bg-card border border-border-strong rounded-md shadow-[var(--shadow-modal)] overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border">
              <Command className="w-4 h-4 text-ink-faint shrink-0" />
              <input
                autoFocus
                type="text"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setPaletteActiveIndex(i => Math.min(i + 1, Math.max(filteredPaletteItems.length - 1, 0)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPaletteActiveIndex(i => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const item = filteredPaletteItems[paletteActiveIndex];
                    if (item) runPaletteItem(item);
                  } else if (e.key === 'Escape') {
                    setIsPaletteOpen(false);
                  }
                }}
                placeholder="Switch notebook, jump to a section, insert content…"
                className="flex-1 bg-transparent border-none text-sm text-foreground placeholder-muted-foreground focus:outline-none"
              />
            </div>
            <div className="max-h-96 overflow-y-auto py-1.5">
              {filteredPaletteItems.length === 0 ? (
                <p className="text-xs text-ink-faint text-center py-8">No matches.</p>
              ) : (
                filteredPaletteItems.map((item, i) => (
                  <button
                    key={item.id}
                    onMouseEnter={() => setPaletteActiveIndex(i)}
                    onClick={() => runPaletteItem(item)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left cursor-pointer transition-colors ${i === paletteActiveIndex ? 'bg-surface-sunken' : ''}`}
                  >
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="text-[11.5px] font-mono text-ink-faint shrink-0 w-24 truncate">{item.group}</span>
                      <span className="text-[13px] text-foreground truncate">{item.label}</span>
                    </span>
                    {item.sublabel && <span className="text-[10px] text-ink-faint font-mono shrink-0">{item.sublabel}</span>}
                    {i === paletteActiveIndex && <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comments drawer — project-linked notebooks */}
      {showComments && activeNotebook?.project && activePage && (
        <div
          className="fixed inset-0 z-[60] flex justify-end bg-black/20"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowComments(false); setPendingCommentAnchor(null); refreshPageReviewMeta(); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowComments(false); setPendingCommentAnchor(null); refreshPageReviewMeta(); } }}
        >
          <div role="dialog" aria-modal="true" aria-label="Comments" className="w-full max-w-sm h-full bg-card border-l border-border shadow-[var(--shadow-modal)] flex flex-col p-4">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-foreground truncate">{activeNotebook.title}</p>
                <p className="text-[11px] text-ink-faint">{activeNotebook.project.name}</p>
              </div>
              <button autoFocus onClick={() => { setShowComments(false); setPendingCommentAnchor(null); refreshPageReviewMeta(); }} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken" aria-label="Close comments">
                <X className="w-4 h-4" />
              </button>
            </div>
            {previewTab === 'live' && (
              <p className="text-[11px] text-ink-faint mb-2 shrink-0">Select text in the preview to attach a comment to it.</p>
            )}
            <NotebookCommentsPanel
              notebookId={activeNotebook.id}
              pageId={activePage.id}
              canComment
              anchorQuote={pendingCommentAnchor}
              onAnchorClear={() => setPendingCommentAnchor(null)}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
