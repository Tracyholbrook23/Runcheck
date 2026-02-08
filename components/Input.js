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
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && { borderColor: colors.primary },
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

const getStyles = (colors) =>
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
    },
    input: {
      height: BUTTON_HEIGHT.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
    },
  });

export { Input };
export default Input;
