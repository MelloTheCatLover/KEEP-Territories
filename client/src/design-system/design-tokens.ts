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

export const teamColors = {
  crimson: { base: '#E53935', bright: '#FF5A52', muted: '#8C2A28', textOnBase: '#F2F4F8' },
  coral:   { base: '#F06A2C', bright: '#FF8A4C', muted: '#924019', textOnBase: '#F2F4F8' },
  amber:   { base: '#E6B422', bright: '#FFD340', muted: '#8C6D14', textOnBase: '#0D0E11' },
  emerald: { base: '#2BA84A', bright: '#4CD964', muted: '#1A6B30', textOnBase: '#F2F4F8' },
  cyan:    { base: '#1BB5D4', bright: '#3FD8F5', muted: '#0E6478', textOnBase: '#0D0E11' },
  azure:   { base: '#2952D9', bright: '#4D78FF', muted: '#17327F', textOnBase: '#F2F4F8' },
  indigo:  { base: '#6366F1', bright: '#8689FF', muted: '#3A3D99', textOnBase: '#F2F4F8' },
  magenta: { base: '#D6409F', bright: '#F45EBB', muted: '#842863', textOnBase: '#F2F4F8' },
} as const;

export type TeamColorKey = keyof typeof teamColors;

/** Ordered for max hue separation — assign to teams in this order. */
export const TEAM_COLOR_ORDER: TeamColorKey[] = [
  'crimson', 'coral', 'amber', 'emerald', 'cyan', 'azure', 'indigo', 'magenta',
];

export const difficultyColors = {
  easy:   '#6EE7B7',
  medium: '#FCD34D',
  hard:   '#FB923C',
  core:   '#E11D48',
} as const;

/** Muted fills for free sectors — keeps difficulty cue without overpowering team colors. */
export const difficultyTints = {
  easy:   '#1F4634',
  medium: '#4A3F18',
  hard:   '#4A2E18',
  core:   '#4A1622',
} as const;

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

/** Resolve a TeamColor entry from a hex value, matching any palette base. */
export const findTeamColorByHex = (hex: string | null | undefined) => {
  if (!hex) return null;
  const normalized = hex.toUpperCase();
  for (const key of TEAM_COLOR_ORDER) {
    if (teamColors[key].base.toUpperCase() === normalized) return teamColors[key];
  }
  return null;
};

/** Get difficulty color by level. */
export const getDifficultyColor = (level: DifficultyKey) => difficultyColors[level];

export const tokens = {
  colors,
  teamColors,
  difficultyColors,
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
