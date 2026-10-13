export interface LatexAutocompleteItem {
  key: string;
  label: string;
}

/**
 * Floating suggestion list for \cite{ / \ref{ / \eqref{ - anchored to the
 * caret position inside the notebook editor's textarea (see
 * `getCaretCoordinates`). Purely presentational; the parent owns the
 * trigger-detection, filtering, and keyboard navigation.
 */
export function LatexAutocomplete({
  top,
  left,
  items,
  activeIndex,
  onSelect,
  onHover,
}: {
  top: number;
  left: number;
  items: LatexAutocompleteItem[];
  activeIndex: number;
  onSelect: (item: LatexAutocompleteItem) => void;
  onHover: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      // mousedown (not click) so this fires before the textarea's onBlur
      // would otherwise close the dropdown first.
      onMouseDown={(e) => e.preventDefault()}
      style={{ top, left }}
      className="absolute z-30 w-64 max-h-56 overflow-y-auto bg-card border border-border-strong rounded-md shadow-[var(--shadow-modal)] py-1"
    >
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => onHover(i)}
          onClick={() => onSelect(item)}
          className={`w-full text-left px-2.5 py-1.5 text-xs cursor-pointer ${i === activeIndex ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-surface-sunken'}`}
        >
          <span className="font-mono font-semibold">{item.key}</span>
          {item.label && <span className="block text-[10px] text-ink-faint truncate mt-0.5">{item.label}</span>}
        </button>
      ))}
    </div>
  );
}
