/**
 * GymMapScreen.js — Interactive Gym Map View
 *
 * Renders all gyms as map markers using `react-native-maps`. Tapping a
 * marker shows a callout with the gym's name, type, and address; tapping
 * the callout navigates to RunDetailsScreen for the full breakdown.
 *
 * Pin colors are activity-based (not gym type):
 *   🔴 Red    → On Fire   (15+ players)
 *   🟡 Yellow → Poppin    (8–14 players)
 *   🟢 Green  → Active    (1–7 players)
 *   ⚫ Grey   → Dead      (0 players)
 *
 * A floating legend card in the bottom-left explains the color key.
 *
 * SCREENSHOT_MODE — set to true to inject fake player counts for screenshots.
 */

import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';

let MapView, Marker, Callout;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Callout = Maps.Callout;
}
import { useTheme } from '../contexts';
import { useGyms, useLocation } from '../hooks';
import { useLivePresenceMap } from '../hooks';

/**
 * Default map region — Austin, TX fallback only.
 * Used only when GPS has not resolved yet on first render.
 * Once `useLocation()` returns a position, `animateToRegion` re-centers the map.
 */
const AUSTIN_CENTER = {
  latitude: 30.2672,
  longitude: -97.7431,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

// ─── SCREENSHOT MODE ─────────────────────────────────────────────────────────
// Flip to true before taking screenshots, back to false before shipping.
const SCREENSHOT_MODE = false;

// Fake player counts per gym ID — drives pin color for screenshots
const MOCK_GYM_COUNTS = {
  'austin-sports-center-central':       20, // 🔴 On Fire
  'clay-madsen-round-rock':             18, // 🔴 On Fire
  'ut-rec-sports-center-austin':        17, // 🔴 On Fire
  'gregory-gymnasium-austin':           15, // 🔴 On Fire
  'pan-american-recreation-center':     16, // 🔴 On Fire
  'ymca-northwest-austin':              13, // 🟡 Poppin
  'metz-recreation-center':            11, // 🟡 Poppin
  'montopolis-rec-center-austin':       10, // 🟡 Poppin
  'dittmar-recreation-center':           9, // 🟡 Poppin
  'northwest-recreation-center-austin':  8, // 🟡 Poppin
  'lifetime-austin-north':               6, // 🟢 Active
  'golds-gym-hesters-crossing':          5, // 🟢 Active
  'la-fitness-cedar-park':               4, // 🟢 Active
  'austin-sports-center-north':          3, // 🟢 Active
  'east-communities-ymca-austin':        3, // 🟢 Active
  'south-austin-recreation-center':      2, // 🟢 Active
  'southwest-family-ymca-austin':        2, // 🟢 Active
  'austin-recreation-center-shoal-creek': 1, // 🟢 Active
  'ymca-downtown-austin':                0, // ⚫ Dead
  'la-fitness-south-austin':             0, // ⚫ Dead
};
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns pin color and label based on active player count.
 */
const getActivityPin = (count) => {
  if (count >= 15) return { color: '#EF4444', label: 'On Fire 🔥', tier: 'fire' };
  if (count >= 8)  return { color: '#F59E0B', label: 'Poppin',      tier: 'hot' };
  if (count >= 1)  return { color: '#22C55E', label: 'Active',      tier: 'active' };
  return                  { color: '#6B7280', label: 'Dead',        tier: 'dead' };
};

export default function GymMapScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { gyms, loading } = useGyms();
  const { location } = useLocation();
  const { countMap: liveCountMap } = useLivePresenceMap();
  const mapRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: 'Nearby Courts' });
  }, [navigation]);

  // Once GPS resolves, animate the map to the user's actual location.
  // initialRegion is only used for the very first render — this effect
  // handles the common case where location arrives after the map mounts.
  useEffect(() => {
    if (!location || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      },
      600, // animation duration ms
    );
  }, [location]);

  const initialRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }
    : AUSTIN_CENTER;

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
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        minZoomLevel={8}
        testID="gym-map"
      >
        {gyms.map((gym) => {
          if (!gym.location) return null;

          // Use mock counts in screenshot mode, otherwise use real live counts
          const playerCount = SCREENSHOT_MODE
            ? (MOCK_GYM_COUNTS[gym.id] ?? 0)
            : (liveCountMap[gym.id] ?? 0);

          const { color } = getActivityPin(playerCount);

          return (
            <Marker
              key={gym.id}
              coordinate={{
                latitude: gym.location.latitude,
                longitude: gym.location.longitude,
              }}
              pinColor={color}
              testID={`marker-${gym.id}`}
            >
              <Callout
                onPress={() =>
                  navigation.navigate('RunDetails', {
                    gymId: gym.id,
                    gymName: gym.name,
                    players: playerCount,
                  })
                }
              >
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{gym.name}</Text>
                  <Text style={[styles.calloutActivity, { color }]}>
                    {playerCount > 0 ? `${playerCount} players` : 'No one here yet'}
                  </Text>
                  <Text style={styles.calloutAddress}>{gym.address}</Text>
                  <Text style={styles.calloutTap}>Tap for details →</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* ── Floating Legend ───────────────────────────────────────────────── */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>ACTIVITY</Text>
        {[
          { color: '#EF4444', label: 'On Fire',  sub: '15+ players' },
          { color: '#F59E0B', label: 'Poppin',   sub: '8–14 players' },
          { color: '#22C55E', label: 'Active',   sub: '1–7 players' },
          { color: '#6B7280', label: 'Dead',     sub: 'No one here' },
        ].map(({ color, label, sub }) => (
          <View key={label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <View>
              <Text style={styles.legendLabel}>{label}</Text>
              <Text style={styles.legendSub}>{sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

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

    // ── Callout ────────────────────────────────────────────────────────────
    callout: {
      minWidth: 190,
      padding: SPACING.xs,
    },
    calloutTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
    calloutActivity: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      marginTop: 2,
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

    // ── Legend ─────────────────────────────────────────────────────────────
    legend: {
      position: 'absolute',
      bottom: 28,
      left: 14,
      backgroundColor: 'rgba(0,0,0,0.78)',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 7,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    legendTitle: {
      fontSize: 9,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: 'rgba(255,255,255,0.5)',
      letterSpacing: 1.2,
      marginBottom: 2,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    legendDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
    },
    legendLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.semibold,
      color: '#FFFFFF',
      lineHeight: 14,
    },
    legendSub: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.5)',
      lineHeight: 13,
    },
  });
