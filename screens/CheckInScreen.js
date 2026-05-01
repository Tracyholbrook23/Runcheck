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
  ImageBackground,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, ScreenHelpButton } from '../components';
import RatingPromptModal from '../components/RatingPromptModal';
import { usePresence, useGyms, useProfile, useLivePresenceMap, useProximityCheckIn } from '../hooks';
import { useRatingPrompt } from '../hooks/useRatingPrompt';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import { isLocationGranted } from '../utils/locationUtils';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { subscribeToUserSchedules } from '../services/scheduleService';
import { auth } from '../config/firebase';

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

  const { followedGyms, profile } = useProfile();
  const { gyms } = useGyms();
  const { countMap: liveCountMap } = useLivePresenceMap();

  // ── Rating prompt ─────────────────────────────────────────────────────────
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const { checkForRatingPrompt, handleLoveIt, handleNotReally } = useRatingPrompt();

  const maybePromptRating = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'users', uid));
      const totalAttended = snap.data()?.reliability?.totalAttended ?? 0;
      await checkForRatingPrompt(totalAttended, () => setRatingModalVisible(true));
    } catch {
      // Never block the check-in flow
    }
  }, [checkForRatingPrompt]);

  // Read auto check-in preference (default true)
  const autoCheckInEnabled = profile?.preferences?.autoCheckInEnabled ?? true;

  // ── User's active schedules (for auto check-in) ───────────────────────────
  const [userSchedules, setUserSchedules] = useState([]);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = subscribeToUserSchedules(uid, (schedules) => {
      setUserSchedules(schedules);
    });
    return () => unsub();
  }, []);

  const {
    presence: rawPresence,
    loading: presenceLoading,
    isCheckedIn: rawIsCheckedIn,
    checkIn,
    checkOut,
    checkingIn,
    checkingOut,
    getTimeRemaining: rawGetTimeRemaining,
  } = usePresence();

  // ─── SCREENSHOT MODE ────────────────────────────────────────────────────────
  // Flip to true before screenshots, back to false before shipping.
  const SCREENSHOT_MODE = false;

  const MOCK_PRESENCE = {
    gymId:       'austin-sports-center-central',
    gymName:     'Austin Sports Center - Central',
    checkedInAt: { toDate: () => new Date(Date.now() - 38 * 60000) },
    expiresAt:   { toDate: () => new Date(Date.now() + 82 * 60000) },
    status:      'ACTIVE',
  };

  const presence        = SCREENSHOT_MODE ? MOCK_PRESENCE : rawPresence;
  const isCheckedIn     = SCREENSHOT_MODE ? true          : rawIsCheckedIn;
  const getTimeRemaining = SCREENSHOT_MODE
    ? () => '1h 22m'
    : rawGetTimeRemaining;
  // ────────────────────────────────────────────────────────────────────────────

  // ── Smart proximity check-in ──────────────────────────────────────────────
  // Polls GPS every 30 s while the app is active. When the user is inside a
  // gym's check-in radius and hasn't dismissed the prompt in the last 30 min,
  // nearbyGym is set and we show a one-tap check-in card.
  // If the user has a scheduled visit at the detected gym, we auto check-in
  // silently and show a brief confirmation banner instead.

  // Banner shown briefly after a successful auto check-in
  const [autoCheckInBanner, setAutoCheckInBanner] = useState(null); // null | gym object

  const handleAutoCheckIn = useCallback(async (gym) => {
    try {
      await checkIn(gym.id);
      hapticSuccess();
      setAutoCheckInBanner(gym);
      // Auto-dismiss banner after 4 seconds
      setTimeout(() => setAutoCheckInBanner(null), 4000);
      maybePromptRating();
    } catch (err) {
      if (__DEV__) console.warn('[AUTO CHECK-IN] Failed:', err?.message);
      // Fall back to a regular alert if auto check-in fails
      Alert.alert(
        'Auto Check-In Failed',
        err?.message || 'Could not check you in automatically. Please tap "Check In" manually.',
      );
    }
  }, [checkIn]);

  const { nearbyGym, dismiss: dismissProximity } = useProximityCheckIn({
    gyms,
    isCheckedIn,
    userSchedules,
    onAutoCheckIn: autoCheckInEnabled ? handleAutoCheckIn : null,
  });

  // ── Proximity check-in handler ────────────────────────────────────────────
  const [proximityCheckingIn, setProximityCheckingIn] = useState(false);

  const handleProximityCheckIn = async () => {
    if (!nearbyGym || proximityCheckingIn) return;
    setProximityCheckingIn(true);
    try {
      await checkIn(nearbyGym.id);
      // nearbyGym clears automatically via the isCheckedIn effect in the hook
      maybePromptRating();
    } catch (err) {
      Alert.alert(
        'Check-In Failed',
        err?.message || 'Could not check you in. Please try again.',
      );
    } finally {
      setProximityCheckingIn(false);
    }
  };

  // ── Location permission state ─────────────────────────────────────────────
  const [locationEnabled, setLocationEnabled] = useState(true); // optimistic default

  const checkLocationStatus = useCallback(async () => {
    const granted = await isLocationGranted();
    setLocationEnabled(granted);
  }, []);

  // Re-check on every focus (e.g. after returning from Settings)
  useFocusEffect(useCallback(() => { checkLocationStatus(); }, [checkLocationStatus]));

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

  /**
   * handleLocationToggle — called by the location Switch on the Not Checked In screen.
   *
   * Toggling ON  → request foreground permission (or open Settings if permanently denied).
   * Toggling OFF → iOS does not allow revoking permissions from within the app;
   *                show an alert directing the user to Settings.
   */
  const handleLocationToggle = async (value) => {
    if (value) {
      // User wants to enable — request permission (or open Settings if hard-denied)
      await handleEnableLocation();
      // Re-check actual state after the dialog dismisses
      checkLocationStatus();
    } else {
      Alert.alert(
        'Location Is Required',
        'Without location access, you won\'t be able to check in to gyms, get proximity prompts when you arrive, or use auto check-out when you leave. These are core RunCheck features.\n\nTo disable location, go to Settings → Privacy & Security → Location Services.',
        [
          { text: 'Keep Enabled', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
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
      hapticLight();
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

  /**
   * todaySchedule / scheduledGym — the user's next scheduled visit today.
   * Used to show a "Planning to play at X" hero when GPS hasn't detected them yet.
   */
  const todaySchedule = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay   = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    return userSchedules
      .filter((s) => {
        const t = s.scheduledTime?.toDate?.();
        return t && t >= startOfDay && t <= endOfDay && s.status === 'scheduled';
      })
      .sort((a, b) => a.scheduledTime.toDate() - b.scheduledTime.toDate())[0] ?? null;
  }, [userSchedules]);

  const scheduledGym = useMemo(() => {
    if (!todaySchedule || !gyms?.length) return null;
    return gyms.find((g) => g.id === todaySchedule.gymId) ?? null;
  }, [todaySchedule, gyms]);

  // Manual check-in handler for the scheduled gym card
  const [scheduledCheckingIn, setScheduledCheckingIn] = useState(false);
  const handleScheduledCheckIn = async (gymId) => {
    if (scheduledCheckingIn) return;
    setScheduledCheckingIn(true);
    try {
      await checkIn(gymId);
      maybePromptRating();
    } catch (err) {
      Alert.alert(
        'Check-In Failed',
        err?.message || 'Make sure you\'re at the gym and within GPS range.',
      );
    } finally {
      setScheduledCheckingIn(false);
    }
  };

  // ── State 1: Loading ───────────────────────────────────────────────────────
  if (presenceLoading) {
    return (
      <ImageBackground source={require('../assets/images/runs-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // ── State 2: Checked In ────────────────────────────────────────────────────
  if (isCheckedIn && presence) {
    const timeRemaining = getTimeRemaining();

    return (
      <ImageBackground source={require('../assets/images/runs-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.headerGradient}>
            <View style={styles.header}>
              <Text style={styles.screenTitle}>Check In</Text>
            </View>
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
              Your points are yours — checking out never deducts them.
            </Text>
          </View>
        </View>
      </SafeAreaView>
      </ImageBackground>
    );
  }

  // ── State 3: Not Checked In ────────────────────────────────────────────────
  //
  // 3A — GPS has detected a nearby gym → hero check-in UI
  // 3B — User has a scheduled visit today (no nearby gym yet) → planned gym card
  // 3C — Fallback: nothing detected, nothing scheduled → existing layout

  // ── 3A: GPS-detected nearby gym ───────────────────────────────────────────
  if (nearbyGym && locationEnabled) {
    return (
      <ImageBackground source={require('../assets/images/runs-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.container}>
            <View style={styles.headerGradient}>
              <View style={styles.header}>
                <Text style={styles.screenTitle}>Check In</Text>
              </View>
            </View>

            <View style={styles.heroBody}>
              {/* Auto check-in banner */}
              {autoCheckInBanner && (
                <View style={styles.autoCheckInBanner}>
                  <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                  <View style={styles.autoCheckInBannerContent}>
                    <Text style={styles.autoCheckInBannerTitle}>Auto Checked In!</Text>
                    <Text style={styles.autoCheckInBannerSubtitle}>
                      Checked in at {autoCheckInBanner.name} based on your scheduled visit.
                    </Text>
                  </View>
                </View>
              )}

              {/* GPS label */}
              <View style={styles.gpsPill}>
                <View style={styles.gpsDot} />
                <Text style={styles.gpsPillText}>GPS DETECTED YOU AT</Text>
              </View>

              {/* Gym name */}
              <Text style={styles.heroGymName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {nearbyGym.name}
              </Text>

              {/* Gym address / meta */}
              {nearbyGym.address && (
                <Text style={styles.heroGymMeta}>{nearbyGym.address}</Text>
              )}

              {/* Big circular check-in button */}
              <TouchableOpacity
                style={[styles.bigCheckInBtn, proximityCheckingIn && styles.bigCheckInBtnDisabled]}
                onPress={handleProximityCheckIn}
                disabled={proximityCheckingIn}
                activeOpacity={0.85}
              >
                {proximityCheckingIn ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.bigCheckInLabel}>TAP TO</Text>
                    <Text style={styles.bigCheckInText}>Check In</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Wrong gym link */}
              <TouchableOpacity
                onPress={() => dismissProximity(nearbyGym.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.wrongGymText}>
                  Wrong gym?{' '}
                  <Text style={styles.wrongGymLink} onPress={handleFindRun}>Search manually</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
        <RatingPromptModal
          visible={ratingModalVisible}
          onLoveIt={() => { setRatingModalVisible(false); handleLoveIt(); }}
          onNotReally={() => { setRatingModalVisible(false); handleNotReally(); }}
          onDismiss={() => setRatingModalVisible(false)}
        />
      </ImageBackground>
    );
  }

  // ── 3B: Scheduled visit today ──────────────────────────────────────────────
  if (scheduledGym) {
    const schedTime = todaySchedule?.scheduledTime?.toDate?.();
    const schedLabel = schedTime
      ? schedTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : null;

    return (
      <ImageBackground source={require('../assets/images/runs-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.container}>
            <View style={styles.headerGradient}>
              <View style={styles.header}>
                <Text style={styles.screenTitle}>Check In</Text>
              </View>
            </View>

            <View style={styles.heroBody}>
              {/* Eyebrow */}
              <View style={styles.gpsPill}>
                <Ionicons name="calendar-outline" size={12} color={colors.primary} style={{ marginRight: 5 }} />
                <Text style={styles.gpsPillText}>PLANNING TO PLAY TODAY</Text>
              </View>

              {/* Gym thumbnail */}
              <View style={styles.scheduledGymThumb}>
                {(GYM_LOCAL_IMAGES[scheduledGym.id] || scheduledGym.imageUrl) ? (
                  <Image
                    source={GYM_LOCAL_IMAGES[scheduledGym.id] ?? { uri: scheduledGym.imageUrl }}
                    style={styles.scheduledGymThumbImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="basketball-outline" size={36} color={colors.primary} />
                )}
              </View>

              {/* Gym name */}
              <Text style={styles.heroGymName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {scheduledGym.name}
              </Text>

              {schedLabel && (
                <Text style={styles.heroGymMeta}>Scheduled for {schedLabel}</Text>
              )}

              {/* Check-in button */}
              <TouchableOpacity
                style={[styles.bigCheckInBtn, scheduledCheckingIn && styles.bigCheckInBtnDisabled]}
                onPress={() => handleScheduledCheckIn(scheduledGym.id)}
                disabled={scheduledCheckingIn}
                activeOpacity={0.85}
              >
                {scheduledCheckingIn ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.bigCheckInLabel}>I'M HERE</Text>
                    <Text style={styles.bigCheckInText}>Check In</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.heroHint}>GPS confirms you're at the gym when you tap</Text>

              {/* Different gym link */}
              <TouchableOpacity
                onPress={handleFindRun}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginTop: SPACING.sm }}
              >
                <Text style={styles.wrongGymText}>
                  Different gym?{' '}
                  <Text style={styles.wrongGymLink}>Search manually</Text>
                </Text>
              </TouchableOpacity>

              {/* Location settings */}
              <View style={[styles.settingsCard, { marginTop: SPACING.xl }]}>
                <View style={styles.settingsRow}>
                  <View style={[
                    styles.settingsIconWrap,
                    locationEnabled ? styles.settingsIconWrapActive : styles.settingsIconWrapInactive,
                  ]}>
                    <Ionicons
                      name={locationEnabled ? 'location' : 'location-outline'}
                      size={18}
                      color={locationEnabled ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <View style={styles.settingsContent}>
                    <Text style={styles.settingsTitle}>Location Services</Text>
                    <Text style={styles.settingsSubtitle}>
                      {locationEnabled ? 'Active — GPS check-in enabled' : 'Required for check-in'}
                    </Text>
                  </View>
                  <Switch
                    value={locationEnabled}
                    onValueChange={handleLocationToggle}
                    trackColor={{ false: colors.border, true: colors.primary + '66' }}
                    thumbColor={locationEnabled ? colors.primary : '#9CA3AF'}
                    ios_backgroundColor={colors.border}
                  />
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
        <RatingPromptModal
          visible={ratingModalVisible}
          onLoveIt={() => { setRatingModalVisible(false); handleLoveIt(); }}
          onNotReally={() => { setRatingModalVisible(false); handleNotReally(); }}
          onDismiss={() => setRatingModalVisible(false)}
        />
      </ImageBackground>
    );
  }

  // ── 3C: Fallback — nothing detected, nothing scheduled ─────────────────────
  return (
    <ImageBackground source={require('../assets/images/runs-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
      <View style={styles.overlay} />
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerGradient}>
          <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={styles.screenTitle}>Check In</Text>
            <ScreenHelpButton screen="checkin" />
          </View>
        </View>

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

          {/* Auto check-in confirmation banner */}
          {autoCheckInBanner && (
            <View style={styles.autoCheckInBanner}>
              <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
              <View style={styles.autoCheckInBannerContent}>
                <Text style={styles.autoCheckInBannerTitle}>Auto Checked In!</Text>
                <Text style={styles.autoCheckInBannerSubtitle}>
                  You were checked in at {autoCheckInBanner.name} based on your scheduled visit.
                </Text>
              </View>
            </View>
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

          {/* Location settings toggle */}
          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>Settings</Text>
            <View style={styles.settingsRow}>
              <View style={[
                styles.settingsIconWrap,
                locationEnabled ? styles.settingsIconWrapActive : styles.settingsIconWrapInactive,
              ]}>
                <Ionicons
                  name={locationEnabled ? 'location' : 'location-outline'}
                  size={18}
                  color={locationEnabled ? colors.primary : colors.textMuted}
                />
              </View>
              <View style={styles.settingsContent}>
                <Text style={styles.settingsTitle}>Location Services</Text>
                <Text style={styles.settingsSubtitle}>
                  {locationEnabled
                    ? 'Active — enables GPS check-in and auto check-out'
                    : 'Required for check-in and proximity detection'}
                </Text>
              </View>
              <Switch
                value={locationEnabled}
                onValueChange={handleLocationToggle}
                trackColor={{ false: colors.border, true: colors.primary + '66' }}
                thumbColor={locationEnabled ? colors.primary : '#9CA3AF'}
                ios_backgroundColor={colors.border}
              />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
    <RatingPromptModal
      visible={ratingModalVisible}
      onLoveIt={() => { setRatingModalVisible(false); handleLoveIt(); }}
      onNotReally={() => { setRatingModalVisible(false); handleNotReally(); }}
      onDismiss={() => setRatingModalVisible(false)}
    />
    </ImageBackground>
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
    bgImage: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.70)',
    },
    safe: {
      flex: 1,
      backgroundColor: 'transparent',
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

    // ── Location settings toggle card ──────────────────────────────────────
    settingsCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginTop: SPACING.lg,
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    settingsCardTitle: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },
    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    settingsIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    settingsIconWrapActive: {
      backgroundColor: colors.primary + '18',
    },
    settingsIconWrapInactive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    },
    settingsContent: {
      flex: 1,
    },
    settingsTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    settingsSubtitle: {
      fontSize: FONT_SIZES.xs,
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

    // ── Hero body (3A + 3B states) ────────────────────────────────────────
    heroBody: {
      flex: 1,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -SPACING.xl * 2,
      paddingBottom: SPACING.xl,
    },

    // GPS / calendar pill label
    gpsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    gpsDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#22C55E',
      marginRight: 6,
    },
    gpsPillText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: 'rgba(255,255,255,0.7)',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },

    // Large gym name on hero states
    heroGymName: {
      fontSize: 34,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: '#FFFFFF',
      textAlign: 'center',
      letterSpacing: -0.5,
      lineHeight: 38,
      marginBottom: SPACING.xs,
      paddingHorizontal: SPACING.sm,
    },
    heroGymMeta: {
      fontSize: FONT_SIZES.small,
      color: 'rgba(255,255,255,0.55)',
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    heroHint: {
      fontSize: FONT_SIZES.xs,
      color: 'rgba(255,255,255,0.40)',
      textAlign: 'center',
      marginTop: SPACING.sm,
    },

    // Big circular check-in button
    bigCheckInBtn: {
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginVertical: SPACING.xl,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55,
      shadowRadius: 28,
      elevation: 16,
    },
    bigCheckInBtnDisabled: {
      opacity: 0.7,
    },
    bigCheckInLabel: {
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.bold,
      color: 'rgba(255,255,255,0.75)',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    bigCheckInText: {
      fontSize: 28,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: '#FFFFFF',
      letterSpacing: -0.5,
    },

    // "Wrong gym? Search manually" link
    wrongGymText: {
      fontSize: FONT_SIZES.small,
      color: 'rgba(255,255,255,0.5)',
      textAlign: 'center',
    },
    wrongGymLink: {
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.semibold,
    },

    // Scheduled gym thumbnail (3B)
    scheduledGymThumb: {
      width: 80,
      height: 80,
      borderRadius: RADIUS.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
      overflow: 'hidden',
    },
    scheduledGymThumbImage: {
      width: 80,
      height: 80,
    },

    // ── Smart proximity prompt card ───────────────────────────────────────
    proximityCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
      backgroundColor: isDark ? '#1C1108' : '#FFF7ED',
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,122,69,0.30)' : 'rgba(255,122,69,0.35)',
      padding: SPACING.md,
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    proximityIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,122,69,0.15)' : 'rgba(255,122,69,0.12)',
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    proximityContent: {
      flex: 1,
    },
    proximityTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginBottom: 3,
    },
    proximitySubtitle: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: SPACING.sm,
    },
    proximityButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    proximityCheckInBtn: {
      backgroundColor: '#FF7A45',
      borderRadius: RADIUS.sm,
      paddingVertical: 8,
      paddingHorizontal: SPACING.md,
      minWidth: 90,
      alignItems: 'center',
    },
    proximityCheckInText: {
      color: '#fff',
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
    },
    proximityDismissBtn: {
      paddingVertical: 8,
      paddingHorizontal: SPACING.sm,
    },
    proximityDismissText: {
      color: colors.textMuted,
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
    },
    autoCheckInBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
      backgroundColor: isDark ? '#0A1F10' : '#F0FDF4',
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(34,197,94,0.30)' : 'rgba(34,197,94,0.35)',
      padding: SPACING.md,
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    autoCheckInBannerContent: {
      flex: 1,
    },
    autoCheckInBannerTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#4ADE80' : '#16A34A',
      marginBottom: 3,
    },
    autoCheckInBannerSubtitle: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });
