/**
 * SettingsScreen.js — Account Settings
 *
 * Simple settings screen containing account-level actions:
 *   - Dark Mode toggle (currently disabled — dark mode is forced)
 *   - Sign Out
 *   - Delete Account (destructive, with confirmation)
 *
 * Structured so additional settings can be added later without
 * restructuring the layout. Uses the same card/row patterns as
 * ProfileScreen for visual consistency.
 *
 * Navigation: ProfileStack → SettingsScreen
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * SettingsScreen — Account settings and actions.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function SettingsScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleSignOut — Signs the user out of Firebase Auth and resets navigation.
   */
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
            navigation.getParent()?.getParent()?.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to sign out.');
          }
        },
      },
    ]);
  };

  /**
   * handleDeleteAccount — Permanently deletes the user's account via backend
   * Cloud Function, then signs out and resets to Login.
   */
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: async () => {
            try {
              const deleteAccountFn = httpsCallable(getFunctions(), 'deleteAccount');
              await deleteAccountFn();

              // Backend deleted the Auth account server-side.
              // Sign out locally to clear cached auth state.
              try {
                await signOut(auth);
              } catch (_) {
                // Auth account already deleted server-side — signOut may fail
              }

              navigation.getParent()?.getParent()?.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (err) {
              if (__DEV__) console.error('Delete account error:', err);
              const msg = err?.message || 'Failed to delete account.';
              if (msg.includes('requires-recent-login') || msg.includes('auth/requires-recent-login')) {
                Alert.alert(
                  'Re-authentication Required',
                  'For security, please sign out, sign back in, and try again.',
                );
              } else {
                Alert.alert('Error', msg);
              }
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* ── Preferences ──────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Ionicons
              name={isDark ? 'moon' : 'sunny-outline'}
              size={20}
              color={colors.textPrimary}
            />
            <Text style={styles.settingLabel}>Dark Mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
            disabled
          />
        </View>
      </View>

      {/* ── Account ──────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleSignOut}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="log-out-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.menuLabel}>Sign Out</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleDeleteAccount}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.menuLabel, { color: colors.danger }]}>Delete Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...(isDark
      ? { borderWidth: 0 }
      : { borderWidth: 1, borderColor: colors.border }),
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  settingLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textPrimary,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  menuLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textPrimary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: SPACING.sm,
  },
});
