/**
 * ViewRunsScreen.js — Gym Discovery & Browsing List
 *
 * Displays a scrollable list of nearby gyms with real-time activity levels,
 * player counts, and scheduled visit counts. Tapping a gym card navigates
 * to RunDetailsScreen for the full breakdown.
 *
 * Features:
 *   - Pull-to-refresh re-runs the gym seed/migration via `ensureGymsExist`
 *   - Activity level badge (Empty / Light / Active / Busy) with color coding
 *   - "Get Directions" shortcut opens Apple Maps / Google Maps via deep link
 *   - Map icon in the header navigates to GymMapScreen
 *   - Placeholder gym data is shown while live Firestore data is integrated
 *
 * Styles are memoized via `getStyles(colors, isDark)` and only recomputed
 * when the theme changes.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, SHADOWS, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms, useProfile } from '../hooks';
import { Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';
import { auth, db } from '../config/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { handleFollowPoints } from '../services/pointsService';

/**
 * ViewRunsScreen — Gym discovery list screen.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for navigating to GymMap or RunDetails.
 * @returns {JSX.Element}
 */
export default function ViewRunsScreen({ navigation }) {
  const { gyms, loading, ensureGymsExist } = useGyms();
  const { followedGyms } = useProfile();
  const [refreshing, setRefreshing] = useState(false);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * toggleFollow — Adds or removes a gym from the user's `followedGyms` array
   * in Firestore using arrayUnion / arrayRemove.
   *
   * @param {string} gymId — Firestore ID of the gym to follow or unfollow.
   * @param {boolean} isFollowed — Current follow state (true = currently following).
   */
  const toggleFollow = async (gymId, isFollowed) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        followedGyms: isFollowed ? arrayRemove(gymId) : arrayUnion(gymId),
      });
      // Award or deduct points based on new follow state (exploit-safe)
      handleFollowPoints(uid, gymId, !isFollowed);
    } catch (err) {
      console.error('toggleFollow error:', err);
    }
  };

  /**
   * onRefresh — Pull-to-refresh handler.
   *
   * Re-runs the gym seed to pick up any newly added gyms or updated GPS
   * coordinates, then dismisses the refresh spinner.
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await ensureGymsExist();
    setRefreshing(false);
  };

  /**
   * getActivityLevel — Maps a presence count to a display label and badge color.
   *
   * Thresholds match `useGyms.getActivityLevel` for consistency:
   *   0      → Empty  (grey)
   *   1–4    → Light  (green)
   *   5–9    → Active (amber)
   *   10+    → Busy   (red)
   *
   * @param {number} count — Current number of checked-in players at the gym.
   * @returns {{ label: string, color: string }} Label text and hex color for the badge.
   */
  const getActivityLevel = (count) => {
    if (count === 0) return { label: 'Empty', color: colors.activityEmpty };
    if (count < 5) return { label: 'Light', color: colors.activityLight };
    if (count < 10) return { label: 'Active', color: colors.activityActive };
    return { label: 'Busy', color: colors.activityBusy };
  };


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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header row — title/subtitle on the left, map icon on the right */}
        <View style={styles.titleRow}>
  <View>
    <Text style={styles.title}>Find a Run</Text>
    <Text style={styles.subtitle}>See who's playing right now</Text>
  </View>
  <TouchableOpacity onPress={() => navigation.navigate('GymMap')}>
    <Ionicons name="map-outline" size={24} color={colors.textPrimary} />
  </TouchableOpacity>
