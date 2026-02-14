import React, { useRef, useMemo } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, BUTTON_HEIGHT, SHADOWS, ANIMATIONS } from '../constants/theme';
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
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const height = BUTTON_HEIGHT[size] || BUTTON_HEIGHT.md;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const variantStyles = {
    primary: {
      container: [
        { backgroundColor: colors.primary },
        isDark && SHADOWS.glow,
      ],
      text: { color: '#FFFFFF' },
      iconColor: '#FFFFFF',
    },
    secondary: {
      container: [{ backgroundColor: colors.surfaceLight }],
      text: { color: colors.textPrimary },
      iconColor: colors.textPrimary,
    },
    outline: {
      container: [
        {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: isDark ? colors.textSecondary : colors.border,
        },
      ],
      text: { color: isDark ? colors.textPrimary : colors.textSecondary },
      iconColor: isDark ? colors.textPrimary : colors.textSecondary,
    },
    danger: {
      container: [{ backgroundColor: colors.danger }],
      text: { color: '#FFFFFF' },
      iconColor: '#FFFFFF',
    },
    ghost: {
      container: [{ backgroundColor: 'transparent' }],
      text: { color: colors.primary },
      iconColor: colors.primary,
    },
  };

  const v = variantStyles[variant] || variantStyles.primary;
  const fontSize = size === 'lg' ? FONT_SIZES.h3 : size === 'sm' ? FONT_SIZES.small : FONT_SIZES.body;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.base,
          { height },
          ...v.container,
          disabled && styles.disabled,
          style,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.85}
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
    </Animated.View>
  );
};

const getStyles = () =>
  StyleSheet.create({
    base: {
      borderRadius: RADIUS.sm,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
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
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 0.3,
    },
    disabled: {
      opacity: 0.4,
    },
  });

export { Button };
export default Button;
