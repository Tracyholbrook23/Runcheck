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

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo } from '../components';
import { usePresence, useGyms, useProfile, useLivePresenceMap } from '../hooks';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import { isLocationGranted } from '../utils/locationUtils';

/**
 * GymThumbnail — Small rounded gym image, falling back to an icon.
 * Matches the same pattern used in ProfileScreen's My Courts section.
 */
function GymThumbnail({ gym, fallbackIcon, iconColor, style }) {
  const source = GYM_LOCAL_IMAGES[gym.id]
    ? GYM_LOCAL_IMAGES[gym.id]
    : gym.imageUrl
    ? { uri: gym.imageUrl }
    : null;

  if (source) {
    return (
      <Image
        source={source}
        style={[{ width: 36, height: 36, borderRadius: RADIUS.sm }, style]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[{ width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Ionicons name={fallbackIcon} size={18} color={iconColor} />
    </View>
  );
}

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
  const { countMap: liveCountMap } = useLivePresenceMap();

  const {
    presence,
    loading: presenceLoading,
    isCheckedIn,
    checkOut,
    checkingOut,
    getTimeRemaining,
  } = usePresence();

  // ── Location permission state ─────────────────────────────────────────────
  const [locationEnabled, setLocationEnabled] = useState(true); // optimistic default

  const checkLocationStatus = useCallback(async () => {
    const granted = await isLocationGranted();
    setLocationEnabled(granted);
  }, []);

  useEffect(() => { checkLocationStatus(); }, [checkLocationStatus]);

  const handleEnableLocation = async () => {
    // First check the current status to decide whether to request or open Settings
    const { status: currentStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();

    if (currentStatus === 'granted') {
      setLocationEnabled(true);
      return;
    }

    // If we can still ask (undetermined or soft-denied), show the native prompt
    if (canAskAgain) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationEnabled(true);
      }
      // If denied, do nothing — the CTA stays visible for next tap
      return;
    }

    // Permission permanently denied — must go to Settings
    Alert.alert(
      'Location Permission',
      'Location was previously denied. Please enable it in Settings for RunCheck.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  };

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
      if (__DEV__) console.error('Check-out error:', error);
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
          {/* Header with gradient */}
          <LinearGradient
            colors={['#3D1E00', '#1A0A00', colors.background]}
            locations={[0, 0.55, 1]}
            style={styles.headerGradient}
          >
            <View style={styles.header}>
              <Text style={styles.screenTitle}>Check In</Text>
            </View>
          </LinearGradient>

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
        {/* Header with gradient */}
        <LinearGradient
          colors={['#3D1E00', '#1A0A00', colors.background]}
          locations={[0, 0.55, 1]}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Check In</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Logo */}
          <View style={styles.iconWrap}>
            <Logo size="medium" />
          </View>

          <Text style={styles.notCheckedTitle}>Not Checked In</Text>
          <Text style={styles.notCheckedSubtitle}>
            You must be at the gym to check in. Find a run and tap{' '}
            <Text style={styles.emphasis}>Check In Here</Text>
            {' '}when you arrive.
          </Text>

          {/* Location permission CTA — shown when location is not granted */}
          {!locationEnabled && (
            <TouchableOpacity style={styles.locationCard} activeOpacity={0.8} onPress={handleEnableLocation}>
              <View style={styles.locationCardIcon}>
                <Ionicons name="location" size={20} color="#F97316" />
              </View>
              <View style={styles.locationCardContent}>
                <Text style={styles.locationCardTitle}>Enable Location</Text>
                <Text style={styles.locationCardSubtitle}>
                  Required for check-in. Also enables automatic check-out.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

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
            <View style={styles.courtsCard}>
              <Text style={styles.courtsCardTitle}>Your Courts</Text>
              {followedGymItems.map((gym, index) => (
                <TouchableOpacity
                  key={gym.id}
                  activeOpacity={0.7}
                  onPress={() =>
                    navigation.getParent()?.navigate('Runs', {
                      screen: 'RunDetails',
                      params: { gymId: gym.id, gymName: gym.name, players: 0 },
                    })
                  }
                  style={[
                    styles.courtRow,
                    index < followedGymItems.length - 1 && styles.courtRowBorder,
                  ]}
                >
                  <GymThumbnail
                    gym={gym}
                    fallbackIcon="basketball-outline"
                    iconColor={colors.primary}
                    style={!gym.imageUrl && !GYM_LOCAL_IMAGES[gym.id] ? styles.courtIcon : null}
                  />
                  <View style={styles.courtInfo}>
                    <Text style={styles.courtName} numberOfLines={1}>{gym.name}</Text>
                    <Text style={styles.courtMeta}>{gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}</Text>
                  </View>
                  <View style={styles.courtChevron}>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </View>
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
    headerGradient: {
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xl * 4,
    },
    header: {
      paddingHorizontal: SPACING.lg,
    },
    screenTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
      letterSpacing: -0.3,
    },

    // ── Body ──────────────────────────────────────────────
    body: {
      flex: 1,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      marginTop: -SPACING.xl * 3,
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
      width: 136,
      height: 136,
      borderRadius: RADIUS.xl,
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

    // ── Location CTA card ────────────────────────────────
    locationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      width: '100%',
      borderWidth: 1,
      borderColor: 'rgba(249,115,22,0.25)',
    },
    locationCardIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(249,115,22,0.12)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.sm,
    },
    locationCardContent: {
      flex: 1,
    },
    locationCardTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    locationCardSubtitle: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      lineHeight: 16,
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

    // ── Courts card (matches ProfileScreen My Courts) ─────
    courtsCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginTop: SPACING.lg,
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    courtsCardTitle: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },
    courtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    courtRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    courtIcon: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.sm,
      backgroundColor: colors.primary + '18',
      justifyContent: 'center',
      alignItems: 'center',
    },
    courtInfo: {
      flex: 1,
    },
    courtName: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    courtMeta: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    courtChevron: {
      paddingLeft: SPACING.xs,
    },
  });
