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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
  TextInput,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { subscribeToAllUpcomingRuns } from '../services/runService';
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

// ── Run level filter options ───────────────────────────────────────────────────
// null = Any level. Filters gyms to those that have at least one active run
// with the matching runLevel. Runs without runLevel are treated as 'mixed'.
const RUN_LEVEL_FILTERS = [
  { key: 'casual',      label: '😊 Casual',       color: '#22C55E' },
  { key: 'mixed',       label: '🤝 Balanced',      color: '#94A3B8' },
  { key: 'competitive', label: '🔥 Competitive',   color: '#EF4444' },
];

// ── Access filter options ─────────────────────────────────────────────────────
// null = All, 'free' = Free courts only, 'membership' = Membership/day-pass gyms only
const ACCESS_FILTERS = [
  { key: null,         label: 'All' },
  { key: 'free',       label: 'Free' },
  { key: 'membership', label: 'Membership' },
];

/**
 * formatGymDistance — Builds the location string shown on gym cards.
 *
 * When the user's GPS location is available:
 *   "0.8 mi · Pflugerville"   (distance in miles, 1 decimal place)
 *   "<0.1 mi · Austin"        (when distance rounds to 0.0)
 * When location is unavailable:
 *   "Pflugerville"            (city-only fallback)
 * When neither is available:
 *   ""                        (empty — card still renders cleanly)
 *
 * @param {object|null} userLocation  — { latitude, longitude } from useLocation()
 * @param {object|null} gymLocation   — { latitude, longitude } from gym doc
 * @param {string|null} gymCity       — gym.city from Firestore
 * @returns {string}
 */
function formatGymDistance(userLocation, gymLocation, gymCity) {
  const city = gymCity || '';
  if (userLocation && gymLocation) {
    const meters = calculateDistanceMeters(userLocation, gymLocation);
    const miles  = meters * 0.000621371;
    const rounded = Math.round(miles * 10) / 10; // 1 decimal place
    const miStr  = rounded < 0.1 ? '<0.1 mi' : `${rounded.toFixed(1)} mi`;
    return city ? `${miStr} · ${city}` : miStr;
  }
  return city;
}

// ─────────────────────────────────────────────────────────────────────────────
// usePulse — standalone hook so GymCard can own its own animation instance.
// Loops opacity 1 → 0.25 → 1 every ~1.4 s when `active` is true.
// ─────────────────────────────────────────────────────────────────────────────
function usePulse(active) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return anim;
}

