/**
 * RunDetailsScreen.js — Individual Gym Detail View
 *
 * Shows a comprehensive breakdown of a single gym: live player count,
 * today/tomorrow scheduled visit counts, player lists, reviews preview,
 * and action buttons to check in or plan a visit.
 *
 * Data sources:
 *   - `useGym(gymId)`           — live gym document (name, address, type, notes)
 *   - `useGymPresences(gymId)`  — real-time "Now Playing" list
 *   - `useGymSchedules(gymId)`  — real-time scheduled visits, filtered by date
 *
 * When Firestore data is available it takes priority; placeholder arrays
 * (`fakePlayers`, `fakeScheduledToday`, etc.) are sliced to fill in the
 * count if real data hasn't loaded yet, giving the screen a populated feel.
 *
 * Animations:
 *   - Pulsing live indicator dot on the "Players Here" stat — a looping
 *     opacity animation (1 ↔ 0.3) starts when playerCount > 0 and stops
 *     when the gym becomes empty.
 *   - A 60-second interval timer forces re-renders so "X minutes ago"
 *     timestamps stay fresh while the screen is open.
 *
 * Navigation:
 *   - Receives `gymId`, `gymName`, `imageUrl`, `plannedToday`,
 *     `plannedTomorrow`, and `players` as route params.
 *   - Falls back to param values if Firestore data hasn't arrived yet.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { PresenceList, Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';

const courtImage = require('../assets/basketball-court.png');
import { useTheme } from '../contexts';
import { useGym, useGymPresences, useGymSchedules, useProfile } from '../hooks';
import { auth, db } from '../config/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { handleFollowPoints } from '../services/pointsService';

/**
 * isToday — Checks whether a given Date falls on the current calendar day.
 *
 * @param {Date} date — The date to check.
 * @returns {boolean}
 */
