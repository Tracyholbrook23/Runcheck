/**
 * CheckInScreen.js — Check-In Status Screen
 *
 * Repurposed from a gym-picker form into a clean session status screen.
 * The primary check-in path is via the "Check In Here" button on RunDetailsScreen.
 *
 * Screen states:
 *   1. Loading     — spinner while presence data loads.
 *   2. Checked In  — current gym, time remaining, "View This Run" + "Check Out" buttons.
 *   3. Not Checked In — status message, "Find a Run" CTA, optional followed-gym shortcuts.
 */

import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence, useGyms, useProfile } from '../hooks';

/**
 * CheckInScreen — Session status screen.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function CheckInScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const { followedGyms } = useProfile();
  const { gyms } = useGyms();

  const {
    presence,
    loading: presenceLoading,
    isCheckedIn,
    checkOut,
    checkingOut,
    getTimeRemaining,
  } = usePresence();

  // Hide the default stack header — this screen uses its own layout
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  /**
   * handleCheckOut — delegates to usePresence.checkOut() (manual check-out).
   * Points are NOT deducted on checkout — the check-in already counted as
   * attendance and that record is permanent regardless of when you leave.
   */
  const handleCheckOut = async () => {
    try {
      await checkOut();
      Alert.alert(
        'Checked Out',
        "You've been checked out. Your session has been recorded.",
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Check-out error:', error);
      Alert.alert('Check-out Failed', error.message || 'Please try again.');
    }
  };

  /** Navigate to the RunDetails screen for the active session. */
  const handleViewRun = () => {
    if (!presence) return;
    navigation.getParent()?.navigate('Runs', {
      screen: 'RunDetails',
      params: { gymId: presence.gymId, gymName: presence.gymName, players: 0 },
    });
  };

  /** Switch to the Runs tab so the user can browse gyms. */
  const handleFindRun = () => {
    navigation.getParent()?.navigate('Runs');
  };

  /**
   * Build the list of followed gyms to show as quick-nav shortcuts.
   * Cross-references followedGyms (array of IDs) with the gyms catalogue.
   * Capped at 3 entries to keep the UI compact.
   */
  const followedGymItems = useMemo(() => {
    if (!followedGyms?.length || !gyms?.length) return [];
    return followedGyms
      .slice(0, 3)
      .map((gymId) => gyms.find((g) => g.id === gymId))
      .filter(Boolean);
  }, [followedGyms, gyms]);

  // ── State 1: Loading ───────────────────────────────────────────────────────
  if (presenceLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── State 2: Checked In ────────────────────────────────────────────────────
  if (isCheckedIn && presence) {
    const timeRemaining = getTimeRemaining();

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Check In</Text>
          </View>

          <View style={styles.body}>
            {/* Live status pill */}
            <View style={styles.statusPill}>
              <View style={styles.liveDot} />
              <Text style={styles.statusPillText}>You're Checked In</Text>
            </View>

            {/* Active session card */}
            <View style={styles.activeCard}>
              <Ionicons
                name="basketball-outline"
                size={28}
                color={colors.presenceTextBright}
                style={{ marginBottom: SPACING.xs }}
              />
              <Text style={styles.activeGym}>{presence.gymName}</Text>
              <Text style={styles.activeTime}>
                {timeRemaining ? `${timeRemaining} remaining` : 'Expiring soon…'}
              </Text>
            </View>

            {/* View This Run */}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleViewRun}
              activeOpacity={0.82}
            >
              <Text style={styles.primaryButtonText}>View This Run</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" style={{ marginLeft: SPACING.xs }} />
            </TouchableOpacity>

            {/* Check Out — outlined danger button */}
            <TouchableOpacity
              style={[styles.checkOutButton, checkingOut && styles.buttonDisabled]}
              onPress={handleCheckOut}
              disabled={checkingOut}
              activeOpacity={0.82}
            >
              {checkingOut ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Text style={styles.checkOutButtonText}>Check Out</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>
              Checking out early deducts 10 pts. Auto-expiry after 3 hrs keeps your points.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── State 3: Not Checked In ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Check In</Text>
        </View>

        <View style={styles.body}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="basketball-outline" size={48} color={colors.textMuted} />
          </View>

          <Text style={styles.notCheckedTitle}>Not Checked In</Text>
          <Text style={styles.notCheckedSubtitle}>
            You're not checked into a gym right now. Find a run and tap{' '}
            <Text style={styles.emphasis}>Check In Here</Text>
            {' '}to join.
          </Text>

          {/* Primary CTA */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleFindRun}
            activeOpacity={0.82}
          >
            <Ionicons name="search-outline" size={18} color="#fff" style={{ marginRight: SPACING.xs }} />
            <Text style={styles.primaryButtonText}>Find a Run</Text>
          </TouchableOpacity>

          {/* Followed gym quick-nav shortcuts */}
          {followedGymItems.length > 0 && (
            <View style={styles.shortcutsSection}>
              <Text style={styles.shortcutsLabel}>Your Gyms</Text>
              {followedGymItems.map((gym) => (
                <TouchableOpacity
                  key={gym.id}
                  style={styles.gymShortcut}
                  activeOpacity={0.75}
                  onPress={() =>
                    navigation.getParent()?.navigate('Runs', {
                      screen: 'RunDetails',
                      params: { gymId: gym.id, gymName: gym.name, players: 0 },
                    })
                  }
                >
                  <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginRight: SPACING.xs }} />
                  <Text style={styles.gymShortcutText}>{gym.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * getStyles — Themed StyleSheet for CheckInScreen.
 *
 * @param {object}  colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Header ────────────────────────────────────────────
    header: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    screenTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },

    // ── Body ──────────────────────────────────────────────
    body: {
      flex: 1,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xl,
      alignItems: 'center',
    },

    // ── Checked-in state ──────────────────────────────────
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#132A1F' : '#DCFCE7',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: 5,
      marginBottom: SPACING.lg,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
      marginRight: SPACING.xs,
    },
    statusPillText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.success,
    },
    activeCard: {
      width: '100%',
      backgroundColor: colors.presenceBackground,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      alignItems: 'center',
      marginBottom: SPACING.lg,
      borderWidth: 1,
      borderColor: isDark ? 'transparent' : colors.border,
      ...SHADOWS.card,
    },
    activeGym: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.presenceTextBright,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    activeTime: {
      fontSize: FONT_SIZES.body,
      color: colors.presenceText,
    },

    // ── Not-checked-in state ──────────────────────────────
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    notCheckedTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
    },
    notCheckedSubtitle: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: SPACING.xl,
      paddingHorizontal: SPACING.md,
    },
    emphasis: {
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.primary,
    },

    // ── Shared buttons ────────────────────────────────────
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: RADIUS.sm,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      width: '100%',
      marginBottom: SPACING.md,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    checkOutButton: {
      width: '100%',
      borderRadius: RADIUS.sm,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: isDark ? 'transparent' : '#FEF2F2',
    },
    checkOutButtonText: {
      color: colors.danger,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    hint: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: SPACING.md,
    },

    // ── Followed gym shortcuts ────────────────────────────
    shortcutsSection: {
      width: '100%',
      marginTop: SPACING.lg,
    },
    shortcutsLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: SPACING.xs,
    },
    gymShortcut: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    gymShortcutText: {
      flex: 1,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.medium,
    },
  });
