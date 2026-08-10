/**
 * Brand colour, made safe to read.
 *
 * A brand's colour is chosen to look like the brand, not to be legible as
 * small text. Measured across the live roster on 2026-08-10, EVERY sampled
 * brand fails WCAG AA (4.5:1) when its raw accent is used as body text on a
 * white card:
 *
 *     Lemme              #FFC700   1.56:1
 *     Goli               #F9A825   1.97:1
 *     LeeFar             #8BC34A   2.10:1
 *     Cata-Kor           #00C853   2.24:1
 *     Peach Slices       #FF8A65   2.31:1
 *     Physicians Choice  #2196F3   3.12:1
 *     …14 of 14 sampled brands failed
 *
 * The brand portal was doing exactly that — creator handles and GMV figures in
 * the brand's own colour — so Lemme's clients were reading their roster at
 * 1.56:1, which is barely distinguishable from the background.
 *
 * The fix is NOT to drop brand colour. It is to use the raw colour where it
 * belongs (fills, bars, chart strokes, chips, borders — none of which are
 * text) and a darkened variant where the pixel has to be READ. `readableOn`
 * walks the colour toward black until it clears the threshold, so a yellow
 * brand still reads as yellow-brown rather than turning into grey.
 */

interface Rgb { r: number; g: number; b: number }

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const toHex = ({ r, g, b }: Rgb) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function luminance({ r, g, b }: Rgb): number {
  const [R, G, B] = [r, g, b]
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const A = parseHex(a);
  const B = parseHex(b);
  if (!A || !B) return 1;
  const [hi, lo] = [luminance(A), luminance(B)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A version of `color` that is readable as text on `background`.
 *
 * Darkens toward black in small steps until the ratio clears `target`, so hue
 * survives — #FFC700 becomes a deep amber, not grey. Returns the input
 * unchanged when it already passes, and falls back to the input if it cannot
 * be parsed (better a brand colour than a crash).
 *
 * Default target is 4.5, WCAG AA for body text. Pass 3 for text at 18pt+ or
 * for icon glyphs, which AA treats as large.
 */
export function readableOn(color: string | null | undefined, background = '#FFFFFF', target = 4.5): string {
  if (!color) return 'currentColor';
  const rgb = parseHex(color);
  if (!rgb) return color;
  if (contrastRatio(color, background) >= target) return color;

  // 40 steps of 2.5% is enough to take even #FFFF00 past AA on white while
  // keeping the walk cheap; bail out at black rather than looping forever.
  let cur = { ...rgb };
  for (let i = 0; i < 40; i++) {
    cur = { r: cur.r * 0.975, g: cur.g * 0.975, b: cur.b * 0.975 };
    if (contrastRatio(toHex(cur), background) >= target) return toHex(cur);
  }
  return toHex(cur);
}
