/**
 * LeaderboardScreen.js — Community Rankings & Point Guide
 *
 * Displays two stacked sections:
 *
 *  1. Leaderboard — Top 20 users ordered by totalPoints (Firestore query).
 *     Each row shows: rank number (trophy icon for top 3), initials avatar or
 *     photo, display name, rank badge pill, and point total.
 *     The signed-in user's row is highlighted so they can spot themselves.
 *
 *  2. How to Earn Points — A card showing each action with an Ionicons icon
 *     inside a colored circle, the action label, and a styled points badge.
 *
 *  3. Rank Tiers — A card listing each tier with its colored dot indicator,
 *     name, and point range.
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

// ─── Trophy colors for top-3 positions ───────────────────────────────────────
const TROPHY_COLORS = { 1: '#FFD700', 2: '#A8A9AD', 3: '#CD7F32' };

// ─── RankBadgePill ────────────────────────────────────────────────────────────
/**
 * RankBadgePill — Compact solid-color pill showing the rank name.
 *
 * Tier-specific effects:
 *   Bronze   — Solid #CD7F32 pill, white text, subtle top-highlight shine stripe.
 *   Silver   — Solid #A8A9AD pill, dark text, more prominent shine stripe.
 *   Gold     — Solid #FFD700 pill, dark text, animated ✦ sparkle (opacity pulse).
 *   Platinum — Solid #E8F4FD pill, dark text, scale-pulse glow shadow animation.
 */
function RankBadgePill({ rank, small = false }) {
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const sparkleAnim = useRef(new Animated.Value(0.3)).current;

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

    if (rank.name === 'Gold') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sparkleAnim, { toValue: 1.0, duration: 650, useNativeDriver: true }),
          Animated.timing(sparkleAnim, { toValue: 0.2, duration: 650, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }

    // Reset both anims when rank changes away from animated tiers
    pulseAnim.setValue(1);
    sparkleAnim.setValue(0.3);
  }, [rank.name]);

  // Silver, Gold, and Platinum have light backgrounds — use dark text for contrast
  const textColor = (rank.name === 'Silver' || rank.name === 'Gold' || rank.name === 'Platinum')
    ? '#2A2A2A'
    : '#FFFFFF';

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
        rank.name === 'Platinum' && {
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

      {/* Animated sparkle character for Gold */}
      {rank.name === 'Gold' && (
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

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUid = auth.currentUser?.uid;

  // Subscribe to top-20 users by totalPoints, live
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('totalPoints', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Leaderboard snapshot error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Current user's stats from the live list
  const currentUserEntry = users.find((u) => u.id === currentUid);
  const currentPoints    = currentUserEntry?.totalPoints || 0;
  const currentRank      = getUserRank(currentPoints);
  const progress         = getProgressToNextRank(currentPoints);
  const nextRankEntry    = RANKS[RANKS.indexOf(currentRank) + 1];
  const ptsToNext        = currentRank.nextRankAt ? currentRank.nextRankAt - currentPoints : 0;
  const myPosition       = users.findIndex((u) => u.id === currentUid) + 1;

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

      <ScrollView contentContainerStyle={styles.scroll}>

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
          <Text style={styles.progressLabel}>
            {currentRank.nextRankAt
              ? `${ptsToNext} pts to ${nextRankEntry?.name ?? ''}`
              : 'You\'ve reached the top rank!'}
          </Text>
        </View>

        {/* ── Leaderboard list ─────────────────────────────────────── */}
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
                  {/* Rank position — Ionicons trophy (colored) for top 3, number otherwise */}
                  <View style={styles.positionWrap}>
                    {position <= 3 ? (
                      <Ionicons
                        name="trophy"
                        size={18}
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

                  {/* Name + rank badge */}
                  <View style={styles.nameCol}>
                    <Text
                      style={[styles.userName, isMe && { color: colors.primary }]}
                      numberOfLines={1}
                    >
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

        {/* ── How to Earn Points ───────────────────────────────────── */}
        <Text style={styles.sectionTitle}>How to Earn Points</Text>
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
                {/* Icon inside a tinted circle */}
                <View style={[styles.actionIconCircle, { backgroundColor: iconColor + '20' }]}>
                  <Ionicons name={item.ionicon} size={17} color={iconColor} />
                </View>

                {/* Label + optional note */}
                <View style={styles.actionInfo}>
                  <Text style={styles.actionLabel}>{item.label}</Text>
                  {item.note && (
                    <Text style={styles.actionNote}>{item.note}</Text>
                  )}
                </View>

                {/* Points badge */}
                <View style={[styles.ptsBadge, { backgroundColor: iconColor + '18' }]}>
                  <Text style={[styles.ptsBadgeText, { color: iconColor }]}>
                    +{item.points} pts
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Rank Tiers ───────────────────────────────────────────── */}
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
              {/* Colored filled circle instead of emoji */}
              <View style={[styles.tierDot, { backgroundColor: rank.color }]} />
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
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
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
  rowHighlight: {
    backgroundColor: colors.primary + '12',
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

  // ── How to Earn Points rows ───────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 3,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
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

  // ── Tier ladder rows ──────────────────────────────────────────────────────
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  tierDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    flexShrink: 0,
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
