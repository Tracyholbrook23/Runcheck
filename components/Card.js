import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';

const Card = ({ children, style, variant = 'default' }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.card,
        variant === 'elevated' && styles.elevated,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const getStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      ...SHADOWS.card,
    },
    elevated: {
      ...SHADOWS.elevated,
    },
  });

export { Card };
export default Card;
