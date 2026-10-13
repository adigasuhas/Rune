'use client';

import { LoadError } from '@/components/LoadError';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, Search } from 'lucide-react';
import { WALL_NOTE_COLORS, WALL_NOTE_SIZES, WallNoteSize } from '@/lib/colors';
import { Button, EmptyState, PageHeader } from '@/components/ui';

interface Project {
  id: string;
  name: string;
  color: string;
}

interface WallNote {
  id: string;
  projectId: string;
  text: string;
  color: string;
  size: WallNoteSize;
  x: number;
  y: number;
  zIndex: number;
}

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1400;

export function WallView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [notes, setNotes] = useState<WallNote[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<WallNote[]>([]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const dragState = useRef<{
    noteId: string;
    startMouseX: number;
    startMouseY: number;
    startNoteX: number;
    startNoteY: number;
    moved: boolean;
  } | null>(null);

  // Load the project list once, then select whichever project the URL
  // names (?projectId=...) or fall back to the first one - lets Projects
  // deep-link straight into a specific board.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data: Project[]) => {
        setProjects(data);
        const fromUrl = searchParams.get('projectId');
        if (fromUrl && data.some((p) => p.id === fromUrl)) {
          setSelectedProjectId(fromUrl);
        } else if (data.length > 0) {
          setSelectedProjectId(data[0].id);
        }
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedProjectId) {
      setNotes([]);
      return;
    }
    setLoadingNotes(true);
    fetch(`/api/projects/${selectedProjectId}/wall`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WallNote[]) => setNotes(data))
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));
  }, [selectedProjectId]);

  const switchProject = (id: string) => {
    setSelectedProjectId(id);
    router.replace(`/wall?projectId=${id}`);
  };

  const updateNoteLocal = (id: string, patch: Partial<WallNote>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const persistNote = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      try {
        await fetch(`/api/projects/${selectedProjectId}/wall/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });
      } catch (err) {
        console.error('Failed to save wall note:', err);
      }
    },
    [selectedProjectId]
  );

  const createNote = async (x: number, y: number) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/wall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: Math.max(0, x),
          y: Math.max(0, y),
          color: WALL_NOTE_COLORS[0].value,
          size: 'MEDIUM',
          text: ''
        })
      });
      if (res.ok) {
        const note = await res.json();
        setNotes((prev) => [...prev, note]);
      }
    } catch (err) {
      console.error('Failed to create wall note:', err);
    }
  };

  const deleteNote = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`/api/projects/${selectedProjectId}/wall/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete wall note:', err);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft - 110;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop - 110;
    createNote(Math.max(0, x), Math.max(0, y));
  };

  const bringToFront = (note: WallNote) => {
    const maxZ = notesRef.current.reduce((max, n) => Math.max(max, n.zIndex), 0);
    if (note.zIndex <= maxZ) {
      updateNoteLocal(note.id, { zIndex: maxZ + 1 });
    }
  };

  const handleDragHandleMouseDown = (e: React.MouseEvent, note: WallNote) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      noteId: note.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNoteX: note.x,
      startNoteY: note.y,
      moved: false
    };
    bringToFront(note);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      updateNoteLocal(drag.noteId, {
        x: Math.max(0, drag.startNoteX + dx),
        y: Math.max(0, drag.startNoteY + dy)
      });
    };
    const handleMouseUp = () => {
      const drag = dragState.current;
      if (!drag) return;
      dragState.current = null;
      const note = notesRef.current.find((n) => n.id === drag.noteId);
      if (note && drag.moved) {
        persistNote(note.id, { x: note.x, y: note.y, bringToFront: true });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [persistNote]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const matches = (n: WallNote) => (!q || n.text.toLowerCase().includes(q)) && (!colorFilter || n.color === colorFilter);
  const shown = notes.filter(matches).length;
  const colorsInUse = WALL_NOTE_COLORS.filter((c) => notes.some((n) => n.color === c.value));

  // Arrange every note into tidy rows, grouped by colour, and save the result.
  const tidyUp = () => {
    const order = [...notes].sort((x, y) => WALL_NOTE_COLORS.findIndex((c) => c.value === x.color) - WALL_NOTE_COLORS.findIndex((c) => c.value === y.color) || x.y - y.y || x.x - y.x);
    const width = Math.max(720, (canvasRef.current?.clientWidth ?? 1100) - 48);
    let x = 32, y = 32, rowH = 0;
    const placed = order.map((n) => {
      const d = WALL_NOTE_SIZES[n.size];
      if (x + d.width > width && x > 32) { x = 32; y += rowH + 28; rowH = 0; }
      const pos = { id: n.id, x, y };
      x += d.width + 28; rowH = Math.max(rowH, d.height);
      return pos;
    });
    setNotes((prev) => prev.map((n) => { const p = placed.find((pp) => pp.id === n.id); return p ? { ...n, x: p.x, y: p.y } : n; }));
    placed.forEach((p) => persistNote(p.id, { x: p.x, y: p.y }));
    canvasRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 text-foreground">
      <PageHeader
        className=""
        title="Wall"
        subtitle="Loose ideas, questions and references for a project - the things that aren't tasks yet. Double-click the board to add a note."
      />

      {loadingProjects ? (
        <div className="h-96 bg-surface-raised rounded-[14px] animate-pulse" />
      ) : loadFailed ? (
        <LoadError what="your projects" onRetry={() => { setLoadFailed(false); setLoadingProjects(true); setReloadKey((k) => k + 1); }} />
      ) : projects.length === 0 ? (
        <EmptyState
          spot="wall"
          title="The Wall belongs to a project"
          message="Create a project first, then collect its loose ideas here."
          action={<Button onClick={() => router.push('/projects')}>Go to Projects</Button>}
        />
      ) : (
        <>
          {/* Which board */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
            <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="Project">
              {projects.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={p.id === selectedProjectId}
                  onClick={() => switchProject(p.id)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors ${p.id === selectedProjectId ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'}`}
                >
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: p.color }} aria-hidden="true" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Board tools */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find on this board…"
                aria-label="Find on this board"
                className="h-9 w-60 rounded-[9px] border border-border bg-surface pl-9 pr-3 text-[13.5px] placeholder-ink-faint focus:border-border-strong focus:outline-none"
              />
            </div>
            {colorsInUse.length > 1 && (
              <div className="flex items-center gap-1" role="group" aria-label="Show only one colour">
                {colorsInUse.map((c) => {
                  const on = colorFilter === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={() => setColorFilter(on ? null : c.value)}
                      aria-pressed={on}
                      title={on ? `${c.name} (clear)` : `Only ${c.name.toLowerCase()} notes`}
                      className={`grid h-8 w-8 place-items-center rounded-[8px] transition-colors ${on ? 'bg-surface shadow-[0_0_0_1px_var(--border-strong)]' : 'hover:bg-surface-sunken'}`}
                    >
                      <span className="h-3.5 w-3.5 rounded-[4px] border border-black/10" style={{ backgroundColor: c.value }} />
                    </button>
                  );
                })}
              </div>
            )}
            <span className="text-[13px] text-ink-faint tabular-nums">
              {q || colorFilter ? `${shown} of ${notes.length} notes` : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {notes.length > 1 && <Button variant="ghost" onClick={tidyUp} title="Arrange the notes in rows, grouped by colour">Tidy up</Button>}
              <Button onClick={() => createNote(40 + Math.random() * 200, 40 + Math.random() * 120)}><Plus className="w-4 h-4" /> New note</Button>
            </div>
          </div>

          <div
            ref={canvasRef}
            onDoubleClick={handleCanvasDoubleClick}
            className="wall-board relative w-full h-[68vh] overflow-auto rounded-[14px] border border-border bg-surface"
          >
            {!loadingNotes && notes.length === 0 && (
              <div className="sticky top-0 left-0 h-full flex items-center justify-center pointer-events-none z-10">
                <EmptyState spot="wall" title={`Nothing on ${selectedProject?.name ?? 'this board'} yet`} message="Double-click anywhere on the board to pin a note: a question, a hunch, a paper to read." />
              </div>
            )}
            <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, marginTop: notes.length === 0 && !loadingNotes ? '-68vh' : 0 }}>
              {loadingNotes && (
                <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-faint">Loading the board…</div>
              )}
              {notes.map((note) => (
                <WallNoteCard
                  key={note.id}
                  note={note}
                  dimmed={!matches(note)}
                  onDragHandleMouseDown={(e) => handleDragHandleMouseDown(e, note)}
                  onFocus={() => bringToFront(note)}
                  onTextChange={(text) => updateNoteLocal(note.id, { text })}
                  onTextBlur={(text) => persistNote(note.id, { text })}
                  onColorChange={(color) => {
                    updateNoteLocal(note.id, { color });
                    persistNote(note.id, { color });
                  }}
                  onSizeChange={(size) => {
                    updateNoteLocal(note.id, { size });
                    persistNote(note.id, { size });
                  }}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A small, stable tilt per note, so the board looks pinned by hand rather than gridded. */
function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.45;
}

function WallNoteCard({
  note,
  dimmed,
  onDragHandleMouseDown,
  onFocus,
  onTextChange,
  onTextBlur,
  onColorChange,
  onSizeChange,
  onDelete
}: {
  note: WallNote;
  dimmed: boolean;
  onDragHandleMouseDown: (e: React.MouseEvent) => void;
  onFocus: () => void;
  onTextChange: (text: string) => void;
  onTextBlur: (text: string) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: WallNoteSize) => void;
  onDelete: () => void;
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const dims = WALL_NOTE_SIZES[note.size];

  return (
    // Paper sticky notes: the stored colour, softened toward paper so the
    // board reads calm; ink stays a fixed dark neutral in both themes since
    // the note's own colour is its surface. Controls appear on hover/focus.
    <div
      className="wall-note group absolute flex flex-col rounded-[3px] transition-[opacity,box-shadow] duration-200"
      style={{
        left: note.x,
        top: note.y,
        width: dims.width,
        height: dims.height,
        zIndex: note.zIndex,
        background: `color-mix(in srgb, ${note.color} 62%, #fbf8ef)`,
        color: '#2a2a1f',
        transform: `rotate(${tiltFor(note.id)}deg)`,
        opacity: dimmed ? 0.22 : 1,
      }}
      onMouseDown={onFocus}
    >
      {/* the tape is the drag handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 cursor-grab rounded-[2px] bg-white/45 shadow-[0_1px_1px_rgb(0_0_0/0.06)] backdrop-blur-[1px] active:cursor-grabbing"
        title="Drag to move"
        aria-hidden="true"
      />
      <div className="flex shrink-0 items-center justify-end gap-1 px-2 pt-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setShowColorPicker((v) => !v)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded-full border border-black/25"
            style={{ backgroundColor: note.color }}
            title="Change colour"
            aria-label="Change colour"
          />
          {showColorPicker && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute right-0 top-6 z-10 flex w-32 flex-wrap gap-1.5 rounded-[10px] border border-border bg-surface p-2.5 shadow-[0_12px_28px_-14px_rgb(0_0_0/0.35)]"
            >
              {WALL_NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { onColorChange(c.value); setShowColorPicker(false); }}
                  className={`h-5 w-5 cursor-pointer rounded-full border transition-transform ${note.color === c.value ? 'scale-110 border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  aria-label={c.name}
                />
              ))}
            </div>
          )}
        </div>
        {(Object.keys(WALL_NOTE_SIZES) as WallNoteSize[]).map((sz) => (
          <button
            key={sz}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onSizeChange(sz)}
            className={`h-5 w-5 cursor-pointer rounded-[4px] text-[10.5px] font-semibold transition-colors ${note.size === sz ? 'bg-black/15' : 'opacity-60 hover:opacity-100'}`}
            title={`${WALL_NOTE_SIZES[sz].label} size`}
            aria-label={`${WALL_NOTE_SIZES[sz].label} size`}
          >
            {WALL_NOTE_SIZES[sz].label}
          </button>
        ))}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="grid h-5 w-5 cursor-pointer place-items-center rounded-[4px] opacity-60 hover:bg-black/10 hover:opacity-100"
          title="Delete note"
          aria-label="Delete note"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={note.text}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={(e) => onTextBlur(e.target.value)}
        placeholder="Write something…"
        aria-label="Note"
        className="w-full flex-1 resize-none bg-transparent px-4 pb-3 pt-1 font-serif text-[16px] leading-snug placeholder-black/40 focus:outline-none"
        style={{ color: '#2a2a1f' }}
      />
    </div>
  );
}
