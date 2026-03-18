/**
 * LeaderboardScreen.js — Community Rankings & Point Guide
 *
 * Displays stacked sections:
 *
 *  1. Leaderboard — Top 20 users ordered by totalPoints (Firestore query).
 *     Each row shows: rank number (trophy icon for top 3), initials avatar or
 *     photo, display name, rank badge pill, and point total.
 *     The signed-in user's row is highlighted so they can spot themselves.
 *
 *  2. Rank Tiers — Unified tappable list of all 6 tiers. Tapping a row opens
 *     a bottom-sheet modal with full description, player-facing perks, and
 *     next-rank progression.
 *
 *  3. How to Earn Points — A card showing each action with an Ionicons icon
 *     inside a colored circle, the action label, and a styled points badge.
 *
 * The Firestore query uses onSnapshot for real-time updates so the board
 * stays live without a manual refresh.
 *
 * Visual notes:
 *   • RankBadgePill uses solid colored backgrounds (no emoji), with tier-
 *     specific effects: shine stripe on Bronze/Silver, opacity-twinkle
 *     sparkle character on Gold, scale-pulse glow on Platinum.
 *   • Trophy positions use Ionicons `trophy` colored gold/silver/bronze
 *     instead of emoji so they render consistently across platforms.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { auth, db } from '../config/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { RANKS } from '../config/ranks';
import { ACTION_LABELS } from '../config/points';
import { getUserRank, getProgressToNextRank, getNextRank } from '../utils/rankHelpers';
import { useWeeklyWinners } from '../hooks/useWeeklyWinners';

// ─── Trophy colors for top-3 positions ───────────────────────────────────────
const TROPHY_COLORS = { 1: '#FFD700', 2: '#A8A9AD', 3: '#CD7F32' };

// ─── Rank copy — short taglines for the list, full descriptions for the modal ─
const RANK_TAGLINES = {
  Bronze:   'Just getting started.',
  Silver:   'Players know you show up.',
  Gold:     'Reliable hooper.',
  Platinum: 'Most trusted on the court.',
  Diamond:  'The court respects your grind.',
  Legend:   'RunCheck royalty.',
};

const RANK_FULL_DESCRIPTIONS = {
  Bronze:   "You're in the game. Keep showing up and build your reputation.",
  Silver:   'The community recognizes you. You show up consistently and players respect that.',
  Gold:     'Elite status. Your name carries weight on the court and your presence matters.',
  Platinum: "Top tier. You're one of RunCheck's most trusted hoopers.",
  Diamond:  'Legendary grinder. Your dedication to the game sets you apart from everyone else.',
  Legend:   'Hall of Fame. You are RunCheck royalty — the best of the best.',
};

// ─── Player-facing perk labels per tier (no developer-facing IDs) ────────────
// Keyed by rank id. Bronze intentionally empty.
const RANK_PERKS_DISPLAY = {
  bronze:   [],
  silver:   ['Player Spotlight eligibility', 'Private run access'],
  gold:     ['Player Spotlight eligibility', 'Private run access', 'Trusted player recognition'],
  platinum: ['Player Spotlight eligibility', 'Expanded private run access', 'Trusted player recognition', 'Profile glow effect'],
  diamond:  ['Player Spotlight eligibility', 'Priority private run access', 'Trusted player recognition', 'Profile glow effect'],
  legend:   ['Player Spotlight eligibility', 'Top-tier private run access', 'Trusted player recognition', 'Profile glow effect', 'Hall of Fame recognition'],
};

// ─── RankBadgePill ────────────────────────────────────────────────────────────
/**
 * RankBadgePill — Compact solid-color pill showing the rank name.
 *
 * Tier-specific effects:
 *   Bronze   — Solid #CD7F32 pill, white text, subtle top-highlight shine stripe.
 *   Silver   — Solid #A8A9AD pill, dark text, more prominent shine stripe.
 *   Gold     — Solid #FFD700 pill, dark text, animated ✦ sparkle (opacity pulse).
 *   Platinum — Solid #E8F4FD pill, dark text, scale-pulse glow shadow animation.
 *   Diamond  — Solid #B9F2FF pill, dark text, scale-pulse glow shadow animation.
 *   Legend   — Solid #FF4500 pill, white text, scale-pulse glow + ✦ sparkle.
 */
