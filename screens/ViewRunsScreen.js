/**
 * ViewRunsScreen.js — Gym Discovery & Browsing List
 *
 * Displays a scrollable list of nearby gyms with real-time activity levels,
 * player counts, and scheduled visit counts. Tapping a gym card navigates
 * to RunDetailsScreen for the full breakdown.
 *
 * Features:
 *   - Pull-to-refresh provides visual feedback (data is live via Firestore listener)
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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT_SIZES, SPACING, SHADOWS, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms, useProfile, useLivePresenceMap } from '../hooks';
import { Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';
import { auth, db } from '../config/firebase';
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { handleFollowPoints } from '../services/pointsService';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';

/**
 * ViewRunsScreen — Gym discovery list screen.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for navigating to GymMap or RunDetails.
 * @returns {JSX.Element}
 */
export default function ViewRunsScreen({ navigation }) {
  const { gyms, loading } = useGyms();
  const { followedGyms } = useProfile();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // ── Live player counts ────────────────────────────────────────────────────
  // Canonical app-wide presence counts — shared hook, single Firestore subscription.
  // Uses status == 'ACTIVE' filter (matches presenceService) and deduplicates by odId.
  const { countMap: liveCountMap } = useLivePresenceMap();

  /**
   * getRunStatusLabel — Maps a live player count to a run-quality label,
   * color, and formatted display string for the gym card.
   *
   * Replaces the old "{count}/15" format. Public gyms have no hard cap so
   * showing "/15" implied a limit that doesn't exist.
   *
   * @param {number} count — Deduplicated active player count for this gym.
   * @returns {{ label: string, countText: string, color: string }}
   */
  const getRunStatusLabel = (count) => {
    if (count === 0) return { label: 'Empty',     countText: '',                color: colors.activityEmpty };
    if (count <= 3)  return { label: 'Light Run', countText: `· ${count} playing`, color: colors.activityLight };
    if (count <= 7)  return { label: 'Building',  countText: `· ${count} playing`, color: colors.activityActive };
    if (count <= 11) return { label: 'Good Run',  countText: `· ${count} playing`, color: colors.activityLight };
    if (count <= 15) return { label: 'Packed',    countText: `· ${count} playing`, color: colors.activityBusy };
    return                  { label: 'Jumping',   countText: `· ${count} playing`, color: colors.activityBusy };
  };

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
      if (__DEV__) console.error('toggleFollow error:', err);
    }
  };

  /**
   * onRefresh — Pull-to-refresh handler.
   *
   * Toggles the refresh spinner briefly. The real-time Firestore listener
   * in useGyms() already keeps data in sync, so no explicit data fetch is
   * needed — the spinner gives the user visual feedback that a refresh
   * was acknowledged.
   */
  const onRefresh = async () => {
    setRefreshing(true);
    // Small delay so the spinner is visible; data is already live via listener.
    setTimeout(() => setRefreshing(false), 500);
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


  /**
   * sanitizeSearch — Strips unsafe characters from raw search input and
   * enforces structural constraints before the value is stored or used.
   *
   * Allowed characters: letters (a-z A-Z), digits (0-9), space, apostrophe,
   * hyphen, period, ampersand. Everything else is silently removed so that
   * pasting or typing unusual characters degrades gracefully rather than
   * blocking the input entirely.
   *
   * Additional rules applied in order:
   *   1. Strip disallowed characters
   *   2. Remove leading whitespace (so the field can't start with a space)
   *   3. Collapse runs of 2+ spaces into a single space
   *   4. Hard-cap at 50 characters
   *
   * The sanitized value is used as the TextInput `value` so the displayed
   * text always reflects exactly what will be matched against.
   *
   * @param {string} raw — Text string straight from onChangeText.
   * @returns {string} Safe, normalised search string.
   */
  const sanitizeSearch = (raw) =>
    raw
      .replace(/[^a-zA-Z0-9 '.\-&]/g, '') // strip disallowed chars
      .replace(/^ +/, '')                   // no leading spaces
      .replace(/ {2,}/g, ' ')              // collapse repeated spaces
      .slice(0, 50);                        // max length

  /**
   * filteredGyms — Local-only filter over the already-loaded gyms array.
   * Matches the sanitized query (trimmed for comparison) case-insensitively
   * against gym.name and gym.address so users can search by gym name or area.
   * No Firestore query is involved — this is a pure client-side filter.
   */
  const filteredGyms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return gyms;
    return gyms.filter((gym) => {
      const name    = gym.name?.toLowerCase()    ?? '';
      const address = gym.address?.toLowerCase() ?? '';
      return name.includes(q) || address.includes(q);
    });
  }, [gyms, searchQuery]);

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
        {/* Header gradient — covers title row and search bar */}
        <LinearGradient
          colors={['#3D1E00', '#1A0A00', colors.background]}
          locations={[0, 0.55, 1]}
          style={styles.headerGradient}
        >
          {/* Header row — title/subtitle on the left, map icon on the right */}
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>Find a Run</Text>
              <Text style={styles.subtitle}>See who's playing right now</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('GymMap')}>
              <Ionicons name="map-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* ── Search bar ────────────────────────────────────────────────── */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search gyms"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(text) => setSearchQuery(sanitizeSearch(text))}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              autoCapitalize="words"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredGyms.length === 0 ? (
            <View style={styles.emptyState}>
              {searchQuery.trim().length > 0 ? (
                <>
                  <Text style={styles.emptyText}>No gyms found</Text>
                  <Text style={styles.emptySubtext}>Try another gym name or area</Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>No gyms available</Text>
                  <Text style={styles.emptySubtext}>Pull down to refresh</Text>
                </>
              )}
            </View>
          ) : (
            filteredGyms.map((gym) => {
              // Real-time deduplicated count — NOT gym.currentPresenceCount
              const count = liveCountMap[gym.id] ?? 0;
              const activity = getActivityLevel(count);
              const runStatus = getRunStatusLabel(count);

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
                      GYM_LOCAL_IMAGES[gym.id]
                        ? GYM_LOCAL_IMAGES[gym.id]
                        : gym.imageUrl
                        ? { uri: gym.imageUrl }
                        : require('../assets/images/court-bg.jpg')
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
                      {/* Run quality label — replaces the old "{count}/15" format.
                          Public gyms have no hard cap so showing /15 was misleading.
                          Count comes from real-time liveCountMap, deduped by odId. */}
                      <Text style={[styles.runStatusLabel, { color: runStatus.color }]}>
                        {runStatus.label}{runStatus.countText ? ` ${runStatus.countText}` : ''}
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

          {/* Request a Gym — entry point at the bottom of the gym list */}
          <TouchableOpacity
            style={styles.requestGymRow}
            onPress={() => navigation.navigate('RequestGym')}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.requestGymText}>Don't see your gym? Request it</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
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
  },
  headerGradient: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
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
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.7)',
  },
  // ── Search bar ────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.18)' : colors.textMuted,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.4 : 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  searchIcon: {
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    paddingVertical: 0, // remove default Android padding
  },
  scroll: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  requestGymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  requestGymText: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: colors.primary,
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
  runStatusLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
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
