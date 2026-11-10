import { Font } from '@react-pdf/renderer';
import path from 'node:path';

const fontPath = (weight: '400Regular' | '600SemiBold' | '700Bold') => path.join(process.cwd(), 'node_modules', '@expo-google-fonts', 'inter', weight, `Inter_${weight}.ttf`);
Font.register({ family: 'Inter', fonts: [
  { src: fontPath('400Regular'), fontWeight: 400 },
  { src: fontPath('600SemiBold'), fontWeight: 600 },
  { src: fontPath('700Bold'), fontWeight: 700 },
] });
Font.registerHyphenationCallback(word => [word]);

/** Normalize typography that commonly renders as a missing glyph in PDF fonts. */
export const pdfText = (value: string | null | undefined): string => (value ?? '')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2026/g, '...').replace(/\u00a0/g, ' ')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/\p{Extended_Pictographic}/gu, glyph => ['©', '®', '™'].includes(glyph) ? glyph : '')
  .replace(/[\uFE0E\uFE0F\u200D\u20E3]/gu, '');