function RankBadgePill({ rank, small = false }) {
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const sparkleAnim = useRef(new Animated.Value(0.3)).current;

  // Tiers that get the pulse-glow animation
  const hasPulse = rank.name === 'Platinum' || rank.name === 'Diamond' || rank.name === 'Legend';
  // Tiers that get the sparkle animation
  const hasSparkle = rank.name === 'Gold' || rank.name === 'Legend';

  useEffect(() => {
    if (hasPulse) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 1400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }

    // Reset pulse when rank changes away from animated tiers
    pulseAnim.setValue(1);
  }, [rank.name]);

  useEffect(() => {
    if (hasSparkle) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sparkleAnim, { toValue: 1.0, duration: 650, useNativeDriver: true }),
          Animated.timing(sparkleAnim, { toValue: 0.2, duration: 650, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }

    sparkleAnim.setValue(0.3);
  }, [rank.name]);

  // Light-background tiers use dark text for contrast; others use white
  const DARK_TEXT_TIERS = ['Silver', 'Gold', 'Platinum', 'Diamond'];
  const textColor = DARK_TEXT_TIERS.includes(rank.name) ? '#2A2A2A' : '#FFFFFF';

  const ph = small ? 7  : 10;
  const pv = small ? 3  : 5;
  const fs = small ? FONT_SIZES.xs : FONT_SIZES.small;

  return (
    <Animated.View
      style={[
        badgeStyles.pill,
        {
          backgroundColor: rank.color,
          paddingHorizontal: ph,
          paddingVertical: pv,
          transform: [{ scale: pulseAnim }],
        },
        hasPulse && {
          shadowColor:  rank.glowColor,
          shadowRadius: 12,
          shadowOpacity: 0.9,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        },
      ]}
    >
      {/* Highlight stripe — Bronze gets 15% white, Silver gets 28% white */}
      {(rank.name === 'Bronze' || rank.name === 'Silver') && (
        <View
          style={[
            badgeStyles.shineStripe,
            { opacity: rank.name === 'Silver' ? 0.28 : 0.15 },
          ]}
        />
      )}

      <Text style={[badgeStyles.pillText, { color: textColor, fontSize: fs }]}>
        {rank.name}
      </Text>

      {/* Animated sparkle character for Gold and Legend */}
      {hasSparkle && (
        <Animated.Text style={[badgeStyles.sparkle, { fontSize: small ? 7 : 9, opacity: sparkleAnim }]}>
          ✦
        </Animated.Text>
      )}
    </Animated.View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    gap: 3,
  },
  pillText: {
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.4,
  },
  // Absolutely-positioned top-half highlight that fakes a two-tone gradient
  shineStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    backgroundColor: '#FFFFFF',
  },
  sparkle: {
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.bold,
  },
});

