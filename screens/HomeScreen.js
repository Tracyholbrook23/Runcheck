/**
 * HomeScreen.js — Main Dashboard
 *
 * The landing screen users see after signing in. Provides a high-level
 * snapshot of current activity and quick navigation into the app's core
 * features.
 *
 * Key sections:
 *   - Header           — RunCheck logo + profile icon shortcut
 *   - Welcome          — Large hero text "Find Your Next Run"
 *   - Presence Card    — Shows the user's active check-in (gym name +
 *                        time remaining) with a Check Out action. Only
 *                        rendered when `isCheckedIn` is true.
 *   - Quick Actions    — Three BlurView cards linking to Check In,
 *                        Find Runs, and Plan a Visit tabs
 *   - LIVE Indicator   — Compact banner showing total active players and
 *                        the hottest court; hidden when totalActive === 0;
 *                        tapping navigates to the hottest court's RunDetails
 *   - Live Runs        — Horizontal scroll of gyms with active players right now,
 *                        each card showing a 🔴 LIVE badge, avatar stack, gym name,
 *                        and player count. Empty state shown when totalActive === 0.
 *   - Recent Activity  — Feed of recent community check-ins and plans
 *                        (currently seeded with placeholder data)
 *
 * Layout uses a full-screen `ImageBackground` with a dark overlay so
 * all content renders on top of the court photo with consistent contrast.
 * BlurView cards from `expo-blur` give the frosted-glass UI feel.
 *
 * Styles are memoized per `(colors, isDark)` to avoid re-computing on
 * every state change.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  ImageBackground,
  Image,
  Animated,
  Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, SHADOWS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence, useGyms, useLivePresenceMap } from '../hooks';
import { Logo } from '../components';
import { db, auth } from '../config/firebase';
import { collection, query, orderBy, limit, where, onSnapshot, doc } from 'firebase/firestore';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';

// Instagram community link — used by both the header icon and the footer card.
const INSTAGRAM_URL = 'https://www.instagram.com/run.check?igsh=dWdieWZteXlvd21k&utm_source=qr';

/**
 * BlinkingDot — A small green dot that pulses its opacity when `active` is
 * true and renders as a plain static dot when `active` is false.
 *
 * Reused for both the LIVE indicator banner and each Live Run card dot.
 * Accepts the caller's existing dot style so dimensions and color stay
 * consistent with `liveBannerDot` / `courtLiveDot`.
 *
 * @param {{ active: boolean, style: object }} props
 */
const BlinkingDot = ({ active, style }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.2,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      opacity.setValue(1);
    }
  }, [active]);

  if (!active) {
    return <View style={style} />;
  }
  return <Animated.View style={[style, { opacity }]} />;
};

/**
 * HomeScreen — Main dashboard component.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop used to navigate between tabs and nested screens.
 * @returns {JSX.Element}
 */
