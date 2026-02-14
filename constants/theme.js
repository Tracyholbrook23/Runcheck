// ─── Light Theme ───────────────────────────────────────────────
export const COLORS = {
  // Backgrounds
  background: '#FFFFFF',
  surface: '#F8F8F8',
  surfaceLight: '#F0F0F0',

  // Primary (RunCheck orange — energetic streetball)
  primary: '#FF6B35',
  primaryLight: '#FF8F60',

  // Secondary (trust & calm blue)
  secondary: '#0084FF',

  // Semantic
  success: '#22C55E',
  danger: '#EF4444',

  // Text
  textPrimary: '#111111',
  textSecondary: '#6B6B6B',
  textMuted: '#9CA3AF',

  // Legacy aliases
  textDark: '#111111',
  textLight: '#6B6B6B',
  accent: '#FF6B35',

  // Borders
  border: '#E5E7EB',

  // Info
  infoBackground: '#EFF6FF',
  infoText: '#2563EB',

  // Activity levels
  activityEmpty: '#9CA3AF',
  activityLight: '#22C55E',
  activityActive: '#F59E0B',
  activityBusy: '#EF4444',

  // Presence cards
  presenceBackground: '#FFF3ED',
  presenceText: '#C4501A',
  presenceTextBright: '#FF6B35',

  // Schedule cards
  scheduleBackground: '#EFF6FF',
  scheduleText: '#0084FF',
  scheduleTextBright: '#0066CC',

  // Tab bar
  tabActive: '#111111',
  tabInactive: '#9CA3AF',

  // Overlay
  overlay: 'rgba(0,0,0,0.5)',
};

// ─── Dark Theme (NRC-Inspired) ────────────────────────────────
export const COLORS_DARK = {
  // Backgrounds — deep black, NRC-inspired
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceLight: '#222222',

  // Primary (RunCheck signature orange)
  primary: '#FF6B35',
  primaryLight: '#FF8F60',

  // Secondary (brighter blue for dark contrast)
  secondary: '#5EADFF',

  // Semantic (desaturated for dark mode per Material guidelines)
  success: '#34D399',
  danger: '#F87171',

  // Text — high contrast white + muted grays
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',

  // Legacy aliases
  textDark: '#FFFFFF',
  textLight: '#A0A0A0',
  accent: '#FF6B35',

  // Borders — nearly invisible, NRC-style
  border: '#2A2A2A',

  // Info
  infoBackground: '#1A2235',
  infoText: '#60A5FA',

  // Activity levels
  activityEmpty: '#555555',
  activityLight: '#34D399',
  activityActive: '#FBBF24',
  activityBusy: '#F87171',

  // Presence cards (warm orange tint)
  presenceBackground: '#1F1510',
  presenceText: '#FF8F60',
  presenceTextBright: '#FF6B35',

  // Schedule cards (cool blue tint)
  scheduleBackground: '#101828',
  scheduleText: '#5EADFF',
  scheduleTextBright: '#7BBFFF',

  // Tab bar — white active, dim inactive (NRC-style)
  tabActive: '#FFFFFF',
  tabInactive: '#555555',

  // Overlay
  overlay: 'rgba(0,0,0,0.75)',
};

// ─── Skill Level Colors (works on both themes) ───────────────
export const SKILL_LEVEL_COLORS = {
  Beginner:     { bg: '#DBEAFE', text: '#2563EB' },
  Intermediate: { bg: '#DCFCE7', text: '#16A34A' },
  Advanced:     { bg: '#FEF3C7', text: '#D97706' },
  Pro:          { bg: '#FEE2E2', text: '#DC2626' },
};

// Dark-aware skill level colors
export const SKILL_LEVEL_COLORS_DARK = {
  Beginner:     { bg: '#1E2A3A', text: '#60A5FA' },
  Intermediate: { bg: '#132A1F', text: '#34D399' },
  Advanced:     { bg: '#2A1F0E', text: '#FBBF24' },
  Pro:          { bg: '#2A1010', text: '#F87171' },
};

