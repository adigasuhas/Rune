import { RuneMark } from '@/components/brand/RuneMark';
import { FeatureIcon, type FeatureKey } from '@/components/marketing/FeatureIcons';

/**
 * Identity panel beside the account forms (lg+ only): the figure, the line,
 * and a quiet reminder of what's on the other side of the form. Nothing here
 * is interactive, so the form stays the only thing asking for attention.
 */
const WAITING: { key: FeatureKey; text: string }[] = [
  { key: 'today', text: 'Your day, in hours you can actually see' },
  { key: 'notebook', text: 'A lab notebook that speaks LaTeX' },
  { key: 'runs', text: 'Long jobs, tracked without babysitting' },
];

export function AuthAside() {
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden px-12 py-16 xl:px-16">
      <div className="ruled pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="relative">
        <RuneMark size={168} animated className="-ml-3 text-foreground" />
        <p className="mt-8 text-[13px] font-medium text-ink-secondary">One person. Too many things.</p>
        <p className="display mt-3 text-[42px] xl:text-[48px]">
          You, with a few <span className="block italic text-primary">extra hands.</span>
        </p>
        <ul className="mt-12 space-y-3.5">
          {WAITING.map((w) => (
            <li key={w.key} className="flex items-center gap-3 text-[15px] text-ink-secondary">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-border bg-surface text-foreground">
                <FeatureIcon name={w.key} size={19} />
              </span>
              {w.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
