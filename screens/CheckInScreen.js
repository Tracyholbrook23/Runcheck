/**
 * CheckInScreen.js — Gym Check-In Interface
 *
 * Allows users to select a gym and check in, proving they are physically
 * present via GPS validation (handled inside `usePresence.checkIn`).
 *
 * Screen states:
 *   1. Loading — shows a spinner while gyms and presence data are fetched.
 *   2. Already Checked In — if the user has an active presence, shows the
 *      current gym name, time remaining, and a hint to check out from Home.
 *   3. Check-In Form — the main state: a gym dropdown, info box, "Hot Right
 *      Now" nearby activity scroll, Check In button, and Back to Home button.
 *
 * GPS error handling maps raw `usePresence` errors to user-friendly alerts:
 *   - "permission denied" → prompts to enable location services
 *   - "Unable to retrieve" → prompts to check GPS is on
 *   - Any other error     → shows the raw error message
 *
 * The DropDownPicker uses `zIndex: 5000` so its dropdown overlay appears
 * above all other content when open. `containerStyle` is dynamically
 * adjusted to reserve space below the picker when it is open.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo } from '../components';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { usePresence, useGyms } from '../hooks';

/**
 * CheckInScreen — GPS-gated gym check-in screen.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for hiding the header and navigating to other tabs.
 * @returns {JSX.Element}
 */
