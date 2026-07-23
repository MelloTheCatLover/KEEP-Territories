/**
 * DESIGN TOKENS — Educational Gamification Platform
 * Single source of truth for TS/JS consumers.
 * Mirrors tokens.css and tailwind.config.js.
 */

export const colors = {
  neutral: {
    0:    '#08090B',
    50:   '#0D0E11',
    100:  '#121418',
    200:  '#1A1D22',
    300:  '#24282F',
    400:  '#2F343C',
    500:  '#3D434D',
    600:  '#5A626E',
    700:  '#858D9A',
    800:  '#B4BAC4',
    900:  '#D8DCE3',
    1000: '#F2F4F8',
  },
  brand: {
    50:  '#F6ECFB',
    100: '#EAD0F5',
    200: '#D4A5EC',
    300: '#BD7AE2',
    400: '#A855D6',
    500: '#9D4EDD',
    600: '#7B2CBF',
    700: '#5A189A',
    800: '#3C0F6B',
    900: '#240A40',
  },
  success: { base: '#22C55E', bg: '#0F2A1F', hover: '#16A34A', text: '#86EFAC' },
  warning: { base: '#F59E0B', bg: '#2A220A', hover: '#D97706', text: '#FCD34D' },
  danger:  { base: '#EF4444', bg: '#2A1014', hover: '#DC2626', text: '#FCA5A5' },
  info:    { base: '#3B82F6', bg: '#0F1E2A', hover: '#2563EB', text: '#93C5FD' },
} as const;

/**
 * Team colours. Hues sit 35-55° apart in OKLCH with lightness picked so each
 * still reads as its name; the closest pair (зелёный/бирюзовый) is ΔEok 14.7
 * apart, where the previous palette had pairs at 9.3 (алый/коралловый,
 * лазурный/индиго) that teams kept confusing on the map.
 *
 * `shades` are lightness steps of the same hue — the captain moves the team
 * within them. Every shade stays nearer to its own base than to any other
 * family's base (min ΔEok 9.9), so a shade never blurs two teams together.
 *
 * Keep in sync with server/src/types/team-palette.ts.
 */
export const teamColors = {
  crimson:   { base: '#FA3232', bright: '#FC8D81', dark: '#AE1318', muted: '#69221D', textOnBase: '#0D0E11',
               label: 'Красный',    shades: ['#CA181E', '#E11C22', '#FA3232', '#FB5249', '#FB7267'] },
  tangerine: { base: '#E98A1E', bright: '#FDBB81', dark: '#A66112', muted: '#6E4926', textOnBase: '#0D0E11',
               label: 'Оранжевый',  shades: ['#C37317', '#D67F1B', '#E98A1E', '#FC9726', '#FCAD64'] },
  gold:      { base: '#F0D02A', bright: '#FEE98A', dark: '#B79E1D', muted: '#887A3D', textOnBase: '#0D0E11',
               label: 'Жёлтый',     shades: ['#D0B323', '#E0C226', '#F0D02A', '#FDDF52', '#FEE98A'] },
  emerald:   { base: '#24C455', bright: '#2EF16B', dark: '#168C3B', muted: '#2B6035', textOnBase: '#0D0E11',
               label: 'Зелёный',    shades: ['#1CA446', '#20B44E', '#24C455', '#28D55D', '#2CE665'] },
  teal:      { base: '#24BBBC', bright: '#2EE5E7', dark: '#168586', muted: '#2B5C5C', textOnBase: '#0D0E11',
               label: 'Бирюзовый',  shades: ['#1C9C9D', '#20ABAD', '#24BBBC', '#28CBCC', '#2CDBDC'] },
  azure:     { base: '#2C82F9', bright: '#77ACFB', dark: '#0B53B0', muted: '#183765', textOnBase: '#0D0E11',
               label: 'Синий',      shades: ['#1066D5', '#1372ED', '#2C82F9', '#4B92FA', '#66A2FA'] },
  violet:    { base: '#A75FF9', bright: '#C29AFB', dark: '#7A15CA', muted: '#4B2476', textOnBase: '#0D0E11',
               label: 'Фиолетовый', shades: ['#931CF2', '#9E41F9', '#A75FF9', '#B177FA', '#BB8CFB'] },
  magenta:   { base: '#F21F9C', bright: '#FC83BC', dark: '#A51269', muted: '#642043', textOnBase: '#0D0E11',
               label: 'Малиновый',  shades: ['#C6187F', '#DC1B8D', '#F21F9C', '#FB49A8', '#FB6FB4'] },
} as const;

