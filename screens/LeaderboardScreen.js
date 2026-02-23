/**
 * LeaderboardScreen.js — Community Rankings & Point Guide
 *
 * Displays two stacked sections:
 *
 *  1. Leaderboard — Top 20 users ordered by totalPoints (Firestore query).
 *     Each row shows: rank number (trophy for top 3), initials avatar or
 *     photo, display name, rank badge, and point total.
 *     The signed-in user's row is highlighted so they can spot themselves.
 *
 *  2. How to Earn Points — A card showing the user's current rank,
 *     a progress bar to the next tier, and the full action → points list.
 *
 * The Firestore query uses onSnapshot for real-time updates so the board
 * stays live without a manual refresh.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { auth, db } from '../config/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import {
  getUserRank,
  getProgressToNextRank,
  ACTION_LABELS,
  RANKS,
} from '../utils/badges';

// ─── Trophy labels for top 3 ──────────────────────────────────────────────
const TROPHY_ICONS = { 1: '🏆', 2: '🥈', 3: '🥉' };

/**
 * RankBadgePill — Compact inline badge showing tier icon + name.
 * Platinum gets a subtle animated glow.
 */
function RankBadgePill({ rank, small = false }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (rank.name === 'Platinum') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 1400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [rank.name]);

  return (
    <Animated.View
      style={[
        badgeStyles.pill,
        {
          backgroundColor: rank.color + '20',
          borderColor: rank.color + '60',
          shadowColor: rank.glowColor,
          shadowRadius: rank.name === 'Platinum' ? 10 : 4,
          shadowOpacity: rank.name === 'Platinum' ? 0.8 : 0.3,
          shadowOffset: { width: 0, height: 0 },
          paddingHorizontal: small ? 6 : 9,
          paddingVertical: small ? 2 : 4,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      <Text style={{ fontSize: small ? 10 : 12 }}>{rank.icon}</Text>
      <Text style={[badgeStyles.pillText, { color: rank.color, fontSize: small ? FONT_SIZES.xs : FONT_SIZES.small }]}>
        {rank.name}
      </Text>
    </Animated.View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 3,
    elevation: 3,
  },
  pillText: {
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
});

/**
 * LeaderboardScreen — Main component.
 */
export default function LeaderboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUid = auth.currentUser?.uid;

  // Subscribe to top-20 users by totalPoints, live
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('totalPoints', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
      setLoading(false);
    }, (err) => {
      console.error('Leaderboard snapshot error:', err);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Find the current user's entry in the leaderboard list
  const currentUserEntry = users.find((u) => u.id === currentUid);
  const currentPoints    = currentUserEntry?.totalPoints || 0;
  const currentRank      = getUserRank(currentPoints);
  const progress         = getProgressToNextRank(currentPoints);
  const nextRank         = RANKS[RANKS.indexOf(currentRank) + 1];
  const ptsToNext        = currentRank.nextRankAt ? currentRank.nextRankAt - currentPoints : 0;

  // Find the current user's position in the sorted list (1-indexed)
  const myPosition = users.findIndex((u) => u.id === currentUid) + 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Custom header ─────────────────────────────────────────────── */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Leaderboard</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── My Rank summary card ──────────────────────────────────────── */}
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
          <Text style={styles.progressLabel}>
            {currentRank.nextRankAt
              ? `${ptsToNext} pts to ${nextRank?.name ?? ''}`
              : '💎 You\'ve reached the top rank!'}
          </Text>
        </View>

        {/* ── Leaderboard list ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Top Players</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : users.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No rankings yet. Be the first to earn points!</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {users.map((user, index) => {
              const position = index + 1;
              const isMe = user.id === currentUid;
              const rank = getUserRank(user.totalPoints || 0);
              const initials = (user.name || 'U')
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <View
                  key={user.id}
                  style={[
                    styles.row,
                    isMe && styles.rowHighlight,
                    index < users.length - 1 && styles.rowBorder,
                  ]}
                >
                  {/* Rank number / trophy */}
                  <View style={styles.positionWrap}>
                    {position <= 3 ? (
                      <Text style={styles.trophy}>{TROPHY_ICONS[position]}</Text>
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
                    <View style={[styles.initialsCircle, { backgroundColor: rank.color + '30', borderColor: rank.color + '55' }]}>
                      <Text style={[styles.initials, { color: rank.color }]}>{initials}</Text>
                    </View>
                  )}

                  {/* Name + rank badge */}
                  <View style={styles.nameCol}>
                    <Text style={[styles.userName, isMe && { color: colors.primary }]} numberOfLines={1}>
                      {user.name || 'Anonymous'}{isMe ? ' (You)' : ''}
                    </Text>
                    <RankBadgePill rank={rank} small />
                  </View>

                  {/* Point total */}
                  <Text style={[styles.pts, { color: rank.color }]}>
                    {(user.totalPoints || 0).toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── How to Earn Points ───────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>How to Earn Points</Text>
        <View style={styles.listCard}>
          {ACTION_LABELS.map((item, index) => (
            <View
              key={item.action}
              style={[
                styles.actionRow,
                index < ACTION_LABELS.length - 1 && styles.rowBorder,
              ]}
            >
              <Text style={styles.actionIcon}>{item.icon}</Text>
              <View style={styles.actionInfo}>
                <Text style={styles.actionLabel}>{item.label}</Text>
                {item.note && (
                  <Text style={styles.actionNote}>{item.note}</Text>
                )}
              </View>
              <Text style={[styles.actionPts, { color: colors.primary }]}>
                +{item.points} pts
              </Text>
            </View>
          ))}
        </View>

        {/* ── Tier ladder ──────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Rank Tiers</Text>
        <View style={styles.listCard}>
          {RANKS.map((rank, index) => (
            <View
              key={rank.name}
              style={[
                styles.tierRow,
                index < RANKS.length - 1 && styles.rowBorder,
              ]}
            >
              <Text style={styles.tierIcon}>{rank.icon}</Text>
              <Text style={[styles.tierName, { color: rank.color }]}>{rank.name}</Text>
              <Text style={styles.tierRange}>
                {rank.nextRankAt
                  ? `${rank.minPoints}–${rank.nextRankAt - 1} pts`
                  : `${rank.minPoints}+ pts`}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

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
  // My rank summary card
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
    marginBottom: 4,
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
  // Section titles
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  // Shared card container
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    ...(isDark ? SHADOWS.md : {}),
  },
  // Leaderboard rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  rowHighlight: {
    backgroundColor: colors.primary + '12',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  positionWrap: {
    width: 28,
    alignItems: 'center',
  },
  trophy: {
    fontSize: 18,
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
  userName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  pts: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    minWidth: 44,
    textAlign: 'right',
  },
  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  actionIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  actionNote: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  actionPts: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  // Tier ladder rows
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  tierIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  tierName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    width: 76,
  },
  tierRange: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  // Misc
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
