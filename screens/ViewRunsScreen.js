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
 *   - Indoor / Outdoor type filter pills
 *   - Free / Membership access filter pills (green = free court, amber = membership gym)
 *   - Nearest sort pill — uses player GPS location to rank all gyms nearest → farthest
 *
 * ── Future enhancements (TODO) ─────────────────────────────────────────────
 *
 *   SPONSORED / PROMOTED GYMS — Gyms that have a partnership deal can be
 *   pinned to the top of the list with a "Sponsored" badge. Firestore field:
 *     gyms/{id}.sponsored = true  (or a numeric rank for ordering)
 *   Insert the sponsored gym card(s) at index 0 in filteredGyms before render,
 *   or add a dedicated "Featured" section above the regular list.
 *   This slot can be sold to gym partners to drive membership sign-ups —
 *   RunCheck tracks which players visited via the app as attribution proof.
 *
 * Styles are memoized via `getStyles(colors, isDark)` and only recomputed
 * when the theme changes.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT_SIZES, SPACING, SHADOWS, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms, useProfile, useLivePresenceMap, useLocation } from '../hooks';
import { Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';
import { calculateDistanceMeters } from '../utils/locationUtils';
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
// ── Type filter options ────────────────────────────────────────────────────────
// null = All, 'indoor' = Indoor only, 'outdoor' = Outdoor only
const TYPE_FILTERS = [
  { key: null,       label: 'All' },
  { key: 'indoor',  label: 'Indoor' },
  { key: 'outdoor', label: 'Outdoor' },
];

// ── Access filter options ─────────────────────────────────────────────────────
// null = All, 'free' = Free courts only, 'membership' = Membership/day-pass gyms only
const ACCESS_FILTERS = [
  { key: null,         label: 'All' },
  { key: 'free',       label: 'Free' },
  { key: 'membership', label: 'Membership' },
];

export default function ViewRunsScreen({ navigation, route }) {
  const { gyms, loading, error: fetchError } = useGyms();
  const { followedGyms, homeCourtId } = useProfile();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);     // null | 'indoor' | 'outdoor'
  const [accessFilter, setAccessFilter] = useState(null); // null | 'free' | 'membership'
  const [sortByNearest, setSortByNearest] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // Count how many filters/sorts are active so we can badge the Filter button
  const activeFilterCount = (typeFilter ? 1 : 0) + (accessFilter ? 1 : 0) + (sortByNearest ? 1 : 0);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // ── User location for "Nearest" sort ────────────────────────────────────────
  // useLocation is already available in the hooks barrel. If the user hasn't
  // granted permission yet, location will be null and the sort is skipped.
  const { location: userLocation, getCurrentLocation } = useLocation();

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
   * handleNearestToggle — Enables/disables sort-by-distance.
   * Requests GPS on first tap if the user's location hasn't been fetched yet.
   */
  const handleNearestToggle = async () => {
    if (!sortByNearest && !userLocation) {
      // Try to fetch current location before enabling the sort
      try {
        await getCurrentLocation();
      } catch (_) {
        // Permission denied or GPS unavailable — still toggle so the pill
        // shows active, but the sort will be a no-op until location arrives.
      }
    }
    setSortByNearest((prev) => !prev);
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
    let result = gyms;

    // ── 1. Text search ─────────────────────────────────────────────────────
    if (q) {
      result = result.filter((gym) => {
        const name    = gym.name?.toLowerCase()    ?? '';
        const address = gym.address?.toLowerCase() ?? '';
        return name.includes(q) || address.includes(q);
      });
    }

    // ── 2. Indoor / Outdoor type filter ────────────────────────────────────
    if (typeFilter === 'indoor') {
      result = result.filter((gym) => gym.type !== 'outdoor');
    } else if (typeFilter === 'outdoor') {
      result = result.filter((gym) => gym.type === 'outdoor');
    }

    // ── 3. Free / Membership access filter ─────────────────────────────────
    // accessType === 'free' → free public court
    // anything else (or absent) → treat as membership / day-pass
    if (accessFilter === 'free') {
      result = result.filter((gym) => gym.accessType === 'free');
    } else if (accessFilter === 'membership') {
      result = result.filter((gym) => gym.accessType !== 'free');
    }

    // ── 4. Sort ────────────────────────────────────────────────────────────
    if (sortByNearest && userLocation) {
      // Sort purely by distance from user — closest gym first
      result = [...result].sort((a, b) => {
        const aDist = a.location
          ? calculateDistanceMeters(userLocation, { latitude: a.location.latitude, longitude: a.location.longitude })
          : Infinity;
        const bDist = b.location
          ? calculateDistanceMeters(userLocation, { latitude: b.location.latitude, longitude: b.location.longitude })
          : Infinity;
        return aDist - bDist;
      });
    } else if (homeCourtId) {
      // Default sort: home court first, then active gyms, then the rest
      result = [...result].sort((a, b) => {
        if (a.id === homeCourtId) return -1;
        if (b.id === homeCourtId) return 1;
        const aCount = liveCountMap[a.id] ?? 0;
        const bCount = liveCountMap[b.id] ?? 0;
        return bCount - aCount;
      });
    }

    return result;
  }, [gyms, searchQuery, typeFilter, accessFilter, sortByNearest, userLocation, homeCourtId, liveCountMap]);

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

          {/* ── Filter button row ─────────────────────────────────────────── */}
          <View style={styles.filterButtonRow}>
            {/* Active filter summary chips — shown when filters are on */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.activeChipsRow}>
              {typeFilter && (
                <TouchableOpacity style={styles.activeChip} onPress={() => setTypeFilter(null)} activeOpacity={0.8}>
                  <Text style={styles.activeChipText}>
                    {typeFilter === 'indoor' ? 'Indoor' : 'Outdoor'}
                  </Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
              {accessFilter && (
                <TouchableOpacity style={[styles.activeChip, { backgroundColor: accessFilter === 'free' ? '#22C55E' : '#F59E0B' }]} onPress={() => setAccessFilter(null)} activeOpacity={0.8}>
                  <Text style={styles.activeChipText}>
                    {accessFilter === 'free' ? 'Free' : 'Membership'}
                  </Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
              {sortByNearest && (
                <TouchableOpacity style={[styles.activeChip, { backgroundColor: '#0A84FF' }]} onPress={() => setSortByNearest(false)} activeOpacity={0.8}>
                  <Ionicons name="navigate" size={11} color="#fff" style={{ marginRight: 3 }} />
                  <Text style={styles.activeChipText}>Nearest</Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Filter button */}
            <TouchableOpacity
              style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
              onPress={() => setFilterSheetVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="options-outline" size={15} color={activeFilterCount > 0 ? '#fff' : 'rgba(255,255,255,0.8)'} style={{ marginRight: 5 }} />
              <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextActive]}>
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Dismissible error banner — shown when gyms subscription fails */}
        {fetchError && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => {}} activeOpacity={0.8}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.errorBannerText}>Something went wrong — pull to refresh</Text>
          </TouchableOpacity>
        )}

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
                  <Ionicons name="search-outline" size={28} color={colors.textMuted} style={{ marginBottom: SPACING.sm }} />
                  <Text style={styles.emptyText}>No gyms found</Text>
                  <Text style={styles.emptySubtext}>Try another gym name or area</Text>
                </>
              ) : (
                <>
                  <Ionicons name="basketball-outline" size={28} color={colors.textMuted} style={{ marginBottom: SPACING.sm }} />
                  <Text style={styles.emptyText}>No gyms available yet</Text>
                  <Text style={styles.emptySubtext}>We're adding courts in your area — check back soon!</Text>
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
              const isHomeCourt = homeCourtId === gym.id;

              return (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymCard, isHomeCourt && styles.homeCourtCard]}
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
                      openStartRun: route.params?.openStartRun ?? false,
                    })
                  }
                >
                  {/* Left accent bar for home court */}
                  {isHomeCourt && <View style={styles.homeCourtAccent} />}

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
                    {isHomeCourt && (
                      <View style={styles.homeCourtBadge}>
                        <Ionicons name="home" size={10} color="#F97316" />
                        <Text style={styles.homeCourtBadgeText}>Your Home Court</Text>
                      </View>
                    )}
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

        {/* ── Filter sheet modal ─────────────────────────────────────────────
            Slides up from the bottom. Tap backdrop or × to close.
            Sections: Court Type, Access, Sort By.
        ──────────────────────────────────────────────────────────────────── */}
        <Modal
          visible={filterSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterSheetVisible(false)}
        >
          {/* Dimmed backdrop — tap to dismiss */}
          <Pressable style={styles.sheetBackdrop} onPress={() => setFilterSheetVisible(false)} />

          <View style={styles.sheetContainer}>
            {/* Sheet handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter By</Text>
              <TouchableOpacity onPress={() => setFilterSheetVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={isDark ? '#8E8E93' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            {/* ── Court Type ── */}
            <Text style={styles.sheetSectionLabel}>Court Type</Text>
            <View style={styles.sheetPillRow}>
              {TYPE_FILTERS.map((f) => {
                const active = typeFilter === f.key;
                return (
                  <TouchableOpacity
                    key={String(f.key)}
                    style={[styles.sheetPill, active && styles.sheetPillActive]}
                    onPress={() => setTypeFilter(active ? null : f.key)}
                    activeOpacity={0.75}
                  >
                    {f.key === 'indoor' && <Ionicons name="business-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === 'outdoor' && <Ionicons name="sunny-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === null && <Ionicons name="apps-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Access ── */}
            <Text style={styles.sheetSectionLabel}>Access</Text>
            <View style={styles.sheetPillRow}>
              {ACCESS_FILTERS.map((f) => {
                const active = accessFilter === f.key;
                const accentColor = f.key === 'free' ? '#22C55E' : f.key === 'membership' ? '#F59E0B' : colors.primary;
                return (
                  <TouchableOpacity
                    key={String(f.key)}
                    style={[styles.sheetPill, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                    onPress={() => setAccessFilter(active ? null : f.key)}
                    activeOpacity={0.75}
                  >
                    {f.key === 'free' && <Ionicons name="pricetag-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === 'membership' && <Ionicons name="card-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === null && <Ionicons name="apps-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Sort By ── */}
            <Text style={styles.sheetSectionLabel}>Sort By</Text>
            <TouchableOpacity
              style={[styles.sheetToggleRow, sortByNearest && styles.sheetToggleRowActive]}
              onPress={handleNearestToggle}
              activeOpacity={0.75}
            >
              <View style={styles.sheetToggleLeft}>
                <Ionicons name="navigate-outline" size={16} color={sortByNearest ? '#0A84FF' : (isDark ? '#8E8E93' : '#6B7280')} style={{ marginRight: 10 }} />
                <View>
                  <Text style={[styles.sheetToggleTitle, sortByNearest && { color: '#0A84FF' }]}>Nearest First</Text>
                  <Text style={styles.sheetToggleSub}>Sort all gyms by your location</Text>
                </View>
              </View>
              <View style={[styles.sheetToggleSwitch, sortByNearest && styles.sheetToggleSwitchOn]}>
                <View style={[styles.sheetToggleThumb, sortByNearest && styles.sheetToggleThumbOn]} />
              </View>
            </TouchableOpacity>

            {/* ── Clear All ── */}
            {activeFilterCount > 0 && (
              <TouchableOpacity
                style={styles.sheetClearBtn}
                onPress={() => {
                  setTypeFilter(null);
                  setAccessFilter(null);
                  setSortByNearest(false);
                  setFilterSheetVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetClearBtnText}>Clear All Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        </Modal>
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
  homeCourtCard: {
    // No border — accent bar handles the visual cue
  },
  homeCourtAccent: {
    width: 3,
    backgroundColor: '#F97316',
  },
  homeCourtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  homeCourtBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F97316',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B45309',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  errorBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.small,
    color: '#fff',
    fontWeight: FONT_WEIGHTS.medium,
  },
  // ── Filter pills ──────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillNearest: {
    backgroundColor: '#0A84FF',
    borderColor: '#0A84FF',
  },
  filterPillFree: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  filterPillMembership: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  filterPillText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(255,255,255,0.7)',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  filterDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: SPACING.xs,
  },

  // ── Filter button row (replaces pill strip) ───────────────────────────────
  filterButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  activeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  activeChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#fff',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginLeft: 'auto',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(255,255,255,0.85)',
  },
  filterButtonTextActive: {
    color: '#fff',
  },

  // ── Filter bottom sheet ────────────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl ?? 20,
    borderTopRightRadius: RADIUS.xl ?? 20,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: isDark ? '#48484A' : '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  sheetTitle: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.bold,
    color: isDark ? '#FFFFFF' : '#111111',
  },
  sheetSectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: isDark ? '#8E8E93' : '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  sheetPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  sheetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? '#3A3A3C' : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? '#48484A' : '#E5E7EB',
  },
  sheetPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetPillText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    color: isDark ? '#EBEBF5' : '#374151',
  },
  sheetPillTextActive: {
    color: '#fff',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  sheetToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? '#3A3A3C' : '#F3F4F6',
    borderWidth: 1,
    borderColor: isDark ? '#48484A' : '#E5E7EB',
  },
  sheetToggleRowActive: {
    borderColor: '#0A84FF',
    backgroundColor: isDark ? 'rgba(10,132,255,0.15)' : 'rgba(10,132,255,0.08)',
  },
  sheetToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetToggleTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: isDark ? '#FFFFFF' : '#111111',
  },
  sheetToggleSub: {
    fontSize: FONT_SIZES.xs,
    color: isDark ? '#8E8E93' : '#6B7280',
    marginTop: 1,
  },
  sheetToggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.border ?? '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  sheetToggleSwitchOn: {
    backgroundColor: '#0A84FF',
  },
  sheetToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  sheetToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  sheetClearBtn: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
  },
  sheetClearBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#EF4444',
  },
});