export type TeamColorKey = keyof typeof teamColors;

/** Ordered around the hue circle — assign to teams in this order. */
export const TEAM_COLOR_ORDER: TeamColorKey[] = [
  'crimson', 'tangerine', 'gold', 'emerald', 'teal', 'azure', 'violet', 'magenta',
];

/** Family a colour belongs to (base or any of its shades); null if off-palette. */
export const findTeamColorKey = (color: string | null | undefined): TeamColorKey | null => {
  if (!color) return null;
  const hex = color.toUpperCase();
  return TEAM_COLOR_ORDER.find((k) => (teamColors[k].shades as readonly string[]).includes(hex)) ?? null;
};

export const difficultyColors = {
  easy:   '#6EE7B7',
  medium: '#FCD34D',
  hard:   '#FB923C',
  core:   '#E11D48',
} as const;

/** Special-event sectors (dark grey until an admin runs the place-based event). */
export const specialSectorColor = '#374151';

export type DifficultyKey = keyof typeof difficultyColors;

export const glass = {
  bgSubtle:     'rgba(26, 29, 34, 0.60)',
  bgMedium:     'rgba(26, 29, 34, 0.75)',
  bgStrong:     'rgba(18, 20, 24, 0.88)',
  border:       'rgba(255, 255, 255, 0.06)',
  borderStrong: 'rgba(255, 255, 255, 0.10)',
  blur:         'blur(20px)',
  blurStrong:   'blur(32px)',
} as const;

export const state = {
  hover:           'rgba(255, 255, 255, 0.06)',
  hoverBrand:      'rgba(157, 78, 221, 0.12)',
  active:          'rgba(255, 255, 255, 0.10)',
  focusRing:       'rgba(157, 78, 221, 0.45)',
  selected:        'rgba(157, 78, 221, 0.15)',
  overlayBackdrop: 'rgba(8, 9, 11, 0.72)',
  disabledOpacity: 0.4,
} as const;

export const fontFamily = {
  display: '"Rubik", "Inter", system-ui, sans-serif',
  sans:    '"Inter", system-ui, -apple-system, sans-serif',
  mono:    '"JetBrains Mono", "SF Mono", Menlo, monospace',
} as const;