// ─── Typography ───────────────────────────────────────────────
export const FONT_SIZES = {
  hero: 40,          // Hero/splash text
  h1: 34,            // Page headlines (NRC-inspired: big & bold)
  h2: 22,            // Section headers
  h3: 18,            // Card headers / subheaders
  title: 34,         // Legacy alias for h1
  subtitle: 22,      // Legacy alias for h2
  body: 15,          // Body text (tighter for density)
  small: 13,         // Supporting text
  xs: 11,            // Captions / labels
};

// ─── Font Weights ─────────────────────────────────────────────
export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extraBold: '800',  // NRC-style headlines
};

// ─── Spacing (8px grid) ──────────────────────────────────────
export const SPACING = {
  xxxs: 2,     // Micro spacing
  xxs: 4,      // Tight spacing
  xs: 8,       // Small gaps
  sm: 12,      // Backwards compatibility
  md: 16,      // Standard padding
  lg: 24,      // Section spacing
  xl: 32,      // Large gaps
  xxl: 40,     // Extra large
  xxxl: 48,    // Hero spacing
};

// ─── Border Radius ───────────────────────────────────────────
export const RADIUS = {
  sm: 10,       // Buttons (slightly rounder)
  md: 14,       // Cards
  lg: 18,       // Large elements
  xl: 24,       // Extra large
  full: 9999,   // Circles / pills
};

// ─── Shadows ─────────────────────────────────────────────────
export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  subtle: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  // NRC-style glow for primary accent CTAs (dark mode)
  glow: {
    shadowColor: '#FF6B35',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // Minimal shadow for dark mode cards
  cardDark: {
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
};

// ─── Button Heights ──────────────────────────────────────────
export const BUTTON_HEIGHT = {
  sm: 40,
  md: 50,       // Slightly taller (NRC feel)
  lg: 56,
};

// ─── Preset Styles (light theme defaults) ────────────────────
export const CARD = {
  backgroundColor: COLORS.surface,
  borderRadius: RADIUS.md,
  padding: SPACING.md,
  ...SHADOWS.card,
};

export const INPUT = {
  backgroundColor: COLORS.surface,
  borderColor: COLORS.border,
  borderWidth: 1,
  borderRadius: RADIUS.sm,
  height: BUTTON_HEIGHT.md,
  paddingHorizontal: SPACING.md,
  color: COLORS.textPrimary,
  fontSize: FONT_SIZES.body,
};

export const NAV_HEADER = {
  headerStyle: {
    backgroundColor: COLORS.surface,
  },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  headerShadowVisible: false,
};

export const BUTTON = {
  base: {
    backgroundColor: COLORS.primary,
    height: BUTTON_HEIGHT.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
  },
  text: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
};

// ─── Animations ──────────────────────────────────────────────
export const ANIMATIONS = {
  pageTransition: 175,
  buttonPress: 100,       // Snappier (NRC feel)
  dataUpdate: 300,
  loading: 1200,
  expandCollapse: 250,
  fadeIn: 200,
  slideUp: 200,
  pulse: 1500,
  breathe: 2000,          // Breathing glow for live indicators
};

// ─── Touch Targets ───────────────────────────────────────────
export const TOUCH_TARGET = {
  min: 44,
};

// ─── Theme-aware Style Generator ─────────────────────────────
export function getThemeStyles(colors) {
  return {
    NAV_HEADER: {
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.textPrimary,
      headerTitleStyle: {
        color: colors.textPrimary,
        fontWeight: '700',
        fontSize: 18,
        letterSpacing: -0.3,
      },
      headerShadowVisible: false,
    },
    BUTTON: {
      base: {
        backgroundColor: colors.primary,
        height: BUTTON_HEIGHT.md,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        borderRadius: RADIUS.sm,
      },
      text: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.body,
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 0.5,
      },
    },
  };
}
