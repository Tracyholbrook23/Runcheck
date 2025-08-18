export const COLORS = {
  primary: '#4A90E2',
  accent: '#50E3C2',
  textDark: '#2C3E50',
  textLight: '#FFFFFF',
  background: '#F9FAFB',
  border: '#D1D5DB',
};

export const FONT_SIZES = {
  title: 22,
  subtitle: 18,
  body: 16,
  small: 14,
};

export const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

export const BUTTON = {
  base: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  text: {
    color: COLORS.textLight,
    fontSize: FONT_SIZES.body,
    fontWeight: 'bold',
    textAlign: 'center',
  },
};