</View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {gyms.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No gyms available</Text>
              <Text style={styles.emptySubtext}>
                Pull down to refresh
              </Text>
            </View>
          ) : (
            gyms.map((gym) => {
              const count = gym.currentPresenceCount || 0;
              const activity = getActivityLevel(count);

              const isFollowed = followedGyms.includes(gym.id);

              return (
                <TouchableOpacity
                  key={gym.id}
                  style={styles.gymCard}
                  onPress={() =>
                    // Pass all display data as route params so RunDetailsScreen
                    // can render immediately without an extra Firestore read
                    navigation.navigate('RunDetails', {
                      gymId: gym.id,
                      gymName: gym.name,
                      players: count,
                      imageUrl: gym.imageUrl,
                      plannedToday: gym.plannedToday || 0,
                      plannedTomorrow: gym.plannedTomorrow || 0,
                    })
                  }
                >
                  <Image
                    source={
                      gym.imageUrl
                        ? { uri: gym.imageUrl }
                        : require('../assets/basketball-court.png')
                    }
                    style={styles.thumbnail}
                  />

                  <View style={styles.gymInfo}>
                    <View style={styles.gymRow}>
                      <Text style={[styles.gymName, { flex: 1 }]} numberOfLines={2}>{gym.name}</Text>
                      {/* Activity badge — color dynamically set by getActivityLevel */}
                      <View style={[styles.activityBadge, { backgroundColor: activity.color }]}>
                        <Text style={styles.activityText}>{activity.label}</Text>
                      </View>
                      {/* Heart icon — follow / unfollow toggle */}
                      <TouchableOpacity
                        style={styles.heartButton}
                        onPress={() => toggleFollow(gym.id, isFollowed)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isFollowed ? 'heart' : 'heart-outline'}
                          size={18}
                          color={isFollowed ? '#EF4444' : colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Access type badge — Free (green) or Membership / Day Pass (amber) */}
                    {gym.accessType && (
                      <View style={styles.accessBadgeRow}>
                        <View style={[styles.accessBadge, { backgroundColor: gym.accessType === 'free' ? '#22C55E' : '#F59E0B' }]}>
                          <Text style={styles.accessBadgeText}>
                            {gym.accessType === 'free' ? 'Free' : 'Membership / Day Pass'}
                          </Text>
                        </View>
                      </View>
                    )}

                    <View style={styles.gymRow}>
                      <Text style={styles.runType}>
                        {gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}{' '}
                        <Text style={styles.runTypeAccent}>OPEN RUN</Text>
                      </Text>
                      <Text style={styles.playerCount}>
                        {count}/15
                      </Text>
                    </View>

                    <View style={styles.addressRow}>
                      <Text style={styles.gymAddress} numberOfLines={1}>{gym.address}</Text>
                      {gym.location && (
                        // Directions button — only shown when the gym has GPS coords
                        <TouchableOpacity
                          onPress={() => openDirections(gym.location, gym.name)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {gym.plannedTomorrow > 0 && (
                      <View style={styles.plannedRow}>
                        <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                        <Text style={styles.plannedText}>
                          {gym.plannedTomorrow} planning tomorrow
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for ViewRunsScreen.
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
    padding: SPACING.md,
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },
  scroll: {
    paddingBottom: SPACING.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg * 2,
  },
  emptyText: {
    fontSize: FONT_SIZES.subtitle,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    marginTop: SPACING.sm,
  },
  gymCard: {
  flexDirection: 'row',
  backgroundColor: colors.surface,
  borderRadius: RADIUS.lg,
  marginBottom: 12,
  overflow: 'hidden',
  ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  ...(isDark && SHADOWS.lg),
},
  thumbnail: {
  width: 100,
  height: 100,
  borderRadius: 0,
},
 gymInfo: {
  flex: 1,
  justifyContent: 'center',
  padding: SPACING.md,
},
  gymRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  gymName: {
  fontSize: FONT_SIZES.h3,
  fontWeight: FONT_WEIGHTS.semibold,
  color: colors.textPrimary,
  marginRight: SPACING.xs,
  letterSpacing: 0.3,
  flexShrink: 1,
},
  heartButton: {
    marginLeft: SPACING.xs,
  },
  activityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  activityText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  accessBadgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  accessBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  accessBadgeText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runType: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  runTypeAccent: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  playerCount: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gymAddress: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    flex: 1,
  },
  plannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  plannedText: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