// ─── LeaderboardScreen ────────────────────────────────────────────────────────
export default function LeaderboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const scrollRef = useRef(null);
  const [activeTab,      setActiveTab]      = useState('allTime');
  const [allTimeUsers,   setAllTimeUsers]   = useState([]);
  const [allTimeLoading, setAllTimeLoading] = useState(true);
  const [weeklyUsers,    setWeeklyUsers]    = useState([]);
  const [weeklyLoading,  setWeeklyLoading]  = useState(true);
  const [selectedRank,   setSelectedRank]   = useState(null);   // rank object for bottom sheet
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // Collapsible section state — all default collapsed to keep screen short
  const [showRankTiers, setShowRankTiers] = useState(false);
  const [showEarnPoints, setShowEarnPoints] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const modalSlide = useRef(new Animated.Value(0)).current;
  const currentUid = auth.currentUser?.uid;

  // Weekly winners — fetches most recent weeklyWinners doc once on mount
  const { winners: weeklyWinners, weekOf: winnersWeekOf } = useWeeklyWinners();

  // Reset scroll position when screen mounts
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Subscribe to top-20 users by totalPoints — All Time tab
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('totalPoints', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllTimeUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAllTimeLoading(false);
      },
      (err) => {
        if (__DEV__) console.error('Leaderboard allTime snapshot error:', err);
        setAllTimeLoading(false);
      }
    );
    return unsub;
  }, []);

  // Subscribe to top-20 users by weeklyPoints — This Week tab.
  // Firestore only returns docs where weeklyPoints exists, so this is
  // naturally empty until the first point is awarded after Phase 2B ships.
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('weeklyPoints', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setWeeklyUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setWeeklyLoading(false);
      },
      (err) => {
        if (__DEV__) console.error('Leaderboard weekly snapshot error:', err);
        setWeeklyLoading(false);
      }
    );
    return unsub;
  }, []);

  // My Rank card always uses all-time data — rank is permanent, not weekly
  const currentUserEntry = allTimeUsers.find((u) => u.id === currentUid);
  const currentPoints    = currentUserEntry?.totalPoints || 0;
  const currentRank      = getUserRank(currentPoints);
  const progress         = getProgressToNextRank(currentPoints);
  const nextRankEntry    = getNextRank(currentPoints);
  const ptsToNext        = currentRank.nextRankAt ? currentRank.nextRankAt - currentPoints : 0;
  const myPosition       = allTimeUsers.findIndex((u) => u.id === currentUid) + 1;

  // Format "2026-03-09" → "Mar 9" for the winners card subtitle
  const formatWeekOf = (weekOfStr) => {
    if (!weekOfStr) return '';
    const [y, m, d] = weekOfStr.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]} ${d}`;
  };

  // ── Rank detail bottom sheet helpers ──────────────────────────────────────
  const openRankSheet = useCallback((rank) => {
    setSelectedRank(rank);
    modalSlide.setValue(0);
    Animated.timing(modalSlide, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, []);

  const closeRankSheet = useCallback(() => {
    Animated.timing(modalSlide, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setSelectedRank(null);
    });
  }, []);

  // Active list driven by tab selection
  const displayUsers   = activeTab === 'allTime' ? allTimeUsers   : weeklyUsers;
  const displayLoading = activeTab === 'allTime' ? allTimeLoading : weeklyLoading;

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Custom header ────────────────────────────────────────────── */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Leaderboard</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >

        {/* ── My Rank summary card ─────────────────────────────────── */}
        <View style={[styles.myRankCard, { borderColor: currentRank.color + '55' }]}>
          <View style={styles.myRankRow}>
            <View>
              <Text style={styles.myRankLabel}>Your Rank</Text>
              <RankBadgePill rank={currentRank} />
            </View>
            <View style={styles.myPointsCol}>
              <Text style={[styles.myPoints, { color: currentRank.color }]}>{currentPoints}</Text>
              <Text style={styles.myPointsLabel}>total pts</Text>
            </View>
            {myPosition > 0 && (
              <View style={styles.myPositionCol}>
                <Text style={[styles.myPosition, { color: colors.textSecondary }]}>#{myPosition}</Text>
                <Text style={styles.myPointsLabel}>ranking</Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: currentRank.color },
              ]}
            />
          </View>
          {currentRank.nextRankAt ? (
            <View style={styles.nextUnlockWrap}>
              <Text style={[styles.nextUnlockLabel, { color: nextRankEntry?.color }]}>
                {nextRankEntry?.icon}  {nextRankEntry?.name} · {ptsToNext} pts away
              </Text>
            </View>
          ) : (
            <Text style={styles.progressLabel}>Max rank achieved</Text>
          )}
        </View>

        {/* ── Last Week's Winners ───────────────────────────────────── */}
        {weeklyWinners.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Last Week's Winners</Text>
            <View style={styles.listCard}>
              {/* Subtitle — week of date */}
              <View style={styles.winnersHeader}>
                <Ionicons name="trophy" size={16} color="#FFD700" />
                <Text style={styles.winnersSubtitle}>Week of {formatWeekOf(winnersWeekOf)}</Text>
              </View>

              {weeklyWinners.map((w, index) => {
                const trophyColor = TROPHY_COLORS[w.place] ?? colors.textMuted;
                const initials = (w.name || 'U')
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const isMe = w.uid === currentUid;

                return (
                  <TouchableOpacity
                    key={w.uid}
                    disabled={isMe}
                    activeOpacity={isMe ? 1 : 0.7}
                    onPress={() => navigation.push('UserProfile', { userId: w.uid })}
                    style={[
                      styles.winnersRow,
                      isMe && styles.rowHighlight,
                      index < weeklyWinners.length - 1 && styles.rowBorder,
                    ]}
                  >
                    {/* Place trophy */}
                    <View style={styles.positionWrap}>
                      <Ionicons
                        name="trophy"
                        size={w.place === 1 ? 22 : 18}
                        color={trophyColor}
                      />
                    </View>

                    {/* Avatar */}
                    {w.photoURL ? (
                      <Image source={{ uri: w.photoURL }} style={styles.avatar} />
                    ) : (
                      <View
                        style={[
                          styles.initialsCircle,
                          { backgroundColor: trophyColor + '20', borderColor: trophyColor + '55' },
                        ]}
                      >
                        <Text style={[styles.initials, { color: trophyColor }]}>{initials}</Text>
                      </View>
                    )}

                    {/* Name + optional YOU badge */}
                    <View style={styles.nameCol}>
                      <View style={styles.nameRow}>
                        <Text
                          style={[styles.userName, isMe && { color: colors.primary }]}
                          numberOfLines={1}
                        >
                          {w.name || 'Anonymous'}
                        </Text>
                        {isMe && (
                          <View style={styles.youBadge}>
                            <Text style={styles.youBadgeText}>YOU</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Points — in trophy color */}
                    <Text style={[styles.pts, { color: trophyColor }]}>
                      {(w.weeklyPoints || 0).toLocaleString()}
                    </Text>

                    {/* Tap affordance */}
                    {!isMe && (
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted + '80'} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Leaderboard list ─────────────────────────────────────── */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'allTime' && styles.tabPillActive]}
            onPress={() => setActiveTab('allTime')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabPillText, activeTab === 'allTime' && styles.tabPillTextActive]}>
              All Time
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'thisWeek' && styles.tabPillActive]}
            onPress={() => setActiveTab('thisWeek')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabPillText, activeTab === 'thisWeek' && styles.tabPillTextActive]}>
              This Week
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionTitle}>Top Players</Text>

        {displayLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : displayUsers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {activeTab === 'allTime'
                ? 'No rankings yet. Be the first to earn points!'
                : 'No weekly scores yet. Check back after your next run!'}
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {displayUsers.map((user, index) => {
              const position = index + 1;
              const isMe = user.id === currentUid;
              const rank = getUserRank(user.totalPoints || 0);
              const initials = (user.name || 'U')
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              // Subtle podium tint for top 3
              const podiumBg = position === 1
                ? '#FFD70010'
                : position === 2
                ? '#A8A9AD10'
                : position === 3
                ? '#CD7F3210'
                : null;

              const displayPts = (activeTab === 'allTime'
                ? user.totalPoints  || 0
                : user.weeklyPoints || 0
              ).toLocaleString();

              const displayName = user.name || 'Anonymous';

              return (
                <TouchableOpacity
                  key={user.id}
                  // Own row is not tappable — disabled suppresses press and opacity flash
                  disabled={isMe}
                  activeOpacity={isMe ? 1 : 0.7}
                  onPress={() => navigation.push('UserProfile', { userId: user.id })}
                  accessibilityLabel={`Rank ${position}, ${displayName}${isMe ? ', you' : ''}, ${displayPts} points`}
                  style={[
                    styles.row,
                    position === 1 && styles.firstPlaceRow,
                    podiumBg && { backgroundColor: podiumBg },
                    isMe && styles.rowHighlight,
                    index < displayUsers.length - 1 && styles.rowBorder,
                  ]}
                >
                  {/* Rank position — Ionicons trophy (colored) for top 3, number otherwise */}
                  <View style={styles.positionWrap}>
                    {position <= 3 ? (
                      <Ionicons
                        name="trophy"
                        size={position === 1 ? 22 : 18}
                        color={TROPHY_COLORS[position]}
                      />
                    ) : (
                      <Text style={[styles.posNum, isMe && { color: colors.primary }]}>
                        {position}
                      </Text>
                    )}
                  </View>

                  {/* Avatar — photo or initials circle */}
                  {user.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                  ) : (
                    <View
                      style={[
                        styles.initialsCircle,
                        { backgroundColor: rank.color + '30', borderColor: rank.color + '55' },
                      ]}
                    >
                      <Text style={[styles.initials, { color: rank.color }]}>{initials}</Text>
                    </View>
                  )}

                  {/* Name + rank badge + optional YOU pill */}
                  <View style={styles.nameCol}>
                    <View style={styles.nameRow}>
                      <Text
                        style={[
                          styles.userName,
                          isMe && { color: colors.primary },
                          position <= 3 && styles.podiumName,
                        ]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      {isMe && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>YOU</Text>
                        </View>
                      )}
                    </View>
                    <RankBadgePill rank={rank} small />
                  </View>

                  {/* Point total — weekly tab shows weeklyPoints; rank color always from all-time totalPoints */}
                  <Text style={[styles.pts, { color: rank.color }]}>
                    {displayPts}
                  </Text>

                  {/* Tap affordance — only shown for other players */}
                  {!isMe && (
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted + '80'} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Rank Tiers — collapsible ───────────────────────── */}
        <TouchableOpacity
          style={styles.sectionToggle}
          activeOpacity={0.7}
          onPress={() => setShowRankTiers(!showRankTiers)}
        >
          <View style={styles.toggleLeft}>
            <View style={[styles.toggleIcon, { backgroundColor: 'rgba(255,215,0,0.15)' }]}>
              <Ionicons name="ribbon-outline" size={18} color="#FFD700" />
            </View>
            <Text style={styles.toggleLabel}>Rank Tiers</Text>
          </View>
          <Ionicons
            name={showRankTiers ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {showRankTiers && (
          <View style={styles.listCard}>
            {RANKS.map((r, index) => {
              const isCurrentRank = r.name === currentRank.name;
              return (
                <TouchableOpacity
                  key={r.name}
                  activeOpacity={0.7}
                  onPress={() => openRankSheet(r)}
                  style={[
                    styles.tierRow,
                    isCurrentRank && { backgroundColor: r.color + '18' },
                    index < RANKS.length - 1 && styles.rowBorder,
                  ]}
                >
                  <Text style={styles.tierIcon}>{r.icon}</Text>
                  <View style={styles.tierInfo}>
                    <View style={styles.tierNameRow}>
                      <Text style={[styles.tierName, { color: r.color }]}>{r.name}</Text>
                      {isCurrentRank && (
                        <View style={[styles.currentBadge, { borderColor: r.color + '60' }]}>
                          <Text style={[styles.currentBadgeText, { color: r.color }]}>You</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.tierTagline}>{RANK_TAGLINES[r.name]}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted + '80'} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── How to Earn Points — collapsible ────────────────── */}
        <TouchableOpacity
          style={styles.sectionToggle}
          activeOpacity={0.7}
          onPress={() => setShowEarnPoints(!showEarnPoints)}
        >
          <View style={styles.toggleLeft}>
            <View style={[styles.toggleIcon, { backgroundColor: 'rgba(249,115,22,0.15)' }]}>
              <Ionicons name="flash-outline" size={18} color="#F97316" />
            </View>
            <Text style={styles.toggleLabel}>How to Earn Points</Text>
          </View>
          <Ionicons
            name={showEarnPoints ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {showEarnPoints && (
          <View style={styles.listCard}>
            {ACTION_LABELS.map((item, index) => {
              const iconColor = item.iconColor ?? colors.primary;
              return (
                <View
                  key={item.action}
                  style={[
                    styles.actionRow,
                    index < ACTION_LABELS.length - 1 && styles.rowBorder,
                  ]}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: iconColor + '20' }]}>
                    <Ionicons name={item.ionicon} size={17} color={iconColor} />
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={styles.actionLabel}>{item.label}</Text>
                    {item.note && (
                      <Text style={styles.actionNote}>{item.note}</Text>
                    )}
                  </View>
                  <View style={[styles.ptsBadge, { backgroundColor: iconColor + '18' }]}>
                    <Text style={[styles.ptsBadgeText, { color: iconColor }]}>
                      +{item.points} pts
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Rewards & Recognition — collapsible ──────────────── */}
        <TouchableOpacity
          style={styles.sectionToggle}
          activeOpacity={0.7}
          onPress={() => setShowRewards(!showRewards)}
        >
          <View style={styles.toggleLeft}>
            <View style={[styles.toggleIcon, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
              <Ionicons name="gift-outline" size={18} color="#22C55E" />
            </View>
            <Text style={styles.toggleLabel}>Rewards & Recognition</Text>
          </View>
          <Ionicons
            name={showRewards ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>
        {showRewards && (
        <View style={styles.listCard}>
          {[
            {
              icon: 'trophy-outline',
              color: '#FFD700',
              label: 'Weekly Winner',
              desc: 'Top hooper of the week earns recognition across the community.',
            },
            {
              icon: 'megaphone-outline',
              color: '#5B8FF9',
              label: 'Player Spotlight',
              desc: "Winner gets featured on RunCheck's social channels.",
            },
            {
              icon: 'lock-open-outline',
              color: '#52C41A',
              label: 'Exclusive Access',
              desc: 'Rank milestones unlock special app perks for top players.',
            },
          ].map((item, index, arr) => (
            <View
              key={item.label}
              style={[styles.rewardRow, index < arr.length - 1 && styles.rowBorder]}
            >
              <View style={[styles.rewardIconCircle, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={17} color={item.color} />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionLabel}>{item.label}</Text>
                <Text style={styles.actionNote}>{item.desc}</Text>
              </View>
              <View style={styles.comingSoonPill}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
          ))}
        </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* ── Rank Detail Bottom Sheet ──────────────────────────────── */}
      <Modal
        visible={selectedRank !== null}
        transparent
        animationType="none"
        onRequestClose={closeRankSheet}
        statusBarTranslucent
      >
        <Pressable style={styles.sheetOverlay} onPress={closeRankSheet}>
          <Animated.View
            style={[
              styles.sheetContainer,
              {
                transform: [{
                  translateY: modalSlide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [400, 0],
                  }),
                }],
                opacity: modalSlide,
              },
            ]}
          >
            {/* Prevent taps inside the sheet from closing it */}
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Drag handle */}
              <View style={styles.sheetHandle} />

              {selectedRank && (() => {
                const r = selectedRank;
                const isMyRank = r.name === currentRank.name;
                const perks = RANK_PERKS_DISPLAY[r.id] || [];
                const nextRank = getNextRank(r.minPoints);
                // Show user's actual progress if this is their rank
                const sheetProgress = isMyRank ? progress : null;

                return (
                  <View style={styles.sheetContent}>
                    {/* ── Header: icon + name + point range ─── */}
                    <Text style={styles.sheetIcon}>{r.icon}</Text>
                    <Text style={[styles.sheetRankName, { color: r.color }]}>{r.name}</Text>
                    <Text style={styles.sheetRange}>
                      {r.nextRankAt
                        ? `${r.minPoints.toLocaleString()} – ${(r.nextRankAt - 1).toLocaleString()} pts`
                        : `${r.minPoints.toLocaleString()}+ pts`}
                    </Text>

                    {/* ── Full description ─── */}
                    <Text style={styles.sheetDesc}>{RANK_FULL_DESCRIPTIONS[r.name]}</Text>

                    {/* ── Perks section ─── */}
                    <View style={styles.sheetDivider} />
                    <Text style={styles.sheetSectionLabel}>
                      {perks.length > 0 ? 'UNLOCKS' : 'UNLOCKS'}
                    </Text>
                    {perks.length > 0 ? (
                      perks.map((perk, i) => (
                        <View key={i} style={styles.sheetPerkRow}>
                          <Text style={styles.sheetPerkBullet}>✦</Text>
                          <Text style={styles.sheetPerkText}>{perk}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.sheetNoPerk}>No unlocks yet — keep grinding!</Text>
                    )}

                    {/* ── Next rank / max rank ─── */}
                    <View style={styles.sheetDivider} />
                    {nextRank ? (
                      <>
                        <Text style={styles.sheetSectionLabel}>NEXT RANK</Text>
                        <View style={styles.sheetNextRow}>
                          <Text style={styles.sheetNextIcon}>{nextRank.icon}</Text>
                          <Text style={[styles.sheetNextName, { color: nextRank.color }]}>
                            {nextRank.name}
                          </Text>
                          <Text style={styles.sheetNextPts}>
                            · {nextRank.minPoints.toLocaleString()} pts
                          </Text>
                        </View>
                        {isMyRank && sheetProgress !== null && (
                          <View style={styles.sheetProgressWrap}>
                            <View style={styles.sheetProgressTrack}>
                              <View
                                style={[
                                  styles.sheetProgressFill,
                                  { width: `${Math.round(sheetProgress * 100)}%`, backgroundColor: r.color },
                                ]}
                              />
                            </View>
                            <Text style={styles.sheetProgressLabel}>
                              {ptsToNext > 0 ? `${ptsToNext.toLocaleString()} pts to ${nextRank.name}` : 'Almost there!'}
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={styles.sheetMaxRank}>Max rank achieved 👑</Text>
                    )}
                  </View>
                );
              })()}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.4,
  },
  scroll: {
    padding: SPACING.md,
  },

  // ── My rank card ──────────────────────────────────────────────────────────
  myRankCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1.5,
    ...(isDark ? {} : SHADOWS.sm),
  },
  myRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  myRankLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  myPointsCol: {
    alignItems: 'center',
  },
  myPoints: {
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.5,
  },
  myPointsLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  myPositionCol: {
    alignItems: 'center',
  },
  myPosition: {
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  progressLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // ── Shared section titles & card container ────────────────────────────────
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  toggleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    ...(isDark ? SHADOWS.md : {}),
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // ── Leaderboard rows ──────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  firstPlaceRow: {
    paddingVertical: SPACING.sm + 5,
  },
  rowHighlight: {
    backgroundColor: colors.primary + '12',
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },

  // ── Last Week's Winners card ──────────────────────────────────────────────
  winnersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  winnersSubtitle: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  winnersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },

  positionWrap: {
    width: 28,
    alignItems: 'center',
  },
  posNum: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  initialsCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  nameCol: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  youBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  youBadgeText: {
    fontSize: FONT_SIZES.xs - 1,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
    letterSpacing: 0.6,
  },
  userName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  podiumName: {
    fontSize: FONT_SIZES.body + 1,
    fontWeight: FONT_WEIGHTS.bold,
  },
  pts: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    minWidth: 44,
    textAlign: 'right',
  },

  // ── How to Earn Points rows ───────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs + 2,
  },
  actionIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  actionNote: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  ptsBadge: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  ptsBadgeText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.2,
  },

  // ── Unified Rank Tiers — tappable rows ───────────────────────────────────
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  tierIcon: {
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  tierInfo: {
    flex: 1,
    gap: 2,
  },
  tierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  tierTagline: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  currentBadge: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  currentBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // ── Next Unlock hint — inside My Rank card ────────────────────────────────
  nextUnlockWrap: {
    marginTop: SPACING.xs,
    gap: 3,
    alignItems: 'center',
  },
  nextUnlockLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  nextUnlockDesc: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // ── Rank Detail Bottom Sheet ───────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.lg + 4,
    borderTopRightRadius: RADIUS.lg + 4,
    paddingBottom: SPACING.xl + SPACING.lg,
    maxHeight: Dimensions.get('window').height * 0.7,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted + '40',
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sheetContent: {
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  sheetIcon: {
    fontSize: 44,
    marginBottom: SPACING.xs,
  },
  sheetRankName: {
    fontSize: FONT_SIZES.subtitle + 2,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sheetRange: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginBottom: SPACING.md,
  },
  sheetDesc: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  sheetDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: SPACING.md,
  },
  sheetSectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  sheetPerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  sheetPerkBullet: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  sheetPerkText: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
  },
  sheetNoPerk: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
    alignSelf: 'flex-start',
    fontStyle: 'italic',
  },
  sheetNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: SPACING.xs,
  },
  sheetNextIcon: {
    fontSize: 18,
  },
  sheetNextName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  sheetNextPts: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  sheetProgressWrap: {
    width: '100%',
    marginTop: SPACING.xs,
  },
  sheetProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: 4,
  },
  sheetProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  sheetProgressLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  sheetMaxRank: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
    fontWeight: FONT_WEIGHTS.semibold,
    alignSelf: 'flex-start',
  },

  // ── Rewards & Recognition rows ────────────────────────────────────────────
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 3,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  rewardIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  comingSoonPill: {
    backgroundColor: colors.textMuted + '20',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  comingSoonText: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── All Time / This Week tab toggle ───────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  tabPill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabPillText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textMuted,
  },
  tabPillTextActive: {
    color: '#FFFFFF',
  },

  // ── Misc ──────────────────────────────────────────────────────────────────
  loadingWrap: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
