import { RuneMark } from '@/components/brand/RuneMark';

/**
 * The Rune lockup: the four-armed mark beside the "Rune" wordmark, set in
 * the UI typeface (Geist) at semibold with tight tracking - the mark carries
 * the personality, the wordmark stays plain. Both inherit the text colour,
 * so the same lockup works on light and dark grounds with no image swap.
 *
 * `markOnly` drops the wordmark (collapsed sidebar, tight spaces).
 */
const SIZES = {
  sm: { mark: 30, text: 'text-[19px]', gap: 'gap-2' },
  md: { mark: 38, text: 'text-[23px]', gap: 'gap-2.5' },
  lg: { mark: 52, text: 'text-[31px]', gap: 'gap-3' },
} as const;

export function Logo({ size = 'md', animated = false, markOnly = false }: { size?: keyof typeof SIZES; animated?: boolean; markOnly?: boolean }) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap} text-foreground`}>
      <RuneMark size={s.mark} animated={animated} title={markOnly ? 'Rune' : undefined} />
      {!markOnly && (
        <span className={`${s.text} font-semibold leading-none tracking-[-0.035em]`}>Rune</span>
      )}
    </span>
  );
}
