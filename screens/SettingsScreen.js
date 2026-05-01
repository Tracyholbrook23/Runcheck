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

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
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
import { auth, db, functions } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { registerPushToken, clearPushToken } from '../utils/notifications';

// ── App constants ──────────────────────────────────────────────────────────
const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'hello@theruncheck.app';
const APP_STORE_URL = 'https://apps.apple.com/app/runcheck/id000000000'; // update with real ID
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.runcheck'; // update if needed
const WEBSITE_URL = 'https://www.theruncheck.app';
const PRIVACY_URL = 'https://www.theruncheck.app/privacy';
const TERMS_URL = 'https://www.theruncheck.app/terms';

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

  // ── Auto Check-In toggle — optimistic local state ───────────────────────
  const [autoCheckInEnabled, setAutoCheckInEnabled] = useState(
    profile?.preferences?.autoCheckInEnabled ?? true
  );

  useEffect(() => {
    if (profile?.preferences?.autoCheckInEnabled !== undefined) {
      setAutoCheckInEnabled(profile.preferences.autoCheckInEnabled);
    }
  }, [profile?.preferences?.autoCheckInEnabled]);

  const handleToggleAutoCheckIn = (val) => {
    setAutoCheckInEnabled(val);
    updatePreference('autoCheckInEnabled', val);
  };

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

  // ── Collapsible section state ────────────────────────────────────────────
  const [notifExpanded, setNotifExpanded] = useState(false);
  const [autoCheckInExpanded, setAutoCheckInExpanded] = useState(false);

  // ── Push Notifications toggle — optimistic local state ───────────────────
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    profile?.preferences?.notificationsEnabled ?? true
  );

  // Sync once when profile first loads
  useEffect(() => {
    if (profile?.preferences?.notificationsEnabled !== undefined) {
      setNotificationsEnabled(profile.preferences.notificationsEnabled);
    }
  }, [profile?.preferences?.notificationsEnabled]);

  // ── OS-level notification permission status ─────────────────────────────
  // 'granted' | 'denied' | 'undetermined'
  // Re-checked every time the screen comes into focus so the banner disappears
  // immediately after the user enables permission in phone Settings and returns.
  const [osPermission, setOsPermission] = useState('granted');

  const checkOsPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setOsPermission(status);
    } catch {
      setOsPermission('granted'); // fail open — don't show a false warning
    }
  }, []);

  useEffect(() => { checkOsPermission(); }, [checkOsPermission]);
  useFocusEffect(useCallback(() => { checkOsPermission(); }, [checkOsPermission]));

  const osBlocked = osPermission === 'denied';

  const handleToggleNotifications = async (val) => {
    if (val && osBlocked) {
      // Permission is blocked at OS level — toggle can't fix it. Send them to phone Settings.
      Alert.alert(
        'Notifications Blocked',
        'RunCheck doesn\'t have permission to send notifications on this device. Open your phone\'s Settings to enable them.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    if (!val) {
      // Turning OFF — optimistic update, then remove the push token from Firestore.
      // Cloud Functions check users/{uid}.pushToken before sending — no token = no notifications.
      setNotificationsEnabled(false);
      updatePreference('notificationsEnabled', false);
      await clearPushToken();
      return;
    }

    // Turning ON — attempt to register. This will:
    //   • Show the OS permission prompt if status is 'undetermined'
    //   • Silently retrieve the token if already granted
    //   • Return null if the user denies the prompt
    setNotificationsEnabled(true); // optimistic
    const token = await registerPushToken();

    if (!token) {
      // User denied the OS permission dialog — revert the toggle so the UI
      // stays honest, and re-check OS status so the blocked banner appears.
      setNotificationsEnabled(false);
      updatePreference('notificationsEnabled', false);
      await checkOsPermission();
      return;
    }

    // Token saved successfully — persist the preference.
    updatePreference('notificationsEnabled', true);
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
              const deleteAccountFn = httpsCallable(functions, 'deleteAccount');
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
            <View style={styles.settingTextWrap}>
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
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingHint}>
                {osBlocked
                  ? 'Blocked in phone Settings'
                  : notificationsEnabled
                    ? 'Alerts are on'
                    : 'Alerts are off'}
              </Text>
            </View>
          </View>
          <Switch
            value={notificationsEnabled && !osBlocked}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: colors.border, true: '#FF9F0A' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* OS permission blocked banner */}
        {osBlocked && (
          <View style={styles.notifBlockedBanner}>
            <Ionicons name="warning-outline" size={16} color="#FF9F0A" style={{ marginTop: 1 }} />
            <View style={styles.notifBlockedText}>
              <Text style={styles.notifBlockedTitle}>Notifications are blocked</Text>
              <Text style={styles.notifBlockedDesc}>
                RunCheck doesn't have permission to send notifications on this device.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.notifBlockedButton}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.7}
            >
              <Text style={styles.notifBlockedButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notification type list — collapsible */}
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => setNotifExpanded(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandRowLabel}>Alert types</Text>
          <Ionicons
            name={notifExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {notifExpanded && (
          <View style={[styles.notifTypeList, (!notificationsEnabled || osBlocked) && styles.notifTypeListDimmed]}>
            {[
              { icon: '⚡', label: 'Run starting soon', desc: '30 min before your run starts' },
              { icon: '👥', label: 'Player joined your run', desc: 'When someone joins a run you created' },
              { icon: '🔥', label: 'Run getting full', desc: 'When your run hits 5, 10, or 20 players' },
              { icon: '🏀', label: 'New run at your gym', desc: 'Run posted at a gym you follow' },
              { icon: '📅', label: 'Matches your schedule', desc: 'Run posted during your planned visit' },
              { icon: '📍', label: 'Gym going live', desc: 'A followed gym reaches 3 or 6 players' },
              { icon: '👋', label: 'Friend request', desc: 'Someone sent you a friend request' },
              { icon: '🤝', label: 'Friend accepted', desc: 'Someone accepted your friend request' },
              { icon: '💬', label: 'Run chat message', desc: 'New message in a group run chat' },
              { icon: '✉️', label: 'Direct message', desc: 'Someone sent you a DM' },
            ].map(({ icon, label, desc }) => (
              <View key={label} style={styles.notifTypeRow}>
                <Text style={styles.notifTypeIcon}>{icon}</Text>
                <View style={styles.notifTypeText}>
                  <Text style={styles.notifTypeLabel}>{label}</Text>
                  <Text style={styles.notifTypeDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.menuDivider} />

        {/* Auto Check-In */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#22C55E22' }]}>
              <Ionicons name="location" size={18} color="#22C55E" />
            </View>
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingLabel}>Auto Check-In</Text>
              <Text style={styles.settingHint}>
                {autoCheckInEnabled ? 'On — checks you in automatically' : 'Off'}
              </Text>
            </View>
          </View>
          <Switch
            value={autoCheckInEnabled}
            onValueChange={handleToggleAutoCheckIn}
            trackColor={{ false: colors.border, true: '#22C55E' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Auto check-in explanation panel — collapsible */}
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => setAutoCheckInExpanded(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandRowLabel}>How it works</Text>
          <Ionicons
            name={autoCheckInExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {autoCheckInExpanded && (
          <View style={styles.autoCheckInInfo}>
            <View style={styles.autoCheckInInfoRow}>
              <Text style={styles.autoCheckInInfoIcon}>📅</Text>
              <View style={styles.autoCheckInInfoText}>
                <Text style={styles.autoCheckInInfoLabel}>Schedule a visit first</Text>
                <Text style={styles.autoCheckInInfoDesc}>
                  Go to any gym page and tap "Plan a Visit" to schedule when you'll be there.
                </Text>
              </View>
            </View>
            <View style={styles.autoCheckInInfoRow}>
              <Text style={styles.autoCheckInInfoIcon}>📍</Text>
              <View style={styles.autoCheckInInfoText}>
                <Text style={styles.autoCheckInInfoLabel}>Arrive at the gym</Text>
                <Text style={styles.autoCheckInInfoDesc}>
                  When you enter the gym's area during your scheduled time, RunCheck checks you in automatically — no tap needed.
                </Text>
              </View>
            </View>
            <View style={styles.autoCheckInInfoRow}>
              <Text style={styles.autoCheckInInfoIcon}>⚡</Text>
              <View style={styles.autoCheckInInfoText}>
                <Text style={styles.autoCheckInInfoLabel}>Points + reliability</Text>
                <Text style={styles.autoCheckInInfoDesc}>
                  You earn your check-in points and your reliability score goes up, just like a manual check-in.
                </Text>
              </View>
            </View>
            <Text style={styles.autoCheckInNote}>
              Location is only checked while the app is open. Auto check-in works within 1 hour of your scheduled time.
            </Text>
          </View>
        )}

        <View style={styles.menuDivider} />

        {/* Community Activity Feed */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#6366F122' }]}>
              <Ionicons name="people-outline" size={18} color="#6366F1" />
            </View>
            <View style={styles.settingTextWrap}>
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

        {/* Help Center */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('HelpCenter')}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#3B82F6' + '22' }]}>
              <Ionicons name="help-circle-outline" size={18} color="#3B82F6" />
            </View>
            <View>
              <Text style={styles.menuLabel}>Help Center</Text>
              <Text style={styles.settingHint}>FAQs and how-to guides</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* Account Info */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.menuLabel}>Account Info</Text>
              <Text style={styles.settingHint}>Name, email, skill level</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

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

        {/* Website */}
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.7}
          onPress={() => handleOpenURL(WEBSITE_URL)}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.iconWrap, { backgroundColor: '#0A84FF22' }]}>
              <Ionicons name="globe-outline" size={18} color="#0A84FF" />
            </View>
            <View>
              <Text style={styles.menuLabel}>Visit Our Website</Text>
              <Text style={styles.settingHint}>theruncheck.app</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

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
    marginRight: SPACING.md,
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
  settingTextWrap: {
    flex: 1,
    flexShrink: 1,
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
  // ── Notifications blocked banner ────────────────────────────────────────
  notifBlockedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: '#FF9F0A18',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#FF9F0A44',
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  notifBlockedText: {
    flex: 1,
  },
  notifBlockedTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FF9F0A',
    marginBottom: 2,
  },
  notifBlockedDesc: {
    fontSize: 11,
    color: '#FF9F0A',
    opacity: 0.85,
    lineHeight: 15,
  },
  notifBlockedButton: {
    backgroundColor: '#FF9F0A',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    alignSelf: 'center',
  },
  notifBlockedButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#fff',
  },
  // ── Collapsible expand rows ──────────────────────────────────────────────
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  expandRowLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textMuted,
  },
  // ── Push Notification type list ──────────────────────────────────────────
  autoCheckInInfo: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  autoCheckInInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  autoCheckInInfoIcon: {
    fontSize: 15,
    lineHeight: 20,
    width: 22,
    textAlign: 'center',
  },
  autoCheckInInfoText: {
    flex: 1,
  },
  autoCheckInInfoLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  autoCheckInInfoDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 1,
  },
  autoCheckInNote: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  notifTypeList: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  notifTypeListDimmed: {
    opacity: 0.38,
  },
  notifTypeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  notifTypeIcon: {
    fontSize: 15,
    lineHeight: 20,
    width: 22,
    textAlign: 'center',
  },
  notifTypeText: {
    flex: 1,
  },
  notifTypeLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  notifTypeDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 1,
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