export default function CheckInScreen({ navigation }) {
  // Dropdown open/close and selected value state — required by DropDownPicker API
  const [open, setOpen] = useState(false);
  const [selectedGym, setSelectedGym] = useState(null);
  const [gymItems, setGymItems] = useState([]);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const {
    presence,
    loading: presenceLoading,
    isCheckedIn,
    checkIn,
    checkingIn,
    getTimeRemaining,
  } = usePresence();

  const {
    gyms,
    loading: gymsLoading,
    ensureGymsExist,
  } = useGyms();

  // Hide the default stack header — this screen uses its own layout
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Trigger gym seed/migration on mount to ensure GPS coordinates are available
  useEffect(() => {
    ensureGymsExist();
  }, [ensureGymsExist]);

  // Transform the Firestore gyms array into the format DropDownPicker expects:
  // { label: string, value: string, gymName: string }
  useEffect(() => {
    const items = gyms.map((gym) => ({
      label: `${gym.name} (${gym.currentPresenceCount || 0} here)`,
      value: gym.id,
      gymName: gym.name,
    }));
    setGymItems(items);
  }, [gyms]);

  /**
   * handleCheckIn — Validates selection and triggers GPS-gated check-in.
   *
   * Looks up the selected gym's display name from `gymItems` before calling
   * `checkIn(gymId)` so the success alert can show the gym name.
   * On success, shows a confirmation alert with a shortcut to the Runs tab.
   * On failure, maps the error to a user-friendly message.
   */
  const handleCheckIn = async () => {
    if (!selectedGym) {
      Alert.alert('Select a Gym', 'Please select a gym to check into.');
      return;
    }

    try {
      const gymItem = gymItems.find((item) => item.value === selectedGym);
      const gymName = gymItem?.gymName || selectedGym;

      await checkIn(selectedGym);

      Alert.alert(
        'Checked In!',
        `You're now checked in at ${gymName}. Your check-in will expire in 3 hours.`,
        [
          {
            text: 'View Gyms',
            onPress: () => navigation.getParent()?.navigate('Runs'),
          },
        ]
      );
    } catch (error) {
      console.error('Check-in error:', error);
      if (error.message.includes('permission denied')) {
        Alert.alert(
          'Location Required',
          'Please enable location services to check in. We use your location to verify you are at the gym.'
        );
      } else if (error.message.includes('Unable to retrieve')) {
        Alert.alert(
          'GPS Unavailable',
          'Could not get your location. Please check that GPS is enabled and try again.'
        );
      } else {
        Alert.alert('Check-in Failed', error.message || 'Please try again.');
      }
    }
  };

  // Placeholder activity data sorted by current player count descending
  // so the busiest courts appear first in the horizontal scroll
  const fakeActivityGyms = [
    { id: 'fa1', name: 'Pan American Rec Center', currentPresenceCount: 10, plannedToday: 5 },
    { id: 'fa2', name: 'Life Time Austin North', currentPresenceCount: 9, plannedToday: 7 },
    { id: 'fa3', name: "Gold's Gym Hester's Crossing", currentPresenceCount: 12, plannedToday: 3 },
    { id: 'fa4', name: 'Clay Madsen Rec Center', currentPresenceCount: 5, plannedToday: 4 },
  ].sort((a, b) => b.currentPresenceCount - a.currentPresenceCount);

  // Combine presence and gyms loading states for a single loading flag
  const loading = presenceLoading || gymsLoading;
  const isProcessing = checkingIn;

  // State 2: Already checked in — show active session info instead of the form
  if (isCheckedIn && presence) {
    const timeRemaining = getTimeRemaining();

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.activeContainer}>
          <Text style={styles.activeTitle}>You're Already Checked In</Text>
          <View style={styles.activeCard}>
            <Text style={styles.activeGym}>{presence.gymName}</Text>
            <Text style={styles.activeTime}>
              {timeRemaining ? `Expires in ${timeRemaining}` : 'Expiring soon...'}
            </Text>
          </View>
          <Text style={styles.activeHint}>
            Check out from the Home screen to check in elsewhere.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.getParent()?.navigate('Home')}
          >
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // State 1: Loading spinner
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Logo size="small" style={{ marginBottom: SPACING.sm }} />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading gyms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // State 3: Check-in form
  return (
    <SafeAreaView style={styles.safe}>
      {/*
       * KeyboardAvoidingView prevents the dropdown and button from being
       * covered by the software keyboard on iOS when the picker is open.
       */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.innerContainer}>
          <Text style={styles.title}>Check Into a Gym</Text>
          <Text style={styles.subtitle}>
            Let others know you're here to play
          </Text>

          <Text style={styles.label}>Select Gym:</Text>

          {/*
           * DropDownPicker — controlled component with high zIndex so its
           * dropdown overlay appears above sibling Views.
           * containerStyle height expands when open to push content down
           * and prevent overlap with the dropdown list.
           */}
          <DropDownPicker
            open={open}
            value={selectedGym}
            items={gymItems}
            setOpen={setOpen}
            setValue={setSelectedGym}
            setItems={setGymItems}
            placeholder="Choose a gym"
            containerStyle={{ marginBottom: open ? 200 : 20 }}
            style={styles.dropdown}
            dropDownContainerStyle={styles.dropdownContainer}
            textStyle={{ color: colors.textPrimary }}
            placeholderStyle={{ color: colors.textMuted }}
            listItemLabelStyle={{ color: colors.textPrimary }}
            selectedItemLabelStyle={{ color: colors.primary }}
            zIndex={5000}
            zIndexInverse={1000}
            listMode="SCROLLVIEW"
          />

          {/* Info box explaining auto-expiry behavior */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Your check-in will automatically expire after 3 hours, or you can
              check out manually from the Home screen.
            </Text>
          </View>

          {/* Hot Right Now — horizontally scrollable chips sorted by player count */}
          <View style={styles.nearbySection}>
            <Text style={styles.nearbyTitle}>Hot Right Now</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.nearbyScroll}
              contentContainerStyle={styles.nearbyScrollContent}
            >
              {fakeActivityGyms.map((gym) => (
                <View key={gym.id} style={styles.nearbyChip}>
                  <View style={styles.nearbyDot} />
                  <View>
                    <Text style={styles.nearbyGymName} numberOfLines={1}>{gym.name}</Text>
                    <Text style={styles.nearbyCount}>{gym.currentPresenceCount} playing now</Text>
                    {gym.plannedToday > 0 && (
                      <Text style={styles.nearbyPlanned}>+{gym.plannedToday} planned today</Text>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Sticky footer with primary Check In and secondary Back to Home buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.checkInButton, isProcessing && styles.buttonDisabled]}
            onPress={handleCheckIn}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.checkInButtonText}>Check In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.getParent()?.navigate('Home')}
          >
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for CheckInScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },
  innerContainer: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    zIndex: 1000,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
    textAlign: 'left',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    textAlign: 'left',
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
    color: colors.textPrimary,
  },
  dropdown: {
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    backgroundColor: colors.surfaceLight,  // Elevated input surface
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  dropdownContainer: {
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    backgroundColor: colors.surfaceLight,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  infoBox: {
    backgroundColor: colors.infoBackground,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZES.small,
    color: colors.infoText,
    lineHeight: 20,
  },
  nearbySection: {
    marginTop: SPACING.lg,
  },
  nearbyTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  nearbyScroll: {
    marginHorizontal: -SPACING.lg,
  },
  nearbyScrollContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  nearbyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  nearbyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  nearbyGymName: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
    maxWidth: 150,
  },
  nearbyCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: 1,
  },
  nearbyPlanned: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkInButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  secondaryButton: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  activeContainer: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginBottom: SPACING.lg,
    letterSpacing: 0.5,
  },
  activeCard: {
    backgroundColor: colors.presenceBackground,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  activeGym: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.presenceTextBright,
    marginBottom: SPACING.sm,
    letterSpacing: 0.3,
  },
  activeTime: {
    fontSize: FONT_SIZES.body,
    color: colors.presenceText,
  },
  activeHint: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg * 2,
  },
  backButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
