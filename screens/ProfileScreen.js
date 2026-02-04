import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useTheme } from '../contexts';

export default function ProfileScreen() {
  const { isDark, colors, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.iconWrapper}>
          <Ionicons name="person-circle-outline" size={80} color={colors.textMuted} />
        </View>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Coming soon</Text>
        <Text style={styles.description}>
          View your stats, reliability score, and account settings.
        </Text>

        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Ionicons
              name={isDark ? 'moon' : 'sunny-outline'}
              size={22}
              color={colors.textPrimary}
            />
            <Text style={styles.settingText}>Dark Mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
            testID="dark-mode-toggle"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  iconWrapper: {
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.subtitle,
    color: colors.textSecondary,
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: SPACING.md,
    width: '100%',
    marginTop: SPACING.md,
  },
  settingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    marginLeft: SPACING.sm,
    fontWeight: '500',
  },
});
