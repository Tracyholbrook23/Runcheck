export const COLORS = {
  // Backgrounds
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLight: '#F5F5F5',

  // Primary (design system orange - energetic streetball)
  primary: '#FF6B35',
  primaryLight: '#FF8A5B',

  // Secondary (design system blue - trust & calm)
  secondary: '#0084FF',

  // Semantic
  success: '#22C55E',
  danger: '#EF4444',

  // Text (design system)
  textPrimary: '#1A1A1A',
  textSecondary: '#888888',
  textMuted: '#9CA3AF',

  // Legacy aliases (mapped to semantic tokens)
  textDark: '#1A1A1A',
  textLight: '#888888',
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

  // Presence cards (light green)
  presenceBackground: '#ECFDF5',
  presenceText: '#059669',
  presenceTextBright: '#047857',

  // Schedule cards (blue - matches logo)
  scheduleBackground: '#EFF6FF',
  scheduleText: '#2563EB',
  scheduleTextBright: '#1D4ED8',

  // Tab bar
  tabActive: '#E8622A',
  tabInactive: '#9CA3AF',

  // Overlay
  overlay: 'rgba(0,0,0,0.5)',
};

export const COLORS_DARK = {
  // Backgrounds
  background: '#1A1A2E',
  surface: '#25253E',
  surfaceLight: '#2A2A45',

  // Primary (burnt orange - same for brand)
  primary: '#E8622A',
  primaryLight: '#FF7A3D',

  // Secondary (blue - matches logo checkmark)
  secondary: '#60A5FA',

  // Semantic
  success: '#34D399',
  danger: '#F87171',

  // Text
  textPrimary: '#F5F5F5',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',

  // Legacy aliases
  textDark: '#F5F5F5',
  textLight: '#A1A1AA',
  accent: '#E8622A',

  // Borders
  border: '#3F3F5C',

  // Info
  infoBackground: '#1E293B',
  infoText: '#60A5FA',

  // Activity levels
  activityEmpty: '#71717A',
  activityLight: '#34D399',
  activityActive: '#FBBF24',
  activityBusy: '#F87171',

  // Presence cards
  presenceBackground: '#0D3B2E',
  presenceText: '#34D399',
  presenceTextBright: '#10B981',

  // Schedule cards (blue - matches logo)
  scheduleBackground: '#1E3A5F',
  scheduleText: '#60A5FA',
  scheduleTextBright: '#3B82F6',

  // Tab bar
  tabActive: '#E8622A',
  tabInactive: '#71717A',

  // Overlay
  overlay: 'rgba(0,0,0,0.6)',
};

export const SKILL_LEVEL_COLORS = {
  Beginner:     { bg: '#DBEAFE', text: '#2563EB' },
  Intermediate: { bg: '#DCFCE7', text: '#16A34A' },
  Advanced:     { bg: '#FEF3C7', text: '#D97706' },
  Pro:          { bg: '#FEE2E2', text: '#DC2626' },
};

export const FONT_SIZES = {
  title: 24,
  subtitle: 20,
  body: 16,
  small: 14,
  xs: 12,
};

export const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  subtle: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
};

export const BUTTON_HEIGHT = {
  sm: 40,
  md: 48,
  lg: 56,
};

export const CARD = {
  backgroundColor: COLORS.surface,
  borderRadius: RADIUS.lg,
  padding: SPACING.md,
  ...SHADOWS.card,
};

export const INPUT = {
  backgroundColor: COLORS.surface,
  borderColor: COLORS.border,
  borderWidth: 1.5,
  borderRadius: RADIUS.md,
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
    fontWeight: 'bold',
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
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  text: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: 'bold',
    textAlign: 'center',
  },
};

export function getThemeStyles(colors) {
  return {
    NAV_HEADER: {
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerTitleStyle: { color: colors.textPrimary, fontWeight: 'bold', fontSize: 18 },
      headerShadowVisible: false,
    },
    BUTTON: {
      base: {
        backgroundColor: colors.primary,
        height: BUTTON_HEIGHT.md,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.lg,
      },
      text: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.subtitle,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    },
  };
}
