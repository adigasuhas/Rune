export interface ProjectColor {
  name: string;
  value: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  // Blues
  { name: 'Slate Blue', value: '#475569' },
  { name: 'Steel Blue', value: '#4682B4' },
  { name: 'Navy', value: '#1E3A8A' },
  { name: 'Indigo', value: '#3730A3' },
  { name: 'Royal Blue', value: '#2563EB' },
  
  // Greens
  { name: 'Emerald', value: '#059669' },
  { name: 'Sage', value: '#15803D' },
  { name: 'Olive', value: '#556B2F' },
  { name: 'Moss Green', value: '#4D7C0F' },
  { name: 'Forest Green', value: '#14532D' },
  
  // Reds / Pinks
  { name: 'Brick Red', value: '#B91C1C' },
  { name: 'Crimson', value: '#991B1B' },
  { name: 'Rose', value: '#E11D48' },
  { name: 'Burgundy', value: '#800020' },
  { name: 'Coral', value: '#E07A5F' },
  
  // Oranges / Yellows
  { name: 'Amber', value: '#D97706' },
  { name: 'Burnt Orange', value: '#C2410C' },
  { name: 'Copper', value: '#B87333' },
  { name: 'Sand', value: '#C6A052' },
  { name: 'Chocolate', value: '#7B3F00' },
  
  // Purples
  { name: 'Violet', value: '#7C3AED' },
  { name: 'Lavender', value: '#6D28D9' },
  { name: 'Plum', value: '#581C87' },
  { name: 'Deep Purple', value: '#4C1D95' },
  { name: 'Mauve', value: '#8A4F7D' },
  
  // Teals / Cyans
  { name: 'Teal', value: '#0D9488' },
  { name: 'Cyan', value: '#0891B2' },
  { name: 'Dark Teal', value: '#115E59' },
  
  // Neutrals / Charcoals
  { name: 'Graphite', value: '#3F3F46' },
  { name: 'Silver', value: '#71717A' },
  { name: 'Stone', value: '#52525B' },
  { name: 'Charcoal', value: '#27272A' }
];

export function getProjectColorName(value: string): string {
  const color = PROJECT_COLORS.find(c => c.value.toLowerCase() === value.toLowerCase());
  return color ? color.name : 'Slate';
}

/**
 * Wall sticky-note palette (Phase 8) - a separate, smaller set from
 * PROJECT_COLORS. Project tag colors are small dots on a dark background and
 * lean saturated/dark; a note covers a much larger area as a translucent
 * glass wash (see WallView.tsx), so these are deliberately lighter/warmer -
 * legible as a subtle tint rather than a solid, skeuomorphic Post-it block.
 */
export const WALL_NOTE_COLORS: ProjectColor[] = [
  { name: 'Yellow', value: '#FDE68A' },
  { name: 'Peach', value: '#FDBA8C' },
  { name: 'Coral', value: '#FCA5A5' },
  { name: 'Rose', value: '#F9A8D4' },
  { name: 'Lavender', value: '#C4B5FD' },
  { name: 'Sky', value: '#93C5FD' },
  { name: 'Mint', value: '#6EE7B7' },
  { name: 'Sand', value: '#D6D3D1' }
];

export type WallNoteSize = 'SMALL' | 'MEDIUM' | 'LARGE';

/** Fixed note dimensions in px - freeform resize is out of scope for v1 (see docs/Plan_overhaul.md Phase 8). */
export const WALL_NOTE_SIZES: Record<WallNoteSize, { label: string; width: number; height: number }> = {
  SMALL: { label: 'S', width: 160, height: 160 },
  MEDIUM: { label: 'M', width: 220, height: 220 },
  LARGE: { label: 'L', width: 300, height: 300 }
};