const HomeScreen = ({ navigation }) => {
  const { colors, isDark, themeStyles } = useTheme();

  // Recompute styles only when the theme changes
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const {
    presence,
    loading,
    isCheckedIn,
    checkOut,
    checkingOut,
    getTimeRemaining,
  } = usePresence();

  const { gyms } = useGyms();

  const [activityFeed, setActivityFeed] = useState([]);
  const [friendIds, setFriendIds] = useState([]);

  // Canonical app-wide presence map — single source of truth for all live counts.
  // Replaces the previous inline onSnapshot subscription on this screen.
  const { presenceMap: livePresenceMap, countMap: liveCountMap } = useLivePresenceMap();

  // Subscribe to the current user's friends list in real time.
  useEffect(() => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', currentUid),
      (snap) => { setFriendIds(snap.exists() ? (snap.data().friends ?? []) : []); },
      () => { setFriendIds([]); }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to activity documents from the last 2 hours in real time.
  // The cutoff is computed once on mount; Firestore evaluates it server-side.
  useEffect(() => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'activity'),
      where('createdAt', '>=', twoHoursAgo),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = new Date();
        const items = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => {
            // Hide 'joined a run at' items — these writes have been removed from
            // runService but docs already in Firestore must also be suppressed. RC-002.
            if (item.action === 'joined a run at') return false;
            // Check-in items have no plannedTime — always show.
            // Plan items: only show within the 60-minute lead-up window.
            //   lower bound: plannedTime > now  (visit hasn't happened yet)
            //   upper bound: plannedTime <= now + 60 min  (visit is coming up soon)
            if (item.action === 'planned a visit to' && item.plannedTime) {
              const planned = item.plannedTime.toDate();
              const sixtyMinFromNow = new Date(now.getTime() + 60 * 60 * 1000);
              return planned > now && planned <= sixtyMinFromNow;
            }
            return true;
          });
        setActivityFeed(items);
      },
      (error) => {
        console.error('Error subscribing to activity feed:', error);
        setActivityFeed([]);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * getRelativeTime — Converts a Firestore Timestamp (or Date) to a short
   * human-readable relative string like "3m ago" or "2h ago".
   *
   * @param {import('firebase/firestore').Timestamp|Date|null} timestamp
   * @returns {string}
   */
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  /**
   * handleCheckOut — Prompts the user for confirmation then calls `checkOut()`.
   *
   * Uses a destructive-style Alert so the user doesn't accidentally check
   * out of their gym session. Shows a success alert on completion.
   */
  const handleCheckOut = async () => {
    Alert.alert(
      'Check Out',
      `Are you sure you want to check out from ${presence?.gymName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await checkOut();
              Alert.alert('Checked Out', "You've successfully checked out.");
            } catch (error) {
              console.error('Check-out error:', error);
              Alert.alert('Error', error.message || 'Failed to check out.');
            }
          },
        },
      ]
    );
  };

  /**
   * goToTab — Navigates to a top-level bottom tab by name.
   *
   * `navigation.getParent()` is needed because HomeScreen lives inside
   * HomeStack, which itself is a child of the MainTabs navigator.
   *
   * @param {string} tabName — Name of the tab to navigate to (e.g., 'CheckIn', 'Runs').
   */
  /**
   * getStartedAgoText — Returns a compact "started Xm ago" / "active now" string
   * for a Live Run card, derived from the earliest checkedInAt across all players.
   *
   * @param {Array} players — Entries from livePresenceMap (each has checkedInAt Timestamp).
   * @returns {string}
   */
  /**
   * getRunEnergyLabel — Maps active player count to a run-energy label + color.
   * Displayed inline in the Live Run card: "{count} players • {label}".
   * Pure UI helper — no data side effects.
   *
   * Thresholds:
   *   1–4   → Starting Up    (dim white  — run hasn't hit critical mass yet)
   *   5–9   → Games Forming  (amber      — enough for a game, momentum building)
   *   10–14 → Good Run       (green      — full run in progress)
   *   15+   → 🔥🔥 Packed Run (red        — gym is hot, visual urgency)
   */
  const getRunEnergyLabel = (count) => {
    if (count >= 15) return { label: '🔥🔥 Packed Run', color: '#FF3B30' };
    if (count >= 10) return { label: 'Good Run',        color: '#34C759' };
    if (count >= 5)  return { label: 'Games Forming',   color: '#FF9500' };
    return                   { label: 'Starting Up',    color: 'rgba(255,255,255,0.50)' };
  };

  const getStartedAgoText = (players) => {
    const millis = players
      .map((p) => p.checkedInAt?.toMillis?.() ?? null)
      .filter(Boolean);
    if (millis.length === 0) return 'active now';
    const diffMins = Math.round((Date.now() - Math.min(...millis)) / 60000);
    if (diffMins < 1) return 'active now';
    if (diffMins < 60) return `started ${diffMins}m ago`;
    const hrs = Math.floor(diffMins / 60);
    return `started ${hrs}h ago`;
  };

  const goToTab = (tabName) => {
    navigation.getParent()?.navigate(tabName);
  };

  // Sum of all per-gym real-time counts — shown in the LIVE banner.
  const totalActive = Object.values(liveCountMap).reduce((s, n) => s + n, 0);

  // Live player count for the gym the current user is checked into.
  // Reuses liveCountMap — no extra query needed.
  const checkedInCount = isCheckedIn ? (liveCountMap[presence?.gymId] || 0) : 0;

  // TEMP debug — remove once counts confirmed correct
  if (__DEV__ && totalActive > 0) {
    const topId = Object.entries(liveCountMap).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topId) {
      console.log('[LiveBanner] hottestGym id:', topId);
      console.log('[LiveBanner] raw presence docs:', (livePresenceMap[topId] || []).length);
      console.log('[LiveBanner] deduped active count:', liveCountMap[topId]);
    }
  }

  // Gym with the most real-time active players — used by the LIVE indicator.
  // Derived from liveCountMap, NOT from the stale gym.currentPresenceCount field.
  let hottestGym = null;
  let hottestCount = 0;
  gyms.forEach((g) => {
    const count = liveCountMap[g.id] || 0;
    if (count > hottestCount) { hottestCount = count; hottestGym = g; }
  });

  // Gyms with at least one real-time active player, sorted hottest first.
  // These drive the "Live Runs Near You" horizontal scroll section.
  const liveRuns = gyms
    .filter((g) => (liveCountMap[g.id] || 0) > 0)
    .sort((a, b) => (liveCountMap[b.id] || 0) - (liveCountMap[a.id] || 0));

  // Partition the feed into friends vs. community
  const friendsActivity = activityFeed.filter((item) => friendIds.includes(item.userId));
  const communityActivity = activityFeed.filter((item) => !friendIds.includes(item.userId));

  // Shared row renderer — used by Recent Activity section (taps go to UserProfile)
  const renderActivityRow = (item) => (
    <TouchableOpacity
      key={item.id}
      activeOpacity={0.75}
      onPress={() => {
        console.log('🏀 [Activity] Row tapped — full item:', JSON.stringify(item));
        if (!item.userId) {
          console.warn('⚠️ [Activity] item.userId is missing, cannot navigate');
          return;
        }
        try {
          console.log('🏀 [Activity] Calling navigation.push UserProfile with userId:', item.userId);
          navigation.push('UserProfile', { userId: item.userId });
          console.log('🏀 [Activity] navigation.push called successfully');
        } catch (err) {
          console.error('❌ [Activity] navigation.push threw:', err);
        }
      }}
    >
      <BlurView intensity={40} tint="dark" style={styles.activityRow}>
        {item.userAvatar ? (
          <Image source={{ uri: item.userAvatar }} style={styles.activityAvatar} />
        ) : (
          <View style={[styles.activityAvatar, styles.activityAvatarPlaceholder]}>
            <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        <View style={styles.activityInfo}>
          <Text style={styles.activityText} numberOfLines={1}>
            <Text style={styles.activityName}>{item.userName}</Text>
            <Text style={styles.activityAction}>{' '}{item.action}{' '}</Text>
            <Text style={styles.activityGym}>{item.gymName}</Text>
          </Text>
          <Text style={styles.activityTime}>{getRelativeTime(item.createdAt)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
      </BlurView>
    </TouchableOpacity>
  );

  // Friends Activity row renderer — row taps go to RunDetails; avatar tap goes to UserProfile
  const renderFriendActivityRow = (item) => {
    const timeLabel = getRelativeTime(item.createdAt);
    const isJustNow = timeLabel === 'just now';

    const navigateToGym = () => {
      if (item.gymId) {
        navigation.getParent()?.navigate('Runs', {
          screen: 'RunDetails',
          params: { gymId: item.gymId, gymName: item.gymName },
        });
      } else if (item.userId) {
        console.warn('⚠️ [FriendsActivity] gymId missing, falling back to UserProfile');
        navigation.push('UserProfile', { userId: item.userId });
      } else {
        console.warn('⚠️ [FriendsActivity] gymId and userId both missing, cannot navigate');
      }
    };

    const navigateToUser = () => {
      if (!item.userId) {
        console.warn('⚠️ [FriendsActivity] userId missing on avatar tap');
        return;
      }
      navigation.push('UserProfile', { userId: item.userId });
    };

    return (
      <TouchableOpacity key={item.id} activeOpacity={0.75} onPress={navigateToGym}>
        <BlurView intensity={40} tint="dark" style={styles.activityRow}>
          <TouchableOpacity onPress={navigateToUser} activeOpacity={0.75}>
            {item.userAvatar ? (
              <Image source={{ uri: item.userAvatar }} style={styles.activityAvatar} />
            ) : (
              <View style={[styles.activityAvatar, styles.activityAvatarPlaceholder]}>
                <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.activityInfo}>
            <Text style={styles.activityText} numberOfLines={1}>
              <Text style={styles.activityName}>{item.userName}</Text>
              <Text style={styles.activityAction}>{' '}{item.action}{' '}</Text>
              <Text style={styles.activityGym}>{item.gymName}</Text>
            </Text>
            <Text style={[styles.activityTime, isJustNow && styles.activityTimeJustNow]}>
              {timeLabel}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
        </BlurView>
      </TouchableOpacity>
    );
  };

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      {/* Dark overlay sits between the background image and all content */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Logo size="small" />
            <Text style={styles.headerTitle}>RunCheck</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => Linking.openURL(INSTAGRAM_URL)}
            >
              <Ionicons name="logo-instagram" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => navigation.navigate('Leaderboard')}
            >
              <Ionicons name="trophy-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => goToTab('Profile')}
            >
              <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome hero text — copy adapts to checked-in state */}
          <View style={[styles.welcomeSection, isCheckedIn && styles.welcomeSectionActive]}>
            <Text style={styles.welcomeTitle}>
              {isCheckedIn ? 'Run in Progress' : 'Find Your\nNext Run'}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {isCheckedIn
                ? presence?.gymName || 'Session in progress'
                : 'Join a pickup run near you'}
            </Text>
          </View>

          {/*
           * Presence Card — only shown when user is checked in.
           * During the initial load we show a skeleton spinner inside the blur card.
           * Once loaded, if the user is checked in we render the full card with
           * gym name, time remaining, and a check-out button.
           */}
          {loading ? (
            <BlurView intensity={60} tint="dark" style={styles.presenceCard}>
              <ActivityIndicator size="small" color={colors.primary} />
            </BlurView>
          ) : isCheckedIn ? (
            <BlurView intensity={60} tint="dark" style={styles.presenceCard}>
              <View style={styles.presenceHeader}>
                <View style={styles.liveIndicator} />
                <Text style={styles.presenceLabel}>YOU'RE CHECKED IN</Text>
              </View>
              <Text style={styles.presenceGym}>{presence.gymName}</Text>
              {checkedInCount > 0 && (
                <View style={styles.presenceLiveRow}>
                  <Text style={[styles.presenceLiveLabel, { color: getRunEnergyLabel(checkedInCount).color }]}>
                    {getRunEnergyLabel(checkedInCount).label}
                  </Text>
                  <Text style={styles.presenceLiveCount}>
                    {checkedInCount} {checkedInCount === 1 ? 'player' : 'players'} here now
                  </Text>
                </View>
              )}
              <Text style={styles.presenceTime}>Expires in {getTimeRemaining()}</Text>
              <View style={styles.presenceActions}>
                {presence?.gymId && (
                  <TouchableOpacity
                    style={styles.viewDetailsButton}
                    onPress={() =>
                      navigation.getParent()?.navigate('Runs', {
                        screen: 'RunDetails',
                        params: { gymId: presence.gymId, gymName: presence.gymName },
                      })
                    }
                  >
                    <Text style={styles.viewDetailsText}>View Details</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.checkOutButton}
                  onPress={handleCheckOut}
                  disabled={checkingOut}
                >
                  {checkingOut ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.checkOutText}>Check Out</Text>
                  )}
                </TouchableOpacity>
              </View>
            </BlurView>
          ) : null}

          {/* Quick Actions — Check In card hidden when already checked in to avoid
              redundancy with the presence card above. Find Runs + Plan always visible. */}
          <View style={styles.actionsSection}>
            {!isCheckedIn && (
              <TouchableOpacity
                onPress={() => goToTab('CheckIn')}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={styles.actionCard}>
                  <Ionicons name="location" size={26} color="#FFFFFF" />
                  <Text style={styles.actionCardTitle}>Check Into a Run</Text>
                  <Text style={styles.actionCardSub}>Find courts near you</Text>
                </BlurView>
              </TouchableOpacity>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionCardSmallWrapper}
                onPress={() => goToTab('Runs')}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={styles.actionCardSmall}>
                  <Ionicons name="basketball-outline" size={24} color={colors.primary} />
                  <Text style={styles.actionSmallTitle}>Find Runs</Text>
                  <Text style={styles.actionSmallSub}>Open games</Text>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCardSmallWrapper}
                onPress={() => goToTab('Plan')}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={styles.actionCardSmall}>
                  <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                  <Text style={styles.actionSmallTitle}>Plan a Visit</Text>
                  <Text style={styles.actionSmallSub}>Schedule ahead</Text>
                </BlurView>
              </TouchableOpacity>
            </View>
          </View>

          {/* Live Runs Near You — horizontal scroll of gyms with active players */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live Runs Near You</Text>
            {totalActive > 0 && (
              <View style={styles.liveActivity}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{totalActive} active</Text>
              </View>
            )}
          </View>

          {totalActive === 0 ? (
            // Empty state — no real-time active presences anywhere
            <BlurView intensity={40} tint="dark" style={styles.liveRunsEmpty}>
              <Text style={styles.liveRunsEmptyText}>
                No live runs right now — be the first to check in.
              </Text>
              <TouchableOpacity
                style={styles.liveRunsEmptyButton}
                onPress={() => goToTab('CheckIn')}
                activeOpacity={0.8}
              >
                <Text style={styles.liveRunsEmptyButtonText}>Check In</Text>
              </TouchableOpacity>
            </BlurView>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.courtScroll}
              contentContainerStyle={styles.courtScrollContent}
            >
              {liveRuns.slice(0, 6).map((gym) => {
                // ── Single source of truth ────────────────────────────────
                // Deduplicate by `odId` (the userId key on presence docs) so
                // one user never appears twice in count, avatars, or startedAgo.
                const rawPresences = livePresenceMap[gym.id] || [];
                const seenUids = new Set();
                const activePresences = rawPresences.filter((p) => {
                  const uid = p.odId;
                  if (!uid || seenUids.has(uid)) return false;
                  seenUids.add(uid);
                  return true;
                });

                const activeCount    = activePresences.length;

                // Guard: skip this gym if livePresenceMap has no real-time
                // active presences — prevents a "LIVE RUN" card with 0 players
                // when gym.currentPresenceCount is stale and hasn't decremented yet.
                if (activeCount < 1) return null;

                const visibleAvatars = activePresences.slice(0, 3);
                const overflow       = Math.max(0, activeCount - 3);
                // startedAgo is derived from the SAME activePresences array —
                // never from gym.currentPresenceCount or any other source.
                const startedAgo     = getStartedAgoText(activePresences);

                // Debug logs — active player list + timestamp
                if (__DEV__) {
                  const startMillis = activePresences
                    .map((p) => p.checkedInAt?.toMillis?.() ?? null)
                    .filter(Boolean);
                  const startedAt = startMillis.length > 0
                    ? new Date(Math.min(...startMillis)).toISOString()
                    : 'unknown';
                  console.log(
                    `[LiveRun:${gym.name}] activeUniqueCount=${activeCount}`,
                    'userIds=[' + activePresences.map((p) => p.odId).join(', ') + ']'
                  );
                  console.log(
                    `[LiveRun:${gym.name}] startedAt=${startedAt} startedAgo="${startedAgo}"`
                  );
                }
                return (
                  <TouchableOpacity
                    key={gym.id}
                    activeOpacity={0.8}
                    onPress={() =>
                      navigation.getParent()?.navigate('Runs', {
                        screen: 'RunDetails',
                        params: {
                          gymId: gym.id,
                          gymName: gym.name,
                          players: activeCount,
                          imageUrl: gym.imageUrl,
                          plannedToday: gym.plannedToday || 0,
                          plannedTomorrow: gym.plannedTomorrow || 0,
                        },
                      })
                    }
                  >
                    <View style={styles.liveRunCard}>
                      {/* Gym image — faded background layer.
                          Priority: local bundled asset (GYM_LOCAL_IMAGES) →
                          remote imageUrl from Firestore → generic fallback. */}
                      <Image
                        source={
                          GYM_LOCAL_IMAGES[gym.id]
                            ? GYM_LOCAL_IMAGES[gym.id]
                            : gym.imageUrl
                            ? { uri: gym.imageUrl }
                            : require('../assets/images/court-bg.jpg')
                        }
                        style={styles.liveRunBgImage}
                        resizeMode="cover"
                        blurRadius={1.5}
                      />
                      {/* Dark overlay — sits above the image, below content */}
                      <View style={styles.liveRunBgOverlay} />

                      {/* 🔴 LIVE badge */}
                      <View style={styles.liveRunBadge}>
                        <BlinkingDot active style={styles.liveRunDot} />
                        <Text style={styles.liveRunBadgeText}>LIVE RUN</Text>
                      </View>

                      {/* Gym name — prominent, sits just under the badge */}
                      <Text style={styles.liveRunGymName} numberOfLines={2}>{gym.name}</Text>

                      {/* City label — subtle secondary line; gym.city is set directly on the
                          gym doc (e.g. "Round Rock"). No parsing needed, and the label is
                          suppressed entirely if the field is absent so nothing breaks. */}
                      {gym.city ? (
                        <Text style={styles.liveRunLocation} numberOfLines={1}>
                          📍 {gym.city}
                        </Text>
                      ) : null}

                      {/* Avatar stack — up to 3 overlapping circles + overflow pill */}
                      <View style={styles.liveRunAvatarRow}>
                        {visibleAvatars.map((p, i) => (
                          <View
                            key={p.odId || i}
                            style={[styles.liveRunAvatarWrap, i > 0 && styles.liveRunAvatarOffset]}
                          >
                            {p.userAvatar ? (
                              <Image source={{ uri: p.userAvatar }} style={styles.liveRunAvatar} />
                            ) : (
                              <View style={[styles.liveRunAvatar, styles.liveRunAvatarFallback]}>
                                <Text style={styles.liveRunAvatarInitial}>
                                  {(p.userName || '?')[0].toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                        {overflow > 0 && (
                          <View style={[styles.liveRunAvatar, styles.liveRunAvatarOverflow, styles.liveRunAvatarOffset]}>
                            <Text style={styles.liveRunOverflowText}>+{overflow}</Text>
                          </View>
                        )}
                      </View>

                      {/* Bottom row: "{N} players • {energy label}" */}
                      <Text style={styles.liveRunPlayerCount} numberOfLines={1}>
                        {activeCount} {activeCount === 1 ? 'player' : 'players'}
                        {' • '}
                        <Text style={{ color: getRunEnergyLabel(activeCount).color }}>
                          {getRunEnergyLabel(activeCount).label}
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Friends Activity feed — only shown when friends have recent activity */}
          {friendsActivity.length > 0 && (
            <>
              <Text style={styles.sectionTitleStandalone}>Friends Activity ({friendsActivity.length})</Text>
              <View style={styles.activityFeed}>
                {friendsActivity.map(renderFriendActivityRow)}
              </View>
            </>
          )}

          {/* Recent Activity feed — community items (non-friends), or full feed if no friends activity */}
          <Text style={styles.sectionTitleStandalone}>Recent Activity</Text>
          <View style={styles.activityFeed}>
            {(friendsActivity.length > 0 ? communityActivity : activityFeed).length === 0 ? (
              <BlurView intensity={40} tint="dark" style={styles.activityRow}>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTime}>No recent activity yet</Text>
                </View>
              </BlurView>
            ) : (
              (friendsActivity.length > 0 ? communityActivity : activityFeed).map(renderActivityRow)
            )}
          </View>

          {/* Instagram community card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Linking.openURL(INSTAGRAM_URL)}
            style={styles.igCardWrapper}
          >
            <BlurView intensity={40} tint="dark" style={styles.igCard}>
              <View style={styles.igIconCircle}>
                <Ionicons name="logo-instagram" size={22} color="#F97316" />
              </View>
              <View style={styles.igCardInfo}>
                <Text style={styles.igCardTitle}>Join the RunCheck community</Text>
                <Text style={styles.igCardSub}>
                  Follow us on Instagram for clips, updates, and featured hoopers
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
            </BlurView>
          </TouchableOpacity>

          {/* Footer tagline */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

/**
 * getStyles — Generates a themed StyleSheet for HomeScreen.
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
    backgroundColor: 'rgba(0,0,0,0.60)',
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  welcomeSection: {
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  // Tighter bottom gap when the presence card follows immediately below
  welcomeSectionActive: {
    marginBottom: SPACING.xs,
  },
  welcomeTitle: {
    fontSize: FONT_SIZES.hero,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
    lineHeight: 46,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.2,
  },
  presenceCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  presenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: SPACING.xs,
  },
  presenceLabel: {
    fontSize: FONT_SIZES.xs,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 1,
  },
  presenceGym: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  presenceTime: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: SPACING.md,
  },
  // Live energy + player count block inside the checked-in card
  presenceLiveRow: {
    alignItems: 'center',
    gap: 2,
    marginBottom: SPACING.xs,
  },
  presenceLiveLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.2,
  },
  presenceLiveCount: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.65)',
  },
  // Row that holds "View Details" + "Check Out" side by side
  presenceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  viewDetailsButton: {
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  viewDetailsText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  checkOutButton: {
    backgroundColor: colors.danger,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  checkOutText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  actionsSection: {
    gap: SPACING.sm,
  },
actionCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.xxs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
  },
  actionCardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginTop: SPACING.xs,
    letterSpacing: -0.2,
  },
  actionCardSub: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionCardSmallWrapper: {
    flex: 1,
  },
  actionCardSmall: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xxs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionSmallTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    marginTop: SPACING.xxs,
  },
  actionSmallSub: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.6)',
  },

  liveActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.lg,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  // Instagram community card
  igCardWrapper: {
    marginTop: SPACING.lg,
  },
  igCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.30)',
    gap: SPACING.sm,
  },
  igIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(249,115,22,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igCardInfo: {
    flex: 1,
    gap: 2,
  },
  igCardTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  igCardSub: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 16,
  },

  footer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  sectionTitleStandalone: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },

  // Hot Courts horizontal scroll
  courtScroll: {
    marginHorizontal: -SPACING.md,
  },
  courtScrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  courtCard: {
    width: 150,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 4,
  },
  courtCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
    marginBottom: 2,
  },
  courtLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  courtPlayerCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.2,
  },
  courtName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  courtMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  courtType: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  courtDot: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.4)',
  },
  courtDistance: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.5)',
  },

  // Live Runs Near You — empty state
  liveRunsEmpty: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
  },
  liveRunsEmptyText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  liveRunsEmptyButton: {
    marginTop: SPACING.sm,
    paddingVertical: 7,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  liveRunsEmptyButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(255,255,255,0.7)',
  },

  // Live Runs card (replaces courtCard)
  liveRunCard: {
    width: 190,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.40)',
    gap: 9,
    // Elevation/glow — makes the card pop off the dark background
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

  // Gym image background — absolutely fills the card at reduced opacity
  liveRunBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.99,
  },
  // Dark scrim — sits above the image to keep text readable
  liveRunBgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  // 🔴 LIVE badge row
  liveRunBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveRunDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  liveRunBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FF3B30',
    letterSpacing: 0.9,
  },

  // Avatar stack
  liveRunAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  liveRunAvatarWrap: {},
  liveRunAvatarOffset: {
    marginLeft: -12,
  },
  liveRunAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.55)',
  },
  liveRunAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveRunAvatarInitial: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  liveRunAvatarOverflow: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveRunOverflowText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    color: 'rgba(255,255,255,0.8)',
  },

  // Gym name
  liveRunGymName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  liveRunLocation: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },

  // Bottom row: player count + quality badge side by side
  liveRunBottomRow: {
    gap: 5,
  },
  liveRunPlayerCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  liveRunQualityBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  liveRunQualityText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.2,
  },

  // Recent Activity feed
  activityFeed: {
    gap: SPACING.xs,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: SPACING.sm,
  },
  activityAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  activityAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.85)',
  },
  activityName: {
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  activityAction: {
    color: 'rgba(255,255,255,0.6)',
  },
  activityGym: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  activityTime: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  activityTimeJustNow: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default HomeScreen;
