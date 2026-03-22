/**
 * SettingsScreen.js — Account Settings
 *
 * Sections:
 *   PREFERENCES  — Dark Mode toggle (currently forced-dark; toggle disabled)
 *                  Push Notifications (placeholder, wires to registerPushToken)
 *   MY ACCOUNT   — My Reports (moved from ProfileScreen)
 *                  Sign Out
 *                  Delete Account (destructive, with confirmation)
 *   SUPPORT      — Contact Support (mailto:runcheckapp@gmail.com)
 *                  Rate RunCheck (App Store / Play Store deep-link)
 *                  Share RunCheck (native share sheet)
 *   ABOUT        — App Version
 *                  Privacy Policy (web link)
 *                  Terms of Service (web link)
 *
 * Navigation: ProfileStack → SettingsScreen → MyReports
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useProfile } from '../hooks';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ── App constants ──────────────────────────────────────────────────────────
const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'runcheckapp@gmail.com';
const APP_STORE_URL = 'https://apps.apple.com/app/runcheck/id000000000'; // update with real ID
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.runcheck'; // update if needed
const PRIVACY_URL = 'https://gray-marlin-55c.notion.site/RunCheck-Privacy-Policy-3280818539eb80168b7cc7dd061f3d09';
const TERMS_URL = 'https://runcheckapp.com/terms';     // update with real URL

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
  const { profile } = useProfile();

  // ── Community feed toggle — optimistic local state ───────────────────────
  // Local state snaps instantly on press; Firestore write happens in background.
  const [showCommunityFeed, setShowCommunityFeed] = useState(
    profile?.preferences?.showCommunityFeed ?? true
  );

  // Sync once when profile first loads (handles cold start before profile arrives)
  useEffect(() => {
    if (profile?.preferences?.showCommunityFeed !== undefined) {
      setShowCommunityFeed(profile.preferences.showCommunityFeed);
    }
  }, [profile?.preferences?.showCommunityFeed]);

  const handleToggleFeed = (val) => {
    setShowCommunityFeed(val);                    // instant UI snap
    updatePreference('showCommunityFeed', val);   // background Firestore write
  };

  // ── Preference updater ──────────────────────────────────────────────────
  const updatePreference = async (key, value) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        [`preferences.${key}`]: value,
      });
    } catch (err) {
      if (__DEV__) console.warn('[Settings] updatePreference error:', err);
    }
  };

  // ── Sign Out ────────────────────────────────────────────────────────────
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

  // ── Delete Account ──────────────────────────────────────────────────────
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

  // ── Contact Support ────────────────────────────────────────────────────
  const handleContactSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=RunCheck Support Request`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert(
        'Contact Support',
        `Reach us at ${SUPPORT_EMAIL}`,
        [{ text: 'OK' }]
      );
    }
  };

  // ── Rate the App ───────────────────────────────────────────────────────
  const handleRateApp = () => {
    const storeUrl = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
    Linking.openURL(storeUrl).catch(() => {
      Alert.alert('Unable to open store', 'Please search for RunCheck in the App Store.');
    });
  };

  // ── Share App ──────────────────────────────────────────────────────────
  const handleShareApp = async () => {
    try {
      await Share.share({
        message:
          Platform.OS === 'ios'
            ? 'Check out RunCheck — the app for basketball gym check-ins, runs, and highlights! Download it here: ' + APP_STORE_URL
            : 'Check out RunCheck — the app for basketball gym check-ins, runs, and highlights!',
        url: Platform.OS === 'ios' ? APP_STORE_URL : undefined,
        title: 'RunCheck',
      });
    } catch (err) {
      if (__DEV__) console.error('Share error:', err);
    }
  };

  // ── Open URL ───────────────────────────────────────────────────────────
  const handleOpenURL = (url) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open link', 'Please try again later.');
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* ── PREFERENCES ────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        {/* Dark Mode */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons
                name={isDark ? 'moon' : 'sunny-outline'}
                size={18}
                color={colors.primary}
              />
            </View>
            <View>
              <Text style={styles.settingLabel}>Dark Mode</Text>
              <Text style={styles.settingHint}>Coming soon</Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
            disabled
          />
        </View>

        <View style={styles.menuDivider} />

        {/* Push Notifications */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#FF9F0A22' }]}>
              <Ionicons name="notifications-outline" size={18} color="#FF9F0A" />
            </View>
            <View>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingHint}>Runs, check-ins & friend activity</Text>
            </View>
          </View>
          <Switch
            value={true}
            onValueChange={() => {}}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
            disabled
          />
        </View>

        <View style={styles.menuDivider} />

        {/* Community Activity Feed */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#6366F122' }]}>
              <Ionicons name="people-outline" size={18} color="#6366F1" />
            </View>
            <View>
              <Text style={styles.settingLabel}>Community Activity</Text>
              <Text style={styles.settingHint}>Show recent runs on the Home screen</Text>
            </View>
          </View>
          <Switch
            value={showCommunityFeed}
            onValueChange={handleToggleFeed}
            trackColor={{ false: colors.border, true: '#6366F1' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* ── MY ACCOUNT ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>My Account</Text>
      <View style={styles.card}>

        {/* My Reports */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MyReports')}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#FF453A22' }]}>
              <Ionicons name="flag-outline" size={18} color="#FF453A" />
            </View>
            <Text style={styles.menuLabel}>My Reports</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleSignOut}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.textMuted + '22' }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.textPrimary} />
            </View>
            <Text style={styles.menuLabel}>Sign Out</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Delete Account */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleDeleteAccount}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.danger + '22' }]}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.danger }]}>Delete Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── SUPPORT ────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Support</Text>
      <View style={styles.card}>

        {/* Contact Support */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleContactSupport}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#30D15822' }]}>
              <Ionicons name="mail-outline" size={18} color="#30D158" />
            </View>
            <View>
              <Text style={styles.menuLabel}>Contact Support</Text>
              <Text style={styles.settingHint}>{SUPPORT_EMAIL}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Rate RunCheck */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleRateApp}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#FFD60A22' }]}>
              <Ionicons name="star-outline" size={18} color="#FFD60A" />
            </View>
            <Text style={styles.menuLabel}>Rate RunCheck</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Share RunCheck */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={handleShareApp}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#0A84FF22' }]}>
              <Ionicons name="share-outline" size={18} color="#0A84FF" />
            </View>
            <Text style={styles.menuLabel}>Share RunCheck</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── ABOUT ──────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>

        {/* Privacy Policy */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={() => handleOpenURL(PRIVACY_URL)}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Terms of Service */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={() => handleOpenURL(TERMS_URL)}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>Terms of Service</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Version */}
        <View style={styles.menuRow}>
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.textMuted + '22' }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            </View>
            <Text style={styles.menuLabel}>Version</Text>
          </View>
          <Text style={styles.versionText}>{APP_VERSION}</Text>
        </View>
      </View>

      {/* ── Logo footer ─────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>RunCheck</Text>
        <Text style={styles.footerSub}>Made for ballers, by ballers.</Text>
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
    paddingBottom: SPACING.xxl * 2,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
    ...(isDark
      ? { borderWidth: 0 }
      : { borderWidth: 1, borderColor: colors.border }),
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  settingLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textPrimary,
  },
  settingHint: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    marginTop: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  menuLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textPrimary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 34 + SPACING.sm, // align with text, not icon
  },
  versionText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
  },
  footer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    gap: SPACING.xs,
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  footerSub: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    opacity: 0.6,
  },
});
