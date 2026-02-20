/**
 * GymMapScreen.js — Interactive Gym Map View
 *
 * Renders all gyms as map markers using `react-native-maps`. Tapping a
 * marker shows a callout with the gym's name, type, and address; tapping
 * the callout navigates to RunDetailsScreen for the full breakdown.
 *
 * Platform handling:
 *   `react-native-maps` is not supported on web (Expo Web / React Native Web).
 *   The import is deferred inside a Platform.OS check so the web bundle
 *   doesn't fail at module resolution time. A fallback message is shown on
 *   web instead.
 *
 * Map center:
 *   - If the user has already granted location permission and `useLocation`
 *     has a cached position, the map centers on the user.
 *   - Otherwise it defaults to `PFLUGERVILLE_CENTER` (the app's primary
 *     target market in the Austin metro area).
 *
 * Marker colors:
 *   - Green  → outdoor court
 *   - Orange → indoor gym
 *
 * Gyms without a `location` field are silently skipped (no marker rendered).
 */

import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';

// Defer the react-native-maps import to avoid a crash on web where the
// native module is unavailable. We assign to module-level vars so the
// JSX below can reference them without optional chaining gymnastics.
let MapView, Marker, Callout;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Callout = Maps.Callout;
}
import { useTheme } from '../contexts';
import { useGyms, useLocation } from '../hooks';
import { GYM_TYPE } from '../services/models';

/** Default map region — centered on Pflugerville, TX with a ~10 km viewport. */
const PFLUGERVILLE_CENTER = {
  latitude: 30.4583,
  longitude: -97.6200,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/**
 * GymMapScreen — Interactive map showing all gym locations.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for setting the header title and navigating to RunDetails.
 * @returns {JSX.Element}
 */
export default function GymMapScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { gyms, loading } = useGyms();
  const { location } = useLocation();

  // Set the navigation header title dynamically so the back button reads correctly
  useEffect(() => {
    navigation.setOptions({ title: 'Nearby Courts' });
  }, [navigation]);

  // Center on the user's actual location if available; fall back to the default region
  const initialRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : PFLUGERVILLE_CENTER;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Web fallback — maps are not available in the browser build
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Map view is not available on web. Please use the mobile app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        testID="gym-map"
      >
        {gyms.map((gym) => {
          // Skip gyms that don't have GPS coordinates stored in Firestore
          if (!gym.location) return null;
          const isOutdoor = gym.type === GYM_TYPE.OUTDOOR;

          return (
            <Marker
              key={gym.id}
              coordinate={{
                latitude: gym.location.latitude,
                longitude: gym.location.longitude,
              }}
              // Color-coded by type: green = outdoor, orange = indoor
              pinColor={isOutdoor ? 'green' : 'orange'}
              testID={`marker-${gym.id}`}
            >
              {/* Callout bubble shown when the marker is tapped */}
              <Callout
                onPress={() =>
                  // Navigate into the RunDetails screen within the Runs stack
                  navigation.navigate('RunDetails', {
                    gymId: gym.id,
                    gymName: gym.name,
                    players: gym.currentPresenceCount || 0,
                  })
                }
              >
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{gym.name}</Text>
                  <Text style={styles.calloutType}>
                    {isOutdoor ? 'Outdoor' : 'Indoor'}
                  </Text>
                  <Text style={styles.calloutAddress}>{gym.address}</Text>
                  <Text style={styles.calloutTap}>Tap for details</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for GymMapScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
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
    map: {
      flex: 1,
    },
    callout: {
      minWidth: 180,
      padding: SPACING.xs,
    },
    calloutTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
    calloutType: {
      fontSize: FONT_SIZES.small,
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.medium,
      marginTop: 2,
      letterSpacing: 0.2,
    },
    calloutAddress: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    calloutTap: {
      fontSize: FONT_SIZES.xs,
      color: colors.primary,
      marginTop: SPACING.xs,
      fontStyle: 'italic',
    },
  });
