/**
 * UserProfileScreen.js — Public User Profile
 *
 * Displays another user's public profile, navigated to by tapping an
 * activity feed row on HomeScreen. All data is fetched once on mount from
 * `users/{userId}`.
 *
 * Sections:
 *   - Avatar (photo or coloured initials fallback)
 *   - Name, rank badge, skill level badge
 *   - Stats row: Sessions Attended + Total Points
 *   - Followed Gyms list (gym names resolved via useGyms)
 *   - Add Friend / Friends ✓ button
 *     • Hidden when viewing your own profile
 *     • On press: arrayUnion the other user's UID into the current user's
 *       `friends` array, and arrayUnion the current user's UID into the
 *       other user's `friends` array — both client-side writes
 *
 * Navigation:
 *   Registered in HomeStack so it sits naturally above HomeScreen in the
 *   back stack. Receives `{ userId: string }` as route params.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms } from '../hooks';
import { auth, db } from '../config/firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getUserRank } from '../utils/badges';

/**
 * UserProfileScreen — Public view of another player's profile.
 *
 * @param {object} props
 * @param {object} props.route - React Navigation route; expects `route.params.userId`.
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const currentUid = auth.currentUser?.uid;
  const isOwnProfile = currentUid === userId;

  const { colors, isDark, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Fetched profile state
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Friend state — derived from the fetched profile
  const [isFriend, setIsFriend] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);

  const { gyms } = useGyms();

  // ── Fetch the target user's profile once on mount ───────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          // The current user is a friend if their UID appears in the
          // target user's friends array.
          setIsFriend((data.friends || []).includes(currentUid));
        }
      } catch (err) {
        console.error('UserProfileScreen fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, [userId, currentUid]);

  // ── Hide the default navigation header ──────────────────────────────────
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ── Derived display values ───────────────────────────────────────────────
  const totalPoints = profile?.totalPoints ?? 0;
  const rank = getUserRank(totalPoints);
  const sessionsAttended = profile?.reliability?.totalAttended ?? 0;

  // Resolve followed gym IDs to display names using the live gyms list
  const followedGymNames = useMemo(() => {
    if (!profile?.followedGyms?.length || !gyms.length) return [];
    return profile.followedGyms
      .map((id) => {
        const match = gyms.find((g) => g.id === id);
        return match ? { id, name: match.name } : null;
      })
      .filter(Boolean);
  }, [profile?.followedGyms, gyms]);

  // Skill-level badge colours (matches the pattern used in ProfileScreen)
  const skillBadgeColors = profile?.skillLevel && skillColors?.[profile.skillLevel]
    ? skillColors[profile.skillLevel]
    : null;

  // ── Add Friend handler ───────────────────────────────────────────────────
  const handleAddFriend = async () => {
    if (!currentUid || isOwnProfile || isFriend) return;
    setAddingFriend(true);
    try {
      // Add the target user to the current user's friends list
      await updateDoc(doc(db, 'users', currentUid), {
        friends: arrayUnion(userId),
      });
      // Add the current user to the target user's friends list
      await updateDoc(doc(db, 'users', userId), {
        friends: arrayUnion(currentUid),
      });
      setIsFriend(true);
    } catch (err) {
      console.error('Add friend error:', err);
      Alert.alert('Error', 'Could not add friend. Please try again.');
    } finally {
      setAddingFriend(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Not found state ──────────────────────────────────────────────────────
  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Ionicons name="person-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.notFoundText}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Back button row */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
        {/* Spacer to centre the title */}
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Avatar ── */}
        <View style={styles.avatarSection}>
          {profile.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(profile.name || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ── Name ── */}
        <Text style={styles.name}>{profile.name || 'Player'}</Text>

        {/* ── Rank badge + skill badge ── */}
        <View style={styles.badgeRow}>
          {/* Rank badge */}
          <View style={[styles.rankBadge, { backgroundColor: rank.color + '22', borderColor: rank.color + '55' }]}>
            <Text style={styles.rankIcon}>{rank.icon}</Text>
            <Text style={[styles.rankLabel, { color: rank.color }]}>{rank.name}</Text>
          </View>

          {/* Skill level badge */}
          {profile.skillLevel && (
            <View style={[
              styles.skillBadge,
              skillBadgeColors
                ? { backgroundColor: skillBadgeColors.bg }
                : { backgroundColor: colors.surfaceLight },
            ]}>
              <Text style={[
                styles.skillLabel,
                skillBadgeColors ? { color: skillBadgeColors.text } : { color: colors.textSecondary },
              ]}>
                {profile.skillLevel}
              </Text>
            </View>
          )}
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{sessionsAttended}</Text>
            <Text style={styles.statLabel}>Sessions{'\n'}Attended</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalPoints}</Text>
            <Text style={styles.statLabel}>Total{'\n'}Points</Text>
          </View>
        </View>

        {/* ── Add Friend / Friends ✓ button ── */}
        {!isOwnProfile && (
          <TouchableOpacity
            style={[styles.friendButton, isFriend && styles.friendButtonActive]}
            onPress={handleAddFriend}
            disabled={isFriend || addingFriend}
          >
            {addingFriend ? (
              <ActivityIndicator size="small" color={isFriend ? colors.success : '#fff'} />
            ) : isFriend ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginRight: 6 }} />
                <Text style={[styles.friendButtonText, styles.friendButtonTextActive]}>Friends</Text>
              </>
            ) : (
              <>
                <Ionicons name="person-add-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.friendButtonText}>Add Friend</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ── Followed Gyms ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Followed Gyms</Text>
          {followedGymNames.length === 0 ? (
            <Text style={styles.emptyText}>No gyms followed yet</Text>
          ) : (
            followedGymNames.map(({ id, name }) => (
              <View key={id} style={styles.gymRow}>
                <Ionicons name="basketball-outline" size={18} color={colors.primary} style={{ marginRight: SPACING.sm }} />
                <Text style={styles.gymName}>{name}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * getStyles — Themed StyleSheet for UserProfileScreen.
 *
 * @param {object} colors - Active color palette from ThemeContext.
 * @param {boolean} isDark - Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  topBarTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  notFoundText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },

  // ── Avatar ───────────────────────────────────────────────────────────────
  avatarSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarFallback: {
    backgroundColor: colors.primary + '28',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 42,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },

  // ── Name ─────────────────────────────────────────────────────────────────
  name: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },

  // ── Rank + skill badges ───────────────────────────────────────────────────
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 5,
  },
  rankIcon: {
    fontSize: 14,
  },
  rankLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  skillBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  skillLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    width: '100%',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: SPACING.md,
  },

  // ── Friend button ────────────────────────────────────────────────────────
  friendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    marginBottom: SPACING.lg,
  },
  friendButtonActive: {
    backgroundColor: colors.success + '18',
    borderWidth: 1,
    borderColor: colors.success + '55',
  },
  friendButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  friendButtonTextActive: {
    color: colors.success,
  },

  // ── Followed Gyms ────────────────────────────────────────────────────────
  section: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  gymName: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  emptyText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