// ─────────────────────────────────────────────────────────────────────────────
// GymCard — individual card row with its own pulse animation for the status dot.
// Extracted from ViewRunsScreen so each card independently owns a hook instance
// (hooks cannot be called inside .map() callbacks).
// ─────────────────────────────────────────────────────────────────────────────
function GymCard({
  gym, count, runStatus, isFollowed, isHomeCourt, gymRunLevel,
  userLocation, styles, colors, navigation, openStartRun,
  onToggleFollow, onRunLevelPress,
}) {
  const pulseAnim = usePulse(runStatus.pulse);

  return (
    <TouchableOpacity
      style={[styles.gymCard, isHomeCourt && styles.homeCourtCard]}
      onPress={() =>
        navigation.navigate('RunDetails', {
          gymId: gym.id,
          gymName: gym.name,
          players: count,
          imageUrl: gym.imageUrl,
          plannedToday: gym.plannedToday || 0,
          plannedTomorrow: gym.plannedTomorrow || 0,
          openStartRun,
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

        {/* Row 1 — Gym name + Follow */}
        <View style={styles.nameRow}>
          <Text style={styles.gymName} numberOfLines={2} ellipsizeMode="tail">{gym.name}</Text>
          <TouchableOpacity
            style={[styles.followButton, isFollowed && styles.followButtonActive]}
            onPress={() => onToggleFollow(gym.id, isFollowed)}
            activeOpacity={0.7}
          >
            <Text style={[styles.followButtonText, isFollowed && styles.followButtonTextActive]}>
              {isFollowed ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Row 2 — Run status dot (pulsing when live) + label + access pill */}
        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <Animated.View
              style={[
                styles.statusDot,
                { backgroundColor: runStatus.color, opacity: pulseAnim },
              ]}
            />
            <Text style={[styles.statusText, { color: runStatus.color }]}>
              {runStatus.label}{runStatus.countText ? ` ${runStatus.countText}` : ''}
            </Text>
          </View>
          {gym.accessType && (
            <View style={[
              styles.inlineAccessPill,
              {
                backgroundColor: gym.accessType === 'free' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                borderColor: gym.accessType === 'free' ? '#22C55E' : '#F59E0B',
              },
            ]}>
              <Text style={[styles.inlineAccessPillText, { color: gym.accessType === 'free' ? '#22C55E' : '#F59E0B' }]}>
                {gym.accessType === 'free' ? 'Free' : 'Member / Day Pass'}
              </Text>
            </View>
          )}
        </View>

        {/* Row 2b — Run level badge */}
        {gymRunLevel !== null && (() => {
          const levelColor =
            gymRunLevel === 'competitive' ? '#EF4444' :
            gymRunLevel === 'casual'      ? '#22C55E' : '#94A3B8';
          return (
            <TouchableOpacity
              onPress={onRunLevelPress}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <View style={[styles.runLevelBadge, { backgroundColor: levelColor + '18', borderColor: levelColor + '44' }]}>
                <Text style={[styles.runLevelBadgeText, { color: levelColor }]}>
                  {gymRunLevel === 'mixed' ? 'Balanced' : gymRunLevel.charAt(0).toUpperCase() + gymRunLevel.slice(1)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* Row 3 — Distance / city + directions */}
        <View style={styles.addressRow}>
          <Text style={styles.gymAddress} numberOfLines={1}>
            {formatGymDistance(userLocation, gym.location, gym.city)}
          </Text>
          {gym.location && (
            <TouchableOpacity
              onPress={() => openDirections(gym.location, gym.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="navigate-outline" size={15} color={colors.primary} />
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
}

export default function ViewRunsScreen({ navigation, route }) {
  const { gyms, loading, error: fetchError } = useGyms();
  const { followedGyms, homeCourtId } = useProfile();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);         // null | 'indoor' | 'outdoor'
  const [accessFilter, setAccessFilter] = useState(null);     // null | 'free' | 'membership'
  const [cityFilter, setCityFilter] = useState(null);         // null | city string
  const [runLevelFilter, setRunLevelFilter] = useState(null); // null | 'casual' | 'mixed' | 'competitive'
  const [allUpcomingRuns, setAllUpcomingRuns] = useState([]); // live runs across all gyms for level filter
  const [sortByNearest, setSortByNearest] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [runLevelInfoVisible, setRunLevelInfoVisible] = useState(false); // run style explainer sheet

  // Subscribe to all upcoming runs so the run level filter can match gym IDs.
  // Same subscription used by PlanVisitScreen — no new index needed.
  useEffect(() => {
    const unsub = subscribeToAllUpcomingRuns((runs) => setAllUpcomingRuns(runs));
    return () => unsub();
  }, []);

  // Count how many filters/sorts are active so we can badge the Filter button
  const activeFilterCount = (typeFilter ? 1 : 0) + (accessFilter ? 1 : 0) + (cityFilter ? 1 : 0) + (runLevelFilter ? 1 : 0) + (sortByNearest ? 1 : 0);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // ── City list for city filter ─────────────────────────────────────────────
  // Derived dynamically from loaded gyms so it auto-expands as new gyms are added.
  const availableCities = useMemo(() => {
    const seen = new Set();
    const cities = [];
    gyms.forEach((g) => {
      if (g.city && !seen.has(g.city)) {
        seen.add(g.city);
        cities.push(g.city);
      }
    });
    return cities.sort();
  }, [gyms]);

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
    if (count === 0) return { label: 'No run yet — start one', countText: '', color: 'rgba(255,255,255,0.35)', pulse: false };
    if (count <= 5)  return { label: `${count} playing now`,  countText: '', color: '#FBBF24', pulse: true };  // yellow
    if (count <= 9)  return { label: `${count} playing now`,  countText: '', color: '#22C55E', pulse: true };  // green
    return                  { label: `${count} playing now`,  countText: '', color: '#F97316', pulse: true };  // orange 10+
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
        const city    = gym.city?.toLowerCase()    ?? '';
        return name.includes(q) || address.includes(q) || city.includes(q);
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

    // ── 4. City filter ─────────────────────────────────────────────────────
    if (cityFilter) {
      result = result.filter((gym) => gym.city === cityFilter);
    }

    // ── 5. Run level filter ────────────────────────────────────────────────
    // Shows only gyms that have at least one upcoming run tagged at the
    // selected level. Runs without a runLevel field are treated as 'mixed'.
    if (runLevelFilter) {
      const matchingGymIds = new Set(
        allUpcomingRuns
          .filter((r) => (r.runLevel ?? 'mixed') === runLevelFilter)
          .map((r) => r.gymId)
      );
      result = result.filter((gym) => matchingGymIds.has(gym.id));
    }

    // ── 6. Sort ────────────────────────────────────────────────────────────
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
  }, [gyms, searchQuery, typeFilter, accessFilter, cityFilter, runLevelFilter, allUpcomingRuns, sortByNearest, userLocation, homeCourtId, liveCountMap]);

  // NOTE: loading gate intentionally removed from here.
  // The header, search bar, and filter pills are static and need no gym data —
  // they are rendered immediately. Only the list area shows a spinner while
  // the first Firestore snapshot is in flight.

  return (
    <ImageBackground
      source={require('../assets/images/runs-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      {/* Dark overlay — sits between the background image and all content */}
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header — title row and search bar */}
        <View style={styles.headerGradient}>
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
              {cityFilter && (
                <TouchableOpacity style={[styles.activeChip, { backgroundColor: '#6366F1' }]} onPress={() => setCityFilter(null)} activeOpacity={0.8}>
                  <Ionicons name="location" size={11} color="#fff" style={{ marginRight: 3 }} />
                  <Text style={styles.activeChipText}>{cityFilter}</Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
              {runLevelFilter && (
                <TouchableOpacity
                  style={[styles.activeChip, {
                    backgroundColor: runLevelFilter === 'competitive' ? '#EF4444' : runLevelFilter === 'casual' ? '#22C55E' : '#94A3B8',
                  }]}
                  onPress={() => setRunLevelFilter(null)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="basketball-outline" size={11} color="#fff" style={{ marginRight: 3 }} />
                  <Text style={styles.activeChipText}>
                    {runLevelFilter === 'mixed' ? 'Balanced' : runLevelFilter.charAt(0).toUpperCase() + runLevelFilter.slice(1)}
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
        </View>

        {/* Dismissible error banner — shown when gyms subscription fails */}
        {fetchError && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => {}} activeOpacity={0.8}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.errorBannerText}>Something went wrong — pull to refresh</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Inline spinner — only the list area waits for gyms data.
              The header, search bar, and filters are already visible above. */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading gyms...</Text>
            </View>
          ) : filteredGyms.length === 0 ? (
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
            <>
              {/* ── Follow nudge banner ─────────────────────────────────────────
                  Shown once above the gym list to explain the Follow button value.
                  No backend / notification logic — product messaging only.
              ──────────────────────────────────────────────────────────────── */}
              <View style={styles.followBanner}>
                <Ionicons name="notifications-outline" size={16} color="#F97316" style={styles.followBannerIcon} />
                <View style={styles.followBannerText}>
                  <Text style={styles.followBannerTitle}>Follow gyms for live run updates</Text>
                  <Text style={styles.followBannerSub}>Get alerts when runs start, players show up, or future runs are planned.</Text>
                </View>
              </View>

            {filteredGyms.map((gym) => {
              const count      = liveCountMap[gym.id] ?? 0;
              const runStatus  = getRunStatusLabel(count);
              const isFollowed = followedGyms.includes(gym.id);
              const isHomeCourt = homeCourtId === gym.id;

              // Dominant run level — competitive > casual > mixed
              const gymRuns = allUpcomingRuns.filter((r) => r.gymId === gym.id);
              let gymRunLevel = null;
              if (gymRuns.length > 0) {
                if (gymRuns.some((r) => (r.runLevel ?? 'mixed') === 'competitive'))      gymRunLevel = 'competitive';
                else if (gymRuns.some((r) => (r.runLevel ?? 'mixed') === 'casual'))      gymRunLevel = 'casual';
                else                                                                      gymRunLevel = 'mixed';
              }

              return (
                <GymCard
                  key={gym.id}
                  gym={gym}
                  count={count}
                  runStatus={runStatus}
                  isFollowed={isFollowed}
                  isHomeCourt={isHomeCourt}
                  gymRunLevel={gymRunLevel}
                  userLocation={userLocation}
                  styles={styles}
                  colors={colors}
                  navigation={navigation}
                  openStartRun={route.params?.openStartRun ?? false}
                  onToggleFollow={toggleFollow}
                  onRunLevelPress={() => setRunLevelInfoVisible(true)}
                />
              );
            })}
            </>
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

        {/* ── Run style info sheet ───────────────────────────────────────────
            Opened by tapping any run level badge on a gym card.
            Explains what Casual / Balanced / Competitive mean.
        ──────────────────────────────────────────────────────────────────── */}
        <Modal
          visible={runLevelInfoVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setRunLevelInfoVisible(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setRunLevelInfoVisible(false)} />
          <View style={styles.infoSheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.infoSheetTitle}>Run Style</Text>
            {[
              { emoji: '😊', label: 'Casual',      desc: 'More relaxed play — great for all skill levels.' },
              { emoji: '🤝', label: 'Balanced',    desc: 'A mix of casual and competitive players.' },
              { emoji: '🔥', label: 'Competitive', desc: 'Higher-level, more intense play.' },
            ].map(({ emoji, label, desc }) => (
              <View key={label} style={styles.infoSheetRow}>
                <Text style={styles.infoSheetEmoji}>{emoji}</Text>
                <View style={styles.infoSheetRowText}>
                  <Text style={styles.infoSheetRowLabel}>{label}</Text>
                  <Text style={styles.infoSheetRowDesc}>{desc}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.infoSheetClose}
              onPress={() => setRunLevelInfoVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.infoSheetCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Modal>

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

            {/* ── City ── */}
            {availableCities.length > 0 && (
              <>
                <Text style={styles.sheetSectionLabel}>City</Text>
                <View style={styles.sheetPillRow}>
                  {availableCities.map((city) => {
                    const active = cityFilter === city;
                    return (
                      <TouchableOpacity
                        key={city}
                        style={[styles.sheetPill, active && { backgroundColor: '#6366F1', borderColor: '#6366F1' }]}
                        onPress={() => setCityFilter(active ? null : city)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="location-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />
                        <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{city}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={styles.sheetCityHint}
                  onPress={() => {
                    setFilterSheetVisible(false);
                    navigation.navigate('RequestGym');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={13} color={colors.primary} style={{ marginRight: 5 }} />
                  <Text style={styles.sheetCityHintText}>Don't see your city? Request a gym to get it added</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Run Level ── */}
            <Text style={styles.sheetSectionLabel}>Run Level</Text>
            <View style={styles.sheetPillRow}>
              {RUN_LEVEL_FILTERS.map(({ key, label, color }) => {
                const active = runLevelFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.sheetPill, active && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setRunLevelFilter(active ? null : key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{label}</Text>
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
                  setCityFilter(null);
                  setRunLevelFilter(null);
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
    </ImageBackground>
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
  bgImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerGradient: {
    paddingHorizontal: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xs,
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
    backgroundColor: 'rgba(30,30,30,0.88)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.35)',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
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
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    paddingHorizontal: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.lg,
  },
  // ── Follow nudge banner (above gym list) ─────────────────────────────────
  followBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249,115,22,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.20)',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  followBannerIcon: {
    marginTop: 1, // optical alignment with first text line
  },
  followBannerText: {
    flex: 1,
  },
  followBannerTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  followBannerSub: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 16,
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
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: RADIUS.lg,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
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
    gap: 3,
  },
  // ── Card Row 1: gym name + follow ─────────────────────────────────────────
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  gymName: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    flex: 1,
    marginRight: SPACING.xs,
  },
  followButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#F97316',
    backgroundColor: 'transparent',
  },
  followButtonActive: {
    backgroundColor: 'rgba(249,115,22,0.10)',
    borderColor: 'rgba(249,115,22,0.35)',
  },
  followButtonText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#F97316',
  },
  followButtonTextActive: {
    color: 'rgba(255,255,255,0.70)',
  },
  // ── Card Row 2: run status + access pill ──────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  inlineAccessPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 0.5,
    marginLeft: SPACING.xs,
    opacity: 0.65,
  },
  inlineAccessPillText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.medium,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gymAddress: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.50)',
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
  // ── Run level badge (on gym cards — mirrors RunDetailsScreen badge exactly) ─
  runLevelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: 4,
  },
  runLevelBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // ── Run style info sheet (reuses sheetHandle and sheetBackdrop) ───────────
  infoSheetContainer: {
    backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl ?? 20,
    borderTopRightRadius: RADIUS.xl ?? 20,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  infoSheetTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: isDark ? '#FFFFFF' : '#111111',
    marginBottom: SPACING.md,
  },
  infoSheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  infoSheetEmoji: {
    fontSize: 20,
    width: 28,
  },
  infoSheetRowText: {
    flex: 1,
  },
  infoSheetRowLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: isDark ? '#FFFFFF' : '#111111',
  },
  infoSheetRowDesc: {
    fontSize: FONT_SIZES.small,
    color: isDark ? '#8E8E93' : '#6B7280',
    lineHeight: 18,
    marginTop: 2,
  },
  infoSheetClose: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? '#3A3A3C' : '#E5E7EB',
  },
  infoSheetCloseText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: isDark ? '#FFFFFF' : '#111111',
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
  sheetCityHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: 4,
  },
  sheetCityHintText: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.medium,
    flexShrink: 1,
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
