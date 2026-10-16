'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MotionConfig, Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { moveItem } from '@/lib/taskOrder';

/**
 * A task list the user arranges by hand. Only the grip handle starts a drag
 * (so clicking a row's checkbox, title or actions never moves it, and a
 * drag never fires them). With a mouse it sits in the left gutter and shows
 * on hover/focus; on touch screens (no hover) it's always shown, in the row
 * itself as a finger-sized target, and drags without a long-press.
 * Rows make room as you drag, so the drop position is always visible.
 * Keyboard: focus a handle, then Arrow Up / Arrow Down moves the task.
 *
 * `onCommit(nextIds, movedId)` fires once per drop/keypress with the new
 * order; the caller persists it.
 */
export function ReorderableTaskList<T extends { id: string; name: string }>({
  tasks,
  renderRow,
  onCommit,
}: {
  tasks: T[];
  renderRow: (task: T, handle: React.ReactNode) => React.ReactNode;
  onCommit: (nextIds: string[], movedId: string) => void;
}) {
  const incoming = tasks.map((t) => t.id);
  const incomingKey = incoming.join('|');
  const [order, setOrder] = useState<string[]>(incoming);
  const orderRef = useRef(order);
  useEffect(() => { orderRef.current = order; }, [order]);
  const dragging = useRef<string | null>(null);
  const [announce, setAnnounce] = useState('');

  // Follow the list from outside (refresh, filters, a task added or done)
  // whenever no drag is under way.
  useEffect(() => {
    if (!dragging.current) setOrder(incomingKey ? incomingKey.split('|') : []);
  }, [incomingKey]);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visible = order.filter((id) => byId.has(id));

  const moveByKey = (id: string, delta: number) => {
    const from = visible.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= visible.length) return;
    const next = moveItem(visible, from, to);
    setOrder(next);
    onCommit(next, id);
    setAnnounce(`${byId.get(id)?.name ?? 'Task'} moved to position ${to + 1} of ${next.length}.`);
  };

  return (
    <MotionConfig reducedMotion="user">
      <Reorder.Group as="div" axis="y" values={visible} onReorder={setOrder} className="divide-y divide-border">
        {visible.map((id, index) => (
          <Row
            key={id}
            id={id}
            label={byId.get(id)!.name}
            position={index + 1}
            total={visible.length}
            onDragStart={() => { dragging.current = id; }}
            onDragEnd={() => {
              const moved = dragging.current;
              const final = orderRef.current;
              dragging.current = null;
              if (moved && final.join('|') !== incomingKey) {
                onCommit(final, moved);
                setAnnounce(`${byId.get(moved)?.name ?? 'Task'} moved to position ${final.indexOf(moved) + 1} of ${final.length}.`);
              }
            }}
            onKey={moveByKey}
            render={(handle) => renderRow(byId.get(id)!, handle)}
          />
        ))}
      </Reorder.Group>
      <span className="sr-only" aria-live="polite">{announce}</span>
    </MotionConfig>
  );
}

function Row({
  id, label, position, total, onDragStart, onDragEnd, onKey, render,
}: {
  id: string;
  label: string;
  position: number;
  total: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onKey: (id: string, delta: number) => void;
  render: (handle: React.ReactNode) => React.ReactNode;
}) {
  const controls = useDragControls();
  const handle = (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          onKey(id, e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      aria-label={`Reorder ${label} (position ${position} of ${total}). Use the arrow keys to move it.`}
      title="Drag to reorder"
      className="absolute -left-5 top-1/2 -translate-y-1/2 grid h-7 w-4 place-items-center rounded-[4px] text-ink-faint touch-none cursor-grab active:cursor-grabbing opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:-ml-2 [@media(hover:none)]:-mr-1 [@media(hover:none)]:h-10 [@media(hover:none)]:w-7 [@media(hover:none)]:opacity-70"
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-modal)', zIndex: 10 }}
      className="relative bg-background"
      data-reorder-id={id}
    >
      {render(handle)}
    </Reorder.Item>
  );
}
