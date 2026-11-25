import {
  Anchor,
  Button,
  createTheme,
  type MantineColorsTuple,
  Title,
} from '@mantine/core';

// Brand tokens (styles/tokens.css, copied from the shop.catalog-demo.example child theme)
// mapped into Mantine. Shade 6 = #e30613 (brand red), shade 7 = #ae0f0a
// (brand hover) — Mantine uses shade + 1 for the filled hover state.
const cdmRed: MantineColorsTuple = [
  '#fde8e9',
  '#f9c4c7',
  '#f49ba0',
  '#ee6f76',
  '#e94850',
  '#e6262f',
  '#e30613',
  '#ae0f0a',
  '#8f0c08',
  '#6e0906',
];

// Ink scale ending in #111318 (text + dark brand band).
const cdmInk: MantineColorsTuple = [
  '#f5f6f7',
  '#e5e6e7',
  '#dedfe1',
  '#bcbdbf',
  '#878787',
  '#646669',
  '#414246',
  '#24262a',
  '#1b1c21',
  '#111318',
];

const FONT_BODY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_HEAD = "'Saira Condensed', 'Arial Narrow', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, 'Cascadia Mono', Consolas, monospace";

export const theme = createTheme({
  primaryColor: 'cdmRed',
  primaryShade: 6,
  colors: { cdmRed, cdmInk },
  black: '#111318',
  white: '#ffffff',
  fontFamily: FONT_BODY,
  fontFamilyMonospace: FONT_MONO,
  headings: {
    fontFamily: FONT_HEAD,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '2.5rem', lineHeight: '1.06', fontWeight: '700' },
      h2: { fontSize: '2rem', lineHeight: '1.1', fontWeight: '700' },
      h3: { fontSize: '1.5rem', lineHeight: '1.2', fontWeight: '600' },
      h4: { fontSize: '1.25rem', lineHeight: '1.2', fontWeight: '600' },
      h5: { fontSize: '1.125rem', lineHeight: '1.3', fontWeight: '600' },
      h6: { fontSize: '1rem', lineHeight: '1.3', fontWeight: '600' },
    },
  },
  radius: { xs: '2px', sm: '2px', md: '6px', lg: '12px', xl: '12px' },
  defaultRadius: 'sm',
  shadows: {
    xs: '0 1px 2px rgba(17, 19, 24, 0.06)',
    sm: '0 1px 2px rgba(17, 19, 24, 0.06)',
    md: '0 6px 18px rgba(17, 19, 24, 0.1)',
    lg: '0 24px 60px rgba(17, 19, 24, 0.14)',
    xl: '0 24px 60px rgba(17, 19, 24, 0.14)',
  },
  focusRing: 'auto',
  cursorType: 'pointer',
  components: {
    // Headings are never red: always ink.
    Title: Title.extend({
      defaultProps: { c: 'cdmInk.9' },
    }),
    // Links stay ink so the single red element on a screen is the CTA.
    Anchor: Anchor.extend({
      defaultProps: { c: 'cdmInk.9', underline: 'always' },
    }),
    Button: Button.extend({
      styles: {
        label: { fontWeight: 700, letterSpacing: '0.04em' },
      },
    }),
  },
});
