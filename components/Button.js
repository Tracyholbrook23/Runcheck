import React, { useMemo } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, BUTTON_HEIGHT } from '../constants/theme';
import { useTheme } from '../contexts';

const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  testID,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const height = BUTTON_HEIGHT[size] || BUTTON_HEIGHT.md;

  const variantStyles = {
    primary: {
      container: { backgroundColor: colors.primary },
      text: { color: '#FFFFFF' },
      iconColor: '#FFFFFF',
    },
    secondary: {
      container: { backgroundColor: colors.surfaceLight },
      text: { color: colors.primary },
      iconColor: colors.primary,
    },
    outline: {
      container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
      text: { color: colors.primary },
      iconColor: colors.primary,
    },
    danger: {
      container: { backgroundColor: colors.danger },
      text: { color: '#FFFFFF' },
      iconColor: '#FFFFFF',
    },
    ghost: {
      container: { backgroundColor: 'transparent' },
      text: { color: colors.primary },
      iconColor: colors.primary,
    },
  };

  const v = variantStyles[variant] || variantStyles.primary;
  const fontSize = size === 'lg' ? FONT_SIZES.subtitle : size === 'sm' ? FONT_SIZES.small : FONT_SIZES.body;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        { height },
        v.container,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text.color} />
      ) : (
        <View style={styles.content}>
          {icon && (
            <Ionicons
              name={icon}
              size={size === 'lg' ? 22 : 18}
              color={v.iconColor}
              style={styles.icon}
            />
          )}
          <Text style={[styles.text, { fontSize }, v.text]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const getStyles = () =>
  StyleSheet.create({
    base: {
      borderRadius: RADIUS.lg,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: {
      marginRight: SPACING.xs,
    },
    text: {
      fontWeight: 'bold',
      textAlign: 'center',
    },
    disabled: {
      opacity: 0.5,
    },
  });

export { Button };
export default Button;
