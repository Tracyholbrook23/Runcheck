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
 *   - Community Activity — Feed of high-value public run events (run starts,
 *                          run joins, clips). Check-ins and plan visits excluded.
 *
 * Layout uses a full-screen `ImageBackground` with a dark overlay so
 * all content renders on top of the court photo with consistent contrast.
 * BlurView cards from `expo-blur` give the frosted-glass UI feel.
 *
 * Styles are memoized per `(colors, isDark)` to avoid re-computing on
 * every state change.
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  ImageBackground,
  Image,
  Animated,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, SHADOWS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence, useGyms, useLivePresenceMap, useFeaturedClip, useProfile, useConversations } from '../hooks';
import { useMyRunChats } from '../hooks/useMyRunChats';
import { useWeeklyWinners } from '../hooks/useWeeklyWinners';
import { useSchedules } from '../hooks/useSchedules';
import { Logo } from '../components';
import { db, auth } from '../config/firebase';
import { collection, query, orderBy, limit, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
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
  const [refreshing, setRefreshing] = useState(false);
  const [runTypeSheetVisible, setRunTypeSheetVisible] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Data is live via Firestore listeners — brief visual feedback only
    setTimeout(() => setRefreshing(false), 800);
  }, []);

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
  const { homeCourtId, profile } = useProfile();
  // Community feed visibility — persisted to Firestore, defaults to shown
  const showCommunityFeed = profile?.preferences?.showCommunityFeed ?? true;
  const { unreadCount: dmUnreadCount } = useConversations();
  const { runChatUnreadCount } = useMyRunChats();
  const totalUnreadCount = dmUnreadCount + runChatUnreadCount;

  // Resolve home court gym object for quick-action card
  const homeCourtGym = useMemo(() => {
    if (!homeCourtId || !gyms.length) return null;
    return gyms.find((g) => g.id === homeCourtId) || null;
  }, [homeCourtId, gyms]);

  // Weekly winners — used for the 24-hour celebration card after each reset.
  const {
    winners: weeklyWinners,
    weekOf: winnersWeekOf,
    recordedAt: winnersRecordedAt,
  } = useWeeklyWinners();

  // Featured clip spotlight — single curated clip for the editorial card.
  const {
    clip: featuredClip,
    videoUrl: featuredVideoUrl,
    thumbnail: featuredThumbnail,
    uploaderInfo: featuredUploaderInfo,
    gymName: featuredGymName,
  } = useFeaturedClip(gyms);

  const [activityFeed, setActivityFeed] = useState([]);
  const [friendIds, setFriendIds] = useState([]);
  const [fetchError, setFetchError] = useState(false);

  // User's upcoming scheduled visits — reused from PlanVisitScreen's hook.
  // Derive todaysPlan: the soonest scheduled visit today (past or future both show,
  // so the card stays visible once you're close to your scheduled time).
  const { schedules } = useSchedules();
  const todaysPlan = useMemo(() => {
    if (!schedules.length) return null;
    const todayStr = new Date().toDateString();
    const todaySchedules = schedules.filter((s) => {
      const d = s.scheduledTime?.toDate?.();
      return d && d.toDateString() === todayStr;
    });
    if (!todaySchedules.length) return null;
    // Pick the soonest one
    todaySchedules.sort((a, b) => {
      const aMs = a.scheduledTime?.toMillis?.() ?? 0;
      const bMs = b.scheduledTime?.toMillis?.() ?? 0;
      return aMs - bMs;
    });
    const s = todaySchedules[0];
    return { gymId: s.gymId, gymName: s.gymName, scheduledTime: s.scheduledTime };
  }, [schedules]);

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

    // RC-002 safety: `gen` increments on every snapshot so an older in-flight
    // async resolution never overwrites a newer one; `cancelled` prevents
    // setState after unmount/unsubscribe.
    let gen = 0;
    let cancelled = false;

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const thisGen = ++gen;
        const now = new Date();
        const items = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => {
            // Hide 'joined a run at' items — these writes have been removed from
            // runService but docs already in Firestore must also be suppressed. RC-002.
            if (item.action === 'joined a run at') return false;
            // Hide activity tied to admin-removed runs (set by removeRun Cloud Function)
            if (item.isRemoved) return false;
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

        // RC-002: Cross-reference 'started a run at' items against the actual run doc.
        // Exclude activity if the run no longer exists, was removed, or is empty.
        const verified = await Promise.all(
          items.map(async (item) => {
            if (item.action === 'started a run at' && item.runId) {
              try {
                const runSnap = await getDoc(doc(db, 'runs', item.runId));
                if (!runSnap.exists()) return null;
                const run = runSnap.data();
                if (run.isRemoved === true) return null;
                if ((run.participantCount ?? 0) <= 0) return null;
              } catch (err) {
                // On fetch failure, hide the item to avoid showing stale data.
                if (__DEV__) console.warn('[HomeScreen] RC-002 run check failed:', item.runId, err);
                return null;
              }
            }
            return item;
          })
        );

        // Only apply if this is still the latest snapshot and component is mounted.
        if (!cancelled && thisGen === gen) {
          setActivityFeed(verified.filter(Boolean));
        }
      },
      (error) => {
        if (__DEV__) console.error('Error subscribing to activity feed:', error);
        if (!cancelled) { setActivityFeed([]); setFetchError(true); }
      }
    );

    return () => { cancelled = true; unsubscribe(); };
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
              if (__DEV__) console.error('Check-out error:', error);
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

  /** Formats a schedule's Firestore Timestamp to "7:00 AM" for the check-in card. */
  const formatPlanTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // ── Weekly Winners celebration card visibility ─────────────────────────
  // Show for 24 hours after winners are recorded, then auto-hide.
  const CELEBRATION_WINDOW_MS = 24 * 60 * 60 * 1000;
  const showWinnersCelebration = (() => {
    if (weeklyWinners.length === 0) return false;
    if (!winnersRecordedAt) return false;
    const recordedMs = winnersRecordedAt.toDate
      ? winnersRecordedAt.toDate().getTime()
      : new Date(winnersRecordedAt).getTime();
    return Date.now() - recordedMs < CELEBRATION_WINDOW_MS;
  })();

  /** Converts "2026-03-09" → "Mar 9" for the celebration card subtitle. */
  const formatWeekOf = (weekOfStr) => {
    if (!weekOfStr) return '';
    const [, m, d] = weekOfStr.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]} ${d}`;
  };

  const MEDAL_ICONS = ['🥇', '🥈', '🥉'];
  const TROPHY_COLORS = { 1: '#FFD700', 2: '#A8A9AD', 3: '#CD7F32' };
  const currentUid = auth.currentUser?.uid;

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

  // Community Activity shows only high-value public events: run starts, run joins, clips.
  // Low-signal events ('checked in at', 'planned a visit to') are excluded from this section.
  const COMMUNITY_ACTIONS = new Set(['started a run at', 'joined a run at', 'clip_posted']);
  const communityDisplayFeed = (friendsActivity.length > 0 ? communityActivity : activityFeed)
    .filter((item) => COMMUNITY_ACTIONS.has(item.action));

  // Shared row renderer — used by Community Activity section
  // Run-start items: avatar → UserProfile, card body → RunDetails (gym)
  // Other items: whole card → UserProfile
  const renderActivityRow = (item) => {
    const isRunActivity = item.action === 'started a run at';

    const handleCardPress = () => {
      if (isRunActivity && item.gymId) {
        navigation.getParent()?.navigate('Runs', {
          screen: 'RunDetails',
          params: { gymId: item.gymId, gymName: item.gymName },
        });
      } else if (item.userId) {
        navigation.push('UserProfile', { userId: item.userId });
      }
    };

    const handleAvatarPress = () => {
      if (item.userId) {
        navigation.push('UserProfile', { userId: item.userId });
      }
    };

    const avatarContent = item.userAvatar ? (
      <Image source={{ uri: item.userAvatar }} style={styles.activityAvatar} />
    ) : (
      <View style={[styles.activityAvatar, styles.activityAvatarPlaceholder]}>
        <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
      </View>
    );

    return (
      <TouchableOpacity key={item.id} activeOpacity={0.75} onPress={handleCardPress}>
        <BlurView intensity={40} tint="dark" style={styles.activityRow}>
          {isRunActivity ? (
            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.75}>
              {avatarContent}
            </TouchableOpacity>
          ) : (
            avatarContent
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
  };

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
        if (__DEV__) console.warn('[FriendsActivity] gymId missing, falling back to UserProfile');
        navigation.push('UserProfile', { userId: item.userId });
      } else {
        if (__DEV__) console.warn('[FriendsActivity] gymId and userId both missing, cannot navigate');
      }
    };

    const navigateToUser = () => {
      if (!item.userId) {
        if (__DEV__) console.warn('[FriendsActivity] userId missing on avatar tap');
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
          </View>
          <View style={styles.headerIcons}>
            {/* Messages — with unread badge */}
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => navigation.navigate('Messages')}
            >
              <Ionicons name="chatbubble-outline" size={22} color="#FFFFFF" />
              {totalUnreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => navigation.navigate('SearchUsers')}
            >
              <Ionicons name="search-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => navigation.navigate('Leaderboard')}
            >
              <Ionicons name="trophy-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => Linking.openURL(INSTAGRAM_URL)}
            >
              <Ionicons name="logo-instagram" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dismissible error banner — shown when activity feed subscription fails */}
        {fetchError && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setFetchError(false)} activeOpacity={0.8}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.errorBannerText}>Something went wrong — pull to refresh</Text>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
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
              redundancy with the presence card above. Start a Run + Find Runs + Plan always visible. */}
          <View style={styles.actionsSection}>
            {!isCheckedIn && (
              <TouchableOpacity
                onPress={() => {
                  if (todaysPlan?.gymId) {
                    navigation.getParent()?.navigate('Runs', {
                      screen: 'RunDetails',
                      params: { gymId: todaysPlan.gymId, gymName: todaysPlan.gymName },
                    });
                  } else {
                    goToTab('CheckIn');
                  }
                }}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={styles.actionCard}>
                  <View style={styles.checkInCardRow}>
                    <Ionicons name="location" size={26} color="#FFFFFF" />
                    {todaysPlan && (
                      <View style={styles.checkInPlanBadge}>
                        <Text style={styles.checkInPlanBadgeText}>TODAY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.actionCardTitle}>
                    {todaysPlan ? `Check In to ${todaysPlan.gymName}` : 'Check Into a Run'}
                  </Text>
                  <Text style={styles.actionCardSub}>
                    {todaysPlan
                      ? `Scheduled ${formatPlanTime(todaysPlan.scheduledTime)} — tap to go there`
                      : 'GPS confirms you\'re at the gym when you arrive'}
                  </Text>
                </BlurView>
              </TouchableOpacity>
            )}

            {/* START A RUN — primary CTA, always visible */}
            <TouchableOpacity
              onPress={() => setRunTypeSheetVisible(true)}
              activeOpacity={0.8}
            >
              <BlurView intensity={60} tint="dark" style={styles.startRunCard}>
                <View style={styles.startRunLeft}>
                  <View style={styles.startRunIconWrap}>
                    <Ionicons name="basketball" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.startRunTitle}>Start a Group Run</Text>
                    <Text style={styles.startRunSub}>Post it — let other players find & join you</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
              </BlurView>
            </TouchableOpacity>

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

          {/* Weekly Winners Celebration — visible for 24h after each reset */}
          {showWinnersCelebration && (() => {
            const champion = weeklyWinners[0];
            const runnersUp = weeklyWinners.slice(1);
            const championIsMe = champion?.uid === currentUid;
            const championInitials = (champion?.name || 'U')
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <BlurView intensity={60} tint="dark" style={styles.celebrationCard}>
                {/* ── Header ────────────────────────────────────────────── */}
                <View style={styles.celebrationHeader}>
                  <View style={styles.celebrationTrophyCircle}>
                    <Ionicons name="trophy" size={20} color="#FFD700" />
                  </View>
                  <View style={styles.celebrationHeaderText}>
                    <Text style={styles.celebrationTitle}>Last Week's Winners</Text>
                  </View>
                </View>

                {/* ── Hero: 1st Place ───────────────────────────────────── */}
                {champion && (
                  <TouchableOpacity
                    disabled={championIsMe}
                    activeOpacity={championIsMe ? 1 : 0.7}
                    onPress={() => navigation.push('UserProfile', { userId: champion.uid })}
                    style={styles.heroSection}
                  >
                    <Text style={styles.heroLabel}>WEEKLY CHAMPION</Text>

                    {/* Large gold-ringed avatar */}
                    <View style={styles.heroAvatarRing}>
                      {champion.photoURL ? (
                        <Image
                          source={{ uri: champion.photoURL }}
                          style={styles.heroAvatar}
                        />
                      ) : (
                        <View style={styles.heroInitialsCircle}>
                          <Text style={styles.heroInitials}>{championInitials}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.heroNameRow}>
                      <Text style={styles.heroName} numberOfLines={1}>
                        {champion.name}
                      </Text>
                      {championIsMe && (
                        <View style={styles.celebrationYouBadge}>
                          <Text style={styles.celebrationYouText}>YOU</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.heroPlacePts}>
                      1st Place · {champion.weeklyPoints} pts
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── Runners-up: 2nd & 3rd ─────────────────────────────── */}
                {runnersUp.length > 0 && (
                  <View style={styles.runnersUpSection}>
                    {runnersUp.map((w, i) => {
                      const isMe = w.uid === currentUid;
                      const trophyColor = TROPHY_COLORS[w.place] ?? 'rgba(255,255,255,0.5)';
                      const placeLabel = w.place === 2 ? '2nd' : '3rd';
                      const initials = (w.name || 'U')
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <TouchableOpacity
                          key={w.uid}
                          disabled={isMe}
                          activeOpacity={isMe ? 1 : 0.7}
                          onPress={() => navigation.push('UserProfile', { userId: w.uid })}
                          style={[
                            styles.runnerRow,
                            isMe && styles.runnerRowMe,
                          ]}
                        >
                          <Text style={styles.runnerMedal}>
                            {MEDAL_ICONS[i + 1] ?? ''}
                          </Text>

                          {w.photoURL ? (
                            <Image
                              source={{ uri: w.photoURL }}
                              style={[styles.runnerAvatar, { borderColor: trophyColor + '55' }]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.runnerInitialsCircle,
                                { backgroundColor: trophyColor + '20', borderColor: trophyColor + '55' },
                              ]}
                            >
                              <Text style={[styles.runnerInitials, { color: trophyColor }]}>
                                {initials}
                              </Text>
                            </View>
                          )}

                          <Text style={styles.runnerName} numberOfLines={1}>
                            {w.name}
                          </Text>
                          {isMe && (
                            <View style={styles.celebrationYouBadge}>
                              <Text style={styles.celebrationYouText}>YOU</Text>
                            </View>
                          )}
                          <Text style={styles.runnerPts}>
                            {placeLabel} · {w.weeklyPoints} pts
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── View Leaderboard link ──────────────────────────────── */}
                <TouchableOpacity
                  style={styles.celebrationLink}
                  onPress={() => navigation.navigate('Leaderboard')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.celebrationLinkText}>View Leaderboard →</Text>
                </TouchableOpacity>
              </BlurView>
            );
          })()}

          {/* Featured Clip Spotlight — single editorial card, auto-hidden when empty */}
          {featuredClip && featuredVideoUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ClipPlayer', {
                videoUrl: featuredVideoUrl,
                clipId: featuredClip.id,
                gymId: featuredClip.gymId,
              })}
            >
              <BlurView intensity={60} tint="dark" style={styles.spotlightCard}>
                {/* Header row */}
                <View style={styles.spotlightHeader}>
                  <View style={styles.spotlightBadge}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.spotlightBadgeText}>FEATURED</Text>
                  </View>
                  {featuredClip.featuredAt && (
                    <Text style={styles.spotlightTime}>
                      {(() => {
                        const d = featuredClip.featuredAt.toDate
                          ? featuredClip.featuredAt.toDate()
                          : new Date(featuredClip.featuredAt);
                        const s = Math.floor((Date.now() - d.getTime()) / 1000);
                        if (s < 60) return 'just now';
                        const m = Math.floor(s / 60);
                        if (m < 60) return `${m}m ago`;
                        const h = Math.floor(m / 60);
                        return `${h}h ago`;
                      })()}
                    </Text>
                  )}
                </View>

                {/* Thumbnail + play overlay */}
                <View style={styles.spotlightThumbWrap}>
                  {featuredThumbnail ? (
                    <Image
                      source={{ uri: featuredThumbnail }}
                      style={styles.spotlightThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.spotlightThumbPlaceholder} />
                  )}
                  <View style={styles.spotlightPlayOverlay}>
                    <Ionicons name="play-circle" size={44} color="rgba(255,255,255,0.9)" />
                  </View>
                </View>

                {/* Footer: uploader + gym */}
                <View style={styles.spotlightFooter}>
                  {featuredUploaderInfo?.photoURL ? (
                    <Image
                      source={{ uri: featuredUploaderInfo.photoURL }}
                      style={styles.spotlightAvatar}
                    />
                  ) : (
                    <View style={[styles.spotlightAvatar, styles.spotlightAvatarFallback]}>
                      <Ionicons name="person" size={12} color="rgba(255,255,255,0.7)" />
                    </View>
                  )}
                  <View style={styles.spotlightMeta}>
                    <Text style={styles.spotlightUploader} numberOfLines={1}>
                      {featuredUploaderInfo?.name || 'Player'}
                    </Text>
                    {featuredGymName && (
                      <Text style={styles.spotlightGym} numberOfLines={1}>
                        {featuredGymName}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="play" size={14} color="rgba(255,255,255,0.5)" />
                </View>

                {/* Caption — subtle single line below footer, only if present */}
                {!!featuredClip.caption && (
                  <View style={styles.spotlightCaptionRow}>
                    <Text style={styles.spotlightCaption} numberOfLines={1}>
                      {featuredClip.caption}
                    </Text>
                  </View>
                )}
              </BlurView>
            </TouchableOpacity>
          )}

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
            <View>
              <BlurView intensity={40} tint="dark" style={styles.liveRunsEmpty}>
                <Text style={styles.liveRunsEmptyText}>
                  No live runs right now — be the first to check in.
                </Text>
                <TouchableOpacity
                  style={styles.liveRunsEmptyButton}
                  onPress={() => goToTab('Runs')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.liveRunsEmptyButtonText}>Find a Gym</Text>
                </TouchableOpacity>
              </BlurView>

              {/* Home court quick-action — shown when user has a home court */}
              {homeCourtGym && (
                <TouchableOpacity
                  style={styles.homeCourtCard}
                  activeOpacity={0.8}
                  onPress={() =>
                    navigation.navigate('Runs', {
                      screen: 'RunDetails',
                      params: { gymId: homeCourtGym.id, gymName: homeCourtGym.name },
                    })
                  }
                >
                  <View style={styles.homeCourtIcon}>
                    <Ionicons name="home" size={18} color="#F97316" />
                  </View>
                  <View style={styles.homeCourtInfo}>
                    <Text style={styles.homeCourtLabel}>Your Home Court</Text>
                    <Text style={styles.homeCourtName} numberOfLines={1}>{homeCourtGym.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
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

          {/* Community Activity feed — run events and clips only (non-friends).
              Low-signal events (check-ins, plan visits) are intentionally excluded.
              Visibility controlled by profile.preferences.showCommunityFeed (Settings). */}
          {showCommunityFeed ? (
            <>
              <Text style={styles.sectionTitleStandalone}>Community Activity</Text>
              <View style={styles.activityFeed}>
                {communityDisplayFeed.length === 0 ? (
                  <BlurView intensity={40} tint="dark" style={styles.activityRow}>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityTime}>No recent activity yet</Text>
                    </View>
                  </BlurView>
                ) : (
                  communityDisplayFeed.map(renderActivityRow)
                )}
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={styles.feedHiddenRow}
              activeOpacity={0.7}
              onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'Settings' })}
            >
              <Ionicons name="people-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={styles.feedHiddenText}>Community Activity is hidden</Text>
              <Text style={styles.feedHiddenLink}> · Turn on in Settings</Text>
            </TouchableOpacity>
          )}

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

      {/* ── Run Type Picker Sheet ─────────────────────────────────────────
          Slide-up modal that lets users pick Open / Private / Paid run.
          Open run → navigate to Runs tab (pick a gym first).
          Private / Paid → navigate to CreatePrivateRunScreen (own gym input).
       ────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={runTypeSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRunTypeSheetVisible(false)}
      >
        <Pressable
          style={styles.typeSheetBackdrop}
          onPress={() => setRunTypeSheetVisible(false)}
        />
        <View style={styles.typeSheetContainer}>
          <View style={styles.typeSheetHandle} />
          <Text style={styles.typeSheetTitle}>Start a Group Run</Text>
          <Text style={styles.typeSheetSub}>Post your run so other players can see it and join you</Text>

          {/* Open Run */}
          <TouchableOpacity
            style={styles.typeSheetOption}
            activeOpacity={0.75}
            onPress={() => {
              setRunTypeSheetVisible(false);
              navigation.getParent()?.navigate('Runs', {
                screen: 'ViewRunsMain',
                params: { openStartRun: true },
              });
            }}
          >
            <View style={[styles.typeSheetIconWrap, { backgroundColor: 'rgba(255,107,53,0.18)' }]}>
              <Ionicons name="basketball-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeSheetOptionTitle}>Open Run</Text>
              <Text style={styles.typeSheetOptionDesc}>Post it publicly — anyone nearby can join</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          <View style={styles.typeSheetDivider} />

          {/* Private Run */}
          <TouchableOpacity
            style={styles.typeSheetOption}
            activeOpacity={0.75}
            onPress={() => {
              setRunTypeSheetVisible(false);
              navigation.getParent()?.navigate('Runs', {
                screen: 'CreatePrivateRun',
                params: { runType: 'private' },
              });
            }}
          >
            <View style={[styles.typeSheetIconWrap, { backgroundColor: 'rgba(88,86,214,0.22)' }]}>
              <Ionicons name="lock-closed-outline" size={22} color="#7C7AEA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeSheetOptionTitle}>Private Run</Text>
              <Text style={styles.typeSheetOptionDesc}>Invite only · Set skill requirements</Text>
            </View>
            <View style={styles.typeSheetPremiumChip}>
              <Text style={styles.typeSheetPremiumChipText}>⚡ Premium</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.typeSheetDivider} />

          {/* Paid Run */}
          <TouchableOpacity
            style={styles.typeSheetOption}
            activeOpacity={0.75}
            onPress={() => {
              setRunTypeSheetVisible(false);
              navigation.getParent()?.navigate('Runs', {
                screen: 'CreatePrivateRun',
                params: { runType: 'paid' },
              });
            }}
          >
            <View style={[styles.typeSheetIconWrap, { backgroundColor: 'rgba(52,199,89,0.18)' }]}>
              <Ionicons name="cash-outline" size={22} color="#34C759" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeSheetOptionTitle}>Paid Run</Text>
              <Text style={styles.typeSheetOptionDesc}>Charge entry · Collect earnings</Text>
            </View>
            <View style={styles.typeSheetPremiumChip}>
              <Text style={styles.typeSheetPremiumChipText}>⚡ Premium</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
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
  headerBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
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
  checkInCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  checkInPlanBadge: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  checkInPlanBadgeText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    letterSpacing: 0.8,
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

  // Weekly Winners celebration card — outer shell
  celebrationCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
    marginTop: SPACING.md,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  // ── Header row ────────────────────────────────────────────
  celebrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,215,0,0.15)',
  },
  celebrationTrophyCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,215,0,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  celebrationHeaderText: {
    flex: 1,
  },
  celebrationTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  celebrationSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },

  // ── Hero section: 1st place (centered, prominent) ─────────
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFD700',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  heroAvatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  heroInitialsCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,215,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInitials: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFD700',
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },
  heroName: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  heroPlacePts: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // ── Runners-up section: 2nd & 3rd (horizontal rows) ───────
  runnersUpSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,215,0,0.12)',
    paddingTop: SPACING.xs,
  },
  runnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.xxs,
    gap: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  runnerRowMe: {
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  runnerMedal: {
    fontSize: FONT_SIZES.body,
    width: 24,
    textAlign: 'center',
  },
  runnerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  runnerInitialsCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runnerInitials: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  runnerName: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runnerPts: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.4)',
  },

  // ── Shared: YOU badge (used by both hero and runner rows) ──
  celebrationYouBadge: {
    backgroundColor: 'rgba(255,215,0,0.20)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  celebrationYouText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFD700',
    letterSpacing: 0.5,
  },

  // ── Footer link ───────────────────────────────────────────
  celebrationLink: {
    marginTop: SPACING.sm,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,215,0,0.15)',
  },
  celebrationLinkText: {
    fontSize: FONT_SIZES.small,
    color: '#FFD700',
    fontWeight: FONT_WEIGHTS.semibold,
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

  // Home court quick-action card (shown in empty state)
  homeCourtCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.25)',
  },
  homeCourtIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(249,115,22,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  homeCourtInfo: {
    flex: 1,
  },
  homeCourtLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F97316',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  homeCourtName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
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

  // Community Activity feed
  activityFeed: {
    gap: SPACING.xs,
  },
  feedHiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  feedHiddenText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
  },
  feedHiddenLink: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.medium,
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

  // ── Featured Clip Spotlight ─────────────────────────────────────────────
  spotlightCard: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,158,11,0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  spotlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.xs,
  },
  spotlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  spotlightBadgeText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFD700',
    letterSpacing: 1,
  },
  spotlightTime: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.45)',
  },
  spotlightThumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 0,
  },
  spotlightThumb: {
    width: '100%',
    height: '100%',
  },
  spotlightThumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
  },
  spotlightPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  spotlightAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
  },
  spotlightAvatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightMeta: {
    flex: 1,
    minWidth: 0,
  },
  spotlightUploader: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
  },
  spotlightGym: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  spotlightCaptionRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    marginTop: -2,
  },
  spotlightCaption: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.55)',
    fontStyle: 'italic',
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

  // ── Start a Run card ───────────────────────────────────────────────────
  startRunCard: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  startRunLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  startRunIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startRunTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  startRunSub: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },

  // ── Run Type Picker Sheet ──────────────────────────────────────────────
  typeSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  typeSheetContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingHorizontal: SPACING.lg,
  },
  typeSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: SPACING.md,
  },
  typeSheetTitle: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  typeSheetSub: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: SPACING.md,
  },
  typeSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  typeSheetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSheetOptionTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  typeSheetOptionDesc: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  typeSheetPremiumChip: {
    backgroundColor: 'rgba(255,107,53,0.18)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeSheetPremiumChipText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  typeSheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});

export default HomeScreen;
