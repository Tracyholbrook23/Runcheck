export const COLORS = {
  // Backgrounds
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceLight: '#F3F4F6',

  // Primary (burnt orange)
  primary: '#E8622A',
  primaryLight: '#FF7A3D',

  // Secondary (purple - plan visits)
  secondary: '#8B5CF6',

  // Semantic
  success: '#22C55E',
  danger: '#EF4444',

  // Text
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Legacy aliases (mapped to semantic tokens)
  textDark: '#1F2937',
  textLight: '#6B7280',
  accent: '#E8622A',

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

  // Schedule/purple cards
  scheduleBackground: '#F3E8FF',
  scheduleText: '#7C3AED',
  scheduleTextBright: '#6D28D9',

  // Tab bar
  tabActive: '#E8622A',
  tabInactive: '#9CA3AF',
};

export const FONT_SIZES = {
  title: 22,
  subtitle: 18,
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
};

export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  subtle: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
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
  borderWidth: 1,
  borderRadius: RADIUS.md,
  padding: SPACING.sm,
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
  },
  headerShadowVisible: false,
};

export const BUTTON = {
  base: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
  },
  text: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.body,
    fontWeight: 'bold',
    textAlign: 'center',
  },
};
