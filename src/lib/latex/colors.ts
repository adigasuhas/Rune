/**
 * Colours for \textcolor and \colorbox, read the way xcolor reads them:
 *
 *   \textcolor{red}{…}             a named colour
 *   \textcolor{red!40}{…}          40% red, 60% white (xcolor mixing)
 *   \textcolor{red!40!blue}{…}     40% red, 60% blue
 *   \textcolor[HTML]{EF4444}{…}    the toolbar's choice; real LaTeX
 *   \textcolor[rgb]{0.9,0.2,0.2}{…}, [RGB]{230,50,50}, [gray]{0.4}
 *   \textcolor{#ef4444}{…}         older toolbar output, still accepted
 *   \colorbox{rgba(…)}{…}          older highlight output, still accepted
 *
 * Every result is a plain `#rrggbb` or `rgba(r, g, b, a)` built from numbers
 * here, so nothing the writer types reaches the style attribute as-is. An
 * unreadable colour gives null - the text keeps its normal colour rather
 * than turning white and vanishing on the page.
 */

type RGB = [number, number, number];

// The names xcolor knows without options. Kept to the same soft tones the
// toolbar uses, so "red" here and the toolbar's red are the same red.
const NAMED: Record<string, RGB> = {
  red: [0xef, 0x44, 0x44],
  green: [0x10, 0xb9, 0x81],
  blue: [0x3b, 0x82, 0xf6],
  cyan: [0x06, 0xb6, 0xd4],
  magenta: [0xd9, 0x46, 0xef],
  yellow: [0xf5, 0x9e, 0x0b],
  black: [0, 0, 0],
  white: [0xff, 0xff, 0xff],
  gray: [0x71, 0x71, 0x7a],
  grey: [0x71, 0x71, 0x7a],
  darkgray: [0x3f, 0x3f, 0x46],
  lightgray: [0xd4, 0xd4, 0xd8],
  zinc: [0xd4, 0xd4, 0xd8],
  brown: [0x92, 0x40, 0x0e],
  lime: [0x84, 0xcc, 0x16],
  olive: [0x6b, 0x70, 0x1f],
  orange: [0xf9, 0x73, 0x16],
  pink: [0xec, 0x48, 0x99],
  purple: [0x8b, 0x5c, 0xf6],
  teal: [0x0d, 0x94, 0x88],
  violet: [0x7c, 0x3a, 0xed],
  navy: [0x1e, 0x2a, 0x78],
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
const toHex = ([r, g, b]: RGB) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

function parseHex(v: string): RGB | null {
  const m = v.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(m)) return [0, 1, 2].map((i) => parseInt(m[i] + m[i], 16)) as RGB;
  if (/^[0-9a-f]{6}$/i.test(m)) return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)) as RGB;
  return null;
}

function numbers(v: string, count: number): number[] | null {
  const parts = v.split(',').map((p) => p.trim());
  if (parts.length !== count || parts.some((p) => !/^-?\d*\.?\d+$/.test(p))) return null;
  return parts.map(Number);
}

/** A colour expression without a model: a name, a mix ("red!40!blue"), or a hex value. */
function parseExpression(v: string): RGB | null {
  const spec = v.trim().toLowerCase();
  if (spec.startsWith('#')) return parseHex(spec);
  const parts = spec.split('!');
  let color = NAMED[parts[0]];
  if (!color) return null;
  // xcolor: c1!p!c2!q!c3 ... - each step mixes p% of what's built so far with the next colour (white if none).
  for (let i = 1; i < parts.length; i += 2) {
    const pct = Number(parts[i]);
    if (!Number.isFinite(pct)) return null;
    const other = parts[i + 1] !== undefined ? NAMED[parts[i + 1]] : NAMED.white;
    if (!other) return null;
    const p = clamp(pct, 0, 100) / 100;
    color = color.map((c, k) => c * p + other[k] * (1 - p)) as RGB;
  }
  return color;
}

/** rgb(...) / rgba(...) as older notebooks stored highlights. */
function parseCss(v: string): { rgb: RGB; alpha: number } | null {
  const m = v.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (!m) return null;
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

export interface LatexColor {
  /** The CSS colour to use. */
  css: string;
  /** The solid colour, for contrast decisions. */
  rgb: RGB;
  alpha: number;
}

/**
 * The colour for `\textcolor` / `\colorbox` arguments. `model` is the
 * optional `[HTML]`-style argument, `spec` the colour itself.
 */
export function resolveLatexColor(model: string | null, spec: string): LatexColor | null {
  const s = (spec || '').trim();
  if (!s) return null;
  let rgb: RGB | null = null;
  let alpha = 1;
  switch ((model || '').trim()) {
    case '':
      if (/^rgba?\(/i.test(s)) {
        const css = parseCss(s);
        if (css) ({ rgb, alpha } = css);
      } else rgb = parseExpression(s);
      break;
    case 'HTML':
      rgb = parseHex(s);
      break;
    case 'rgb': {
      const n = numbers(s, 3);
      if (n) rgb = n.map((x) => clamp(x, 0, 1) * 255) as RGB;
      break;
    }
    case 'RGB': {
      const n = numbers(s, 3);
      if (n) rgb = n.map((x) => clamp(x, 0, 255)) as RGB;
      break;
    }
    case 'gray': {
      const n = numbers(s, 1);
      if (n) rgb = [0, 0, 0].map(() => clamp(n[0], 0, 1) * 255) as RGB;
      break;
    }
    default:
      return null;
  }
  if (!rgb) return null;
  rgb = rgb.map((c) => Math.round(c)) as RGB;
  const a = clamp(alpha, 0, 1);
  return { css: a < 1 ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : toHex(rgb), rgb, alpha: a };
}

/** Relative luminance (0 black - 1 white) of a colour laid over white. */
export function luminanceOnWhite({ rgb, alpha }: LatexColor): number {
  const [r, g, b] = rgb.map((c) => {
    const v = (c * alpha + 255 * (1 - alpha)) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A solid highlight: `pct`% of `hex` over white, as xcolor's `!pct` would give - for \colorbox[HTML]{…}. */
export function tintHex(hex: string, pct: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return 'FFFFFF';
  const p = clamp(pct, 0, 100) / 100;
  return toHex(rgb.map((c) => c * p + 255 * (1 - p)) as RGB).slice(1).toUpperCase();
}