export const fontWeight = {
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const;

export const fontSize = {
  '2xs':        { size: '0.6875rem', lineHeight: 1.45, letterSpacing: '0.02em' },
  xs:           { size: '0.75rem',   lineHeight: 1.5,  letterSpacing: '0.01em' },
  sm:           { size: '0.875rem',  lineHeight: 1.5,  letterSpacing: '0' },
  base:         { size: '1rem',      lineHeight: 1.55, letterSpacing: '0' },
  lg:           { size: '1.125rem',  lineHeight: 1.5,  letterSpacing: '0' },
  xl:           { size: '1.25rem',   lineHeight: 1.4,  letterSpacing: '-0.005em' },
  'heading-sm': { size: '1.5rem',    lineHeight: 1.3,  letterSpacing: '-0.01em' },
  'heading-md': { size: '2rem',      lineHeight: 1.2,  letterSpacing: '-0.015em' },
  'heading-lg': { size: '2.75rem',   lineHeight: 1.15, letterSpacing: '-0.02em' },
  'heading-xl': { size: '3.75rem',   lineHeight: 1.1,  letterSpacing: '-0.025em' },
  display:      { size: '5rem',      lineHeight: 1.05, letterSpacing: '-0.03em' },
} as const;

export const spacing = {
  0:   '0',
  px:  '1px',
  0.5: '2px',
  1:   '4px',
  2:   '8px',
  3:   '12px',
  4:   '16px',
  5:   '24px',
  6:   '32px',
  7:   '48px',
  8:   '64px',
  9:   '96px',
} as const;

export const radius = {
  none: '0',
  xs:   '4px',
  sm:   '6px',
  md:   '10px',
  lg:   '14px',
  xl:   '20px',
  full: '9999px',
} as const;

export const elevation = {
  0: 'none',
  1: '0 1px 2px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.04)',
  2: '0 4px 12px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06)',
  3: '0 8px 24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
  4: '0 16px 48px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.1)',
  glowBrand: '0 0 0 1px #9D4EDD, 0 0 24px rgba(157,78,221,0.35)',
} as const;

export const duration = {
  instant: 80,
  fast:    150,
  base:    220,
  slow:    320,
  slower:  500,
} as const;

export const easing = {
  out:    'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut:  'cubic-bezier(0.65, 0, 0.35, 1)',
  in:     'cubic-bezier(0.7, 0, 0.84, 0)',
  linear: 'linear',
} as const;

export const zIndex = {
  base:     0,
  raised:   10,
  sticky:   100,
  dropdown: 1000,
  overlay:  5000,
  modal:    5100,
  toast:    9000,
} as const;

/** Helpers */

/** Get team color config by index (assigns in recommended order). */
export const getTeamColor = (index: number) =>
  teamColors[TEAM_COLOR_ORDER[index % TEAM_COLOR_ORDER.length]];

/** Renderable team palette — the shape shared by `teamColors` entries. */
export type TeamColor = {
  base: string;
  bright: string;
  dark: string;
  muted: string;
  textOnBase: string;
};

/**
 * Resolve a TeamColor entry from a hex value. A team on a non-base shade still
 * belongs to its family, but renders from its own hex so the chosen shade shows.
 */
export const findTeamColorByHex = (hex: string | null | undefined): TeamColor | null => {
  if (!hex) return null;
  const normalized = hex.toUpperCase();
  const key = findTeamColorKey(normalized);
  if (!key) return null;
  return teamColors[key].base === normalized ? teamColors[key] : paletteFromHex(normalized);
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const SHADE_WHITE: [number, number, number] = [255, 255, 255];
const SHADE_BLACK: [number, number, number] = [13, 14, 17];

/** Derive a full team palette (shades + readable text) from an arbitrary hex. */
export const paletteFromHex = (hex: string): TeamColor => {
  const rgb = hexToRgb(hex);
  return {
    base: rgbToHex(...rgb),
    bright: rgbToHex(...mix(rgb, SHADE_WHITE, 0.28)),
    dark: rgbToHex(...mix(rgb, SHADE_BLACK, 0.3)),
    muted: rgbToHex(...mix(rgb, SHADE_BLACK, 0.48)),
    textOnBase: relativeLuminance(rgb) > 0.45 ? '#0D0E11' : '#F2F4F8',
  };
};

/** Palette for a stored team color (palette hue or any custom hex); null if unset. */
export const teamPaletteFromColor = (color: string | null | undefined): TeamColor | null =>
  findTeamColorByHex(color) ?? (color ? paletteFromHex(color) : null);

/** Stored color → palette, falling back to the index-assigned hue when unset. */
export const resolveTeamPalette = (color: string | null | undefined, index: number): TeamColor =>
  teamPaletteFromColor(color) ?? getTeamColor(index);

/** Get difficulty color by level. */
export const getDifficultyColor = (level: DifficultyKey) => difficultyColors[level];

export const tokens = {
  colors,
  teamColors,
  difficultyColors,
  specialSectorColor,
  glass,
  state,
  fontFamily,
  fontWeight,
  fontSize,
  spacing,
  radius,
  elevation,
  duration,
  easing,
  zIndex,
} as const;

export default tokens;
