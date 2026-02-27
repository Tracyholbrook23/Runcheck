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
 *   - Add Friend / Request Sent / Friends ✓ button
 *     • Hidden when viewing your own profile
 *     • On press: calls the `addFriend` Cloud Function with { friendUserId }
 *     • Shows "Request Sent" (disabled) if userId is in the current user's
 *       sentRequests array (checked via target user's receivedRequests on mount)
 *     • Shows "Friends ✓" (disabled) if already in target user's friends array
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
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms } from '../hooks';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
  const [fetchError, setFetchError] = useState(null);

  // Friend state — derived from the fetched profile
  const [isFriend, setIsFriend] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);

  // Request state — true if currentUid already appears in target user's
  // receivedRequests (meaning we already sent a request via addFriend)
  const [requestSent, setRequestSent] = useState(false);

  console.log('🧑 [UserProfileScreen] mounted — userId:', userId, '| currentUid:', currentUid);

  const { gyms } = useGyms();

  // ── Fetch the target user's profile + current user's sentRequests ────────
  // Two parallel reads: users/{userId} for the profile/isFriend check, and
  // users/{currentUid} for the authoritative requestSent check.
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      console.log('🧑 [UserProfileScreen] fetching users/', userId);
      try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (cancelled) return;
        console.log('🧑 [UserProfileScreen] doc exists:', snap.exists(), '| fields:', snap.exists() ? Object.keys(snap.data()) : 'n/a');
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          // The current user is a friend if their UID appears in the
          // target user's friends array.
          setIsFriend((data.friends || []).includes(currentUid));
        } else {
          console.warn('🧑 [UserProfileScreen] No document at users/', userId);
        }
      } catch (err) {
        console.error('❌ [UserProfileScreen] Firestore fetch error:', err.code, err.message);
        if (!cancelled) setFetchError(err.message || 'Permission denied');
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Check requestSent from the CURRENT user's sentRequests array.
      // Must not rely on the target user's receivedRequests, which is a
      // different field owned by a different document.
      if (currentUid && currentUid !== userId) {
        try {
          const currentUserSnap = await getDoc(doc(db, 'users', currentUid));
          console.log('🧑 [UserProfileScreen] fetching sentRequests for currentUid:', currentUid);
          if (!cancelled && currentUserSnap.exists()) {
            setRequestSent((currentUserSnap.data().sentRequests || []).includes(userId));
          }
        } catch (reqErr) {
          console.warn('🧑 [UserProfileScreen] sentRequests check failed:', reqErr.message);
        }
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

  // Guard against stale skill values from the old 4-tier system (Pro, Beginner,
  // Intermediate, Advanced). Only the three current values are valid.
  const VALID_SKILL_LEVELS = ['Casual', 'Competitive', 'Either'];
  const displaySkillLevel = VALID_SKILL_LEVELS.includes(profile?.skillLevel)
    ? profile.skillLevel
    : 'Casual';

  // Skill-level badge colours (matches the pattern used in ProfileScreen)
  const skillBadgeColors = skillColors?.[displaySkillLevel] ?? null;

  // Human-readable label for the skill/play-style badge — avoids showing "Either" raw
  const playStyleLabelMap = { Casual: 'Casual', Competitive: 'Competitive', Either: 'Casual / Competitive' };
  const displayPlayStyle = playStyleLabelMap[displaySkillLevel] ?? displaySkillLevel;

  // ── Remove Friend handler ────────────────────────────────────────────────
  const handleRemoveFriend = () => {
    Alert.alert(
      'Remove friend?',
      'They will be removed from your friends list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const removeFriendFn = httpsCallable(getFunctions(), 'removeFriend');
              await removeFriendFn({ friendUserId: userId });
              setIsFriend(false);
            } catch (err) {
              console.log('Remove friend error:', err);
            }
          },
        },
      ]
    );
  };

  // ── Add Friend handler — calls the addFriend Cloud Function ─────────────
  // The function handles both sending a new request and accepting an inbound
  // one. The returned status drives local state so the button updates instantly.
  const handleAddFriend = async () => {
    if (!currentUid || isOwnProfile || isFriend || requestSent) return;
    setAddingFriend(true);
    try {
      const addFriendFn = httpsCallable(getFunctions(), 'addFriend');
      const result = await addFriendFn({ friendUserId: userId });
      const status = result?.data?.status;
      console.log('🧑 [UserProfileScreen] addFriend status:', status);

      if (status === 'accepted' || status === 'already_friends') {
        setIsFriend(true);
        setRequestSent(false);
      } else {
        // 'request_sent' | 'already_requested' | any other value
        setRequestSent(true);
      }
    } catch (err) {
      console.error('Add friend error:', err);
      Alert.alert('Error', 'Could not send friend request. Please try again.');
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

  // ── Not found / error state ──────────────────────────────────────────────
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
          <Text style={styles.notFoundText}>
            {fetchError ? `Error: ${fetchError}` : 'Profile not found'}
          </Text>
          <Text style={styles.notFoundSub}>userId: {userId}</Text>
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
              {displayPlayStyle}
            </Text>
          </View>
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

        {/* ── Add Friend / Request Sent / Friends ✓ + Remove Friend buttons ── */}
        {!isOwnProfile && (
          isFriend ? (
            <View style={{ width: '100%', marginBottom: SPACING.lg }}>
              {/* Status-only Friends ✓ button */}
              <TouchableOpacity
                style={[styles.friendButton, styles.friendButtonActive]}
                disabled={true}
              >
                <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginRight: 6 }} />
                <Text style={[styles.friendButtonText, styles.friendButtonTextActive]}>Friends</Text>
              </TouchableOpacity>
              {/* Remove Friend button */}
              <TouchableOpacity
                style={[
                  styles.friendButton,
                  {
                    marginTop: SPACING.sm,
                    marginBottom: 0,
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: colors.error ?? '#d9534f',
                  },
                ]}
                onPress={handleRemoveFriend}
                disabled={addingFriend}
              >
                <Ionicons name="person-remove-outline" size={18} color={colors.error ?? '#d9534f'} style={{ marginRight: 6 }} />
                <Text style={[styles.friendButtonText, { color: colors.error ?? '#d9534f' }]}>Remove Friend</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.friendButton,
                requestSent && styles.friendButtonPending,
              ]}
              onPress={handleAddFriend}
              disabled={requestSent || addingFriend}
            >
              {addingFriend ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : requestSent ? (
                <>
                  <Ionicons name="time-outline" size={18} color={colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.friendButtonText, styles.friendButtonTextPending]}>Request Sent</Text>
                </>
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.friendButtonText}>Add Friend</Text>
                </>
              )}
            </TouchableOpacity>
          )
        )}

        {/* ── Followed Gyms ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Followed Gyms</Text>
          {followedGymNames.length === 0 ? (
            <Text style={styles.emptyText}>No gyms followed yet</Text>
          ) : (
            followedGymNames.map(({ id, name }) => (
              <Pressable
                key={id}
                onPress={() => {
                  navigation.getParent()?.navigate('Runs', {
                    screen: 'RunDetails',
                    params: { gymId: id, gymName: name },
                  });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={!id}
                style={({ pressed }) => [styles.gymRow, pressed ? { opacity: 0.7 } : null, !id ? { opacity: 0.5 } : null]}
                accessibilityRole="button"
                testID={`followedGym_${id}`}
              >
                <Ionicons name="basketball-outline" size={18} color={colors.primary} style={{ marginRight: SPACING.sm }} />
                <Text style={styles.gymName}>{name}</Text>
              </Pressable>
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
  notFoundSub: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: SPACING.xs,
    opacity: 0.6,
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
  // Already friends state
  friendButtonActive: {
    backgroundColor: colors.success + '18',
    borderWidth: 1,
    borderColor: colors.success + '55',
  },
  // Pending request sent state
  friendButtonPending: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  friendButtonTextActive: {
    color: colors.success,
  },
  friendButtonTextPending: {
    color: colors.textSecondary,
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