const isToday = (date) => {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

/**
 * isTomorrow — Checks whether a given Date falls on the next calendar day.
 *
 * @param {Date} date — The date to check.
 * @returns {boolean}
 */
const isTomorrow = (date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
};

/**
 * RunDetailsScreen — Full gym detail screen.
 *
 * @param {object} props
 * @param {object} props.route — React Navigation route object carrying gym params.
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function RunDetailsScreen({ route, navigation }) {
  const { gymId, gymName, imageUrl: paramImageUrl, plannedToday: paramPlannedToday, plannedTomorrow: paramPlannedTomorrow, players: paramPlayers } = route.params;
  const { colors, isDark, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Subscribe to live Firestore data for this gym
  const { gym, loading: gymLoading } = useGym(gymId);
  const { presences, loading: presencesLoading } = useGymPresences(gymId);
  const { schedules, loading: schedulesLoading } = useGymSchedules(gymId);

  // Live user profile — provides followedGyms so the button reflects current state
  const { followedGyms } = useProfile();
  const isFollowed = followedGyms.includes(gymId);
  const [followLoading, setFollowLoading] = useState(false);

  /**
   * toggleFollow — Adds or removes this gym from the user's `followedGyms` array
   * in Firestore using arrayUnion / arrayRemove so the update is atomic.
   *
   * The button optimistically shows the new state immediately via the live
   * useProfile subscription — no extra local state needed.
   */
  const toggleFollow = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setFollowLoading(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        followedGyms: isFollowed ? arrayRemove(gymId) : arrayUnion(gymId),
      });
      // Award or deduct points based on new follow state (exploit-safe)
      handleFollowPoints(uid, gymId, !isFollowed);
    } catch (err) {
      console.error('toggleFollow error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const loading = gymLoading || presencesLoading || schedulesLoading;

  // Split the flat schedules array into today's and tomorrow's lists.
  // useMemo ensures this only recalculates when the schedules array changes.
  const { todaySchedules, tomorrowSchedules } = useMemo(() => {
    const today = [];
    const tomorrow = [];

    schedules.forEach((schedule) => {
      const scheduledTime = schedule.scheduledTime?.toDate();
      if (!scheduledTime) return;

      if (isToday(scheduledTime)) {
        today.push(schedule);
      } else if (isTomorrow(scheduledTime)) {
        tomorrow.push(schedule);
      }
    });

    return { todaySchedules: today, tomorrowSchedules: tomorrow };
  }, [schedules]);

  // Tick counter forces a re-render every 60 seconds so "X minutes ago"
  // timestamps on presence cards stay current without a full data refetch.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (presences.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [presences.length]);

  // Hide the default navigation header — this screen uses a custom hero image header
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Animated value for the pulsing live indicator dot next to the player count
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Prefer live Firestore counts; fall back to route params for instant display
  const playerCount = gym?.currentPresenceCount ?? paramPlayers ?? 0;
  const todayCount = todaySchedules.length || paramPlannedToday || 0;
  const tomorrowCount = tomorrowSchedules.length || paramPlannedTomorrow || 0;

  // Placeholder player data — displayed when Firestore data is empty
  const fakePlayers = [
    { id: 'fp1', name: 'Big Ray',      skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',   minutesAgo: 8  },
    { id: 'fp2', name: 'Marcus W.',    skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',   minutesAgo: 15 },
    { id: 'fp3', name: 'Lil TJ',       skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/4.jpg',    minutesAgo: 22 },
    { id: 'fp4', name: 'Aaliyah S.',   skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg', minutesAgo: 31 },
    { id: 'fp5', name: 'Coach D',      skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg',   minutesAgo: 40 },
    { id: 'fp6', name: 'Jordan T.',    skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/44.jpg',   minutesAgo: 52 },
    { id: 'fp7', name: 'Lil Kev',      skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/7.jpg',    minutesAgo: 58 },
    { id: 'fp8', name: 'Keisha L.',    skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/45.jpg', minutesAgo: 67 },
    { id: 'fp9', name: 'O.G. Andre',   skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/91.jpg',   minutesAgo: 75 },
    { id: 'fp10', name: 'DeShawn R.',  skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/men/67.jpg',   minutesAgo: 82 },
  ];

  const fakeScheduledToday = [
    { id: 'st1', name: 'Young Buck',   skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/10.jpg',   time: '6:00 PM' },
    { id: 'st2', name: 'Brianna C.',   skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/women/14.jpg', time: '6:30 PM' },
    { id: 'st3', name: 'Mr. Williams', skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/80.jpg',   time: '7:00 PM' },
    { id: 'st4', name: 'Devon W.',     skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/men/36.jpg',   time: '7:00 PM' },
    { id: 'st5', name: 'Simone R.',    skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/women/33.jpg', time: '7:30 PM' },
  ];

  const fakeScheduledTomorrow = [
    { id: 'sm1', name: 'Isaiah T.',    skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/17.jpg',   time: '5:30 PM' },
    { id: 'sm2', name: 'Kayla N.',     skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/52.jpg', time: '6:00 PM' },
    { id: 'sm3', name: 'Lil Chris',    skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/8.jpg',    time: '6:00 PM' },
    { id: 'sm4', name: 'Trina D.',     skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/women/61.jpg', time: '6:30 PM' },
    { id: 'sm5', name: 'Pop',          skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/88.jpg',   time: '6:30 PM' },
    { id: 'sm6', name: 'Nadia P.',     skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/19.jpg', time: '7:00 PM' },
    { id: 'sm7', name: 'Elijah F.',    skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/men/29.jpg',   time: '7:00 PM' },
    { id: 'sm8', name: 'Rasheed V.',   skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/48.jpg',   time: '7:30 PM' },
  ];

  // Start or stop the pulse animation based on whether anyone is currently checked in.
  // Uses Animated.loop + Animated.sequence for a smooth, continuous opacity breath effect.
  useEffect(() => {
    if (playerCount > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      // Reset to full opacity when the gym is empty
      pulseAnim.setValue(1);
    }
  }, [playerCount]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Logo size="small" style={{ marginBottom: SPACING.sm }} />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container}>
        {/* Hero image header with an absolute-positioned back button */}
        <View style={styles.heroContainer}>
          <Image
            source={(gym?.imageUrl || paramImageUrl) ? { uri: gym?.imageUrl || paramImageUrl } : courtImage}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Gym name, address, directions button, and type badge */}
        <View style={styles.header}>
          {/* Gym name row — name on the left, Follow button on the right */}
          <View style={styles.gymNameRow}>
            <Text style={[styles.gymName, { flex: 1 }]}>{gym?.name || gymName}</Text>
            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowed && styles.followButtonActive,
              ]}
              onPress={toggleFollow}
              disabled={followLoading}
            >
              <Ionicons
                name={isFollowed ? 'heart' : 'heart-outline'}
                size={16}
                color={isFollowed ? '#EF4444' : colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.followButtonText,
                  isFollowed && styles.followButtonTextActive,
                ]}
              >
                {isFollowed ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Access type badge — shown immediately below the name */}
          {gym?.accessType && (
            <View style={[styles.accessBadge, { backgroundColor: gym.accessType === 'free' ? '#22C55E' : '#F59E0B' }]}>
              <Text style={styles.accessBadgeText}>
                {gym.accessType === 'free' ? 'Free' : 'Membership / Day Pass'}
              </Text>
            </View>
          )}
          <Text style={styles.gymAddress}>{gym?.address}</Text>
          {gym?.location && (
            <TouchableOpacity
              style={styles.directionsButton}
              onPress={() => openDirections(gym.location, gym.name)}
            >
              <Ionicons name="navigate-outline" size={16} color={colors.infoText} style={{ marginRight: 6 }} />
              <Text style={styles.directionsButtonText}>Get Directions</Text>
            </TouchableOpacity>
          )}
          {gym?.type && (
            <Text style={styles.gymType}>
              {gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}
            </Text>
          )}
          {gym?.notes ? (
            <Text style={styles.gymNotes}>{gym.notes}</Text>
          ) : null}
        </View>

        {/* Stats card — Players Here (with pulse dot), Planning Today, Planning Tomorrow */}
        <View style={styles.statsCard}>
          {/* Live now stat */}
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              {playerCount > 0 && (
                // Pulsing dot only shown when at least one player is checked in
                <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
              )}
              <Text style={styles.statNumber}>{playerCount}</Text>
            </View>
            <Text style={styles.statLabel}>
              {playerCount === 1 ? 'Player' : 'Players'} Here
            </Text>
            {playerCount > 0 && (
              <Text style={styles.gameOnLabel}>Game On</Text>
            )}
          </View>

          <View style={styles.statDivider} />

          {/* Planning today stat */}
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{todayCount}</Text>
            <Text style={styles.statLabel}>Planning{'\n'}Today</Text>
          </View>

          <View style={styles.statDivider} />

          {/* Planning tomorrow stat */}
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{tomorrowCount}</Text>
            <Text style={styles.statLabel}>Planning{'\n'}Tomorrow</Text>
          </View>
        </View>

        {/* Now Playing section — real presences first, fake data as fallback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Playing</Text>
          {presences.length > 0 ? (
            <PresenceList items={presences} type="presence" />
          ) : playerCount > 0 ? (
            // Slice placeholder players to match the reported count
            <View style={styles.playerList}>
              {fakePlayers.slice(0, playerCount).map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{player.minutesAgo}m ago</Text>
                  </View>
                  {skillColors?.[player.skillLevel] && (
                    <View style={[styles.skillBadge, { backgroundColor: skillColors[player.skillLevel].bg }]}>
                      <Text style={[styles.skillBadgeText, { color: skillColors[player.skillLevel].text }]}>
                        {player.skillLevel}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <PresenceList items={[]} type="presence" emptyMessage="No one here yet" emptySubtext="Be the first to check in!" />
          )}
        </View>

        {/* Scheduled Today — real Firestore schedules first, fake data as fallback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Today</Text>
          {todaySchedules.length > 0 ? (
            <PresenceList items={todaySchedules} type="schedule" />
          ) : todayCount > 0 ? (
            <View style={styles.playerList}>
              {fakeScheduledToday.slice(0, todayCount).map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{player.time}</Text>
                  </View>
                  {skillColors?.[player.skillLevel] && (
                    <View style={[styles.skillBadge, { backgroundColor: skillColors[player.skillLevel].bg }]}>
                      <Text style={[styles.skillBadgeText, { color: skillColors[player.skillLevel].text }]}>
                        {player.skillLevel}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <PresenceList items={[]} type="schedule" emptyMessage="No one scheduled today" />
          )}
        </View>

        {/* Scheduled Tomorrow — real Firestore schedules first, fake data as fallback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Tomorrow</Text>
          {tomorrowSchedules.length > 0 ? (
            <PresenceList items={tomorrowSchedules} type="schedule" />
          ) : tomorrowCount > 0 ? (
            <View style={styles.playerList}>
              {fakeScheduledTomorrow.slice(0, tomorrowCount).map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{player.time}</Text>
                  </View>
                  {skillColors?.[player.skillLevel] && (
                    <View style={[styles.skillBadge, { backgroundColor: skillColors[player.skillLevel].bg }]}>
                      <Text style={[styles.skillBadgeText, { color: skillColors[player.skillLevel].text }]}>
                        {player.skillLevel}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <PresenceList items={[]} type="schedule" emptyMessage="No one scheduled tomorrow" />
          )}
        </View>

        {/* Reviews — empty state until real reviews are available */}
        <View style={styles.section}>
          <View style={styles.reviewsHeaderRow}>
            <Text style={styles.sectionTitle}>Player Reviews</Text>
          </View>
          <View style={styles.reviewsEmpty}>
            <Ionicons name="star-outline" size={28} color={colors.textMuted} />
            <Text style={styles.reviewsEmptyText}>No reviews yet</Text>
            <Text style={styles.reviewsEmptySubtext}>Be the first to leave a review</Text>
          </View>
        </View>

        {/* Primary CTA — Check In Here */}
        <TouchableOpacity
          style={styles.checkInButton}
          onPress={() => navigation.getParent()?.navigate('CheckIn')}
        >
          <Text style={styles.checkInButtonText}>Check In Here</Text>
        </TouchableOpacity>

        {/* Secondary CTA — Plan a Visit */}
        <TouchableOpacity
          style={styles.planButton}
          onPress={() => navigation.getParent()?.navigate('Plan')}
        >
          <Text style={styles.planButtonText}>Plan a Visit</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for RunDetailsScreen.
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
  heroContainer: {
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: 260,
  },
  backButton: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
  header: {
    padding: SPACING.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gymNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  gymName: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginLeft: SPACING.sm,
    flexShrink: 0,
  },
  followButtonActive: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  followButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
  },
  followButtonTextActive: {
    color: '#EF4444',
  },
  accessBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.sm,
  },
  accessBadgeText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  gymAddress: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    backgroundColor: colors.infoBackground,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  directionsButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.infoText,
    letterSpacing: 0.2,
  },
  gymType: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: '500',
    marginTop: SPACING.xs,
  },
  gymNotes: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    margin: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    marginRight: SPACING.xs,
  },
  gameOnLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.success,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  statLabel: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  section: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
    marginBottom: SPACING.md,
    letterSpacing: 0.3,
  },
  checkInButton: {
    backgroundColor: colors.primary,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  planButton: {
    backgroundColor: 'transparent',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  planButtonText: {
    color: colors.primary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  bottomPadding: {
    height: SPACING.lg * 2,
  },
  playerList: {
    gap: SPACING.xs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  playerMeta: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  skillBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  skillBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Reviews section
  reviewsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  // Styles below are ready for when real reviews are wired in
  seeAllLink: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  reviewsEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  reviewsEmptyText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
  },
  reviewsEmptySubtext: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  ratingBig: {
    fontSize: 42,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.textPrimary,
  },
  ratingDetails: {
    gap: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  reviewDate: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  reviewComment: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: SPACING.xs,
  },
  seeAllButtonText: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
