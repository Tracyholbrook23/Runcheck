import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, BUTTON_HEIGHT } from '../constants/theme';
import { useTheme } from '../contexts';

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  style,
  testID,
}) => {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
      />
    </View>
  );
};

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      width: '100%',
      marginBottom: SPACING.md,
    },
    label: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: 6,
      letterSpacing: 0.2,
    },
    input: {
      height: BUTTON_HEIGHT.md,
      backgroundColor: colors.surfaceLight,
      // NRC-style: no border in dark mode, subtle border in light
      borderWidth: isDark ? 0 : 1,
      borderColor: colors.border,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.md,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
    },
    inputFocused: {
      // NRC-style: orange accent on focus
      borderWidth: isDark ? 1 : 1,
      borderColor: colors.primary,
    },
  });

export { Input };
export default Input;
