import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';

const Card = ({ children, style, variant = 'default' }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <View
      style={[
        styles.card,
        variant === 'elevated' && styles.elevated,
        variant === 'accent' && styles.accent,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      // NRC-style: no borders in dark mode, use color contrast
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
      ...(isDark ? SHADOWS.cardDark : SHADOWS.card),
    },
    elevated: {
      backgroundColor: colors.surfaceLight,
      ...(isDark ? {} : { borderColor: 'transparent' }),
    },
    accent: {
      borderWidth: 1,
      borderColor: colors.primary + '40',
      ...(isDark ? SHADOWS.glow : {}),
    },
  });

export { Card };
export default Card;
