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
import { useGym, useGymPresences, useGymSchedules } from '../hooks';

/**
 * Check if a date is today
 * @param {Date} date
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
 * Check if a date is tomorrow
 * @param {Date} date
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

export default function RunDetailsScreen({ route, navigation }) {
  const { gymId, gymName, imageUrl: paramImageUrl, plannedToday: paramPlannedToday, plannedTomorrow: paramPlannedTomorrow, players: paramPlayers } = route.params;
  const { colors, isDark, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const { gym, loading: gymLoading } = useGym(gymId);
  const { presences, loading: presencesLoading } = useGymPresences(gymId);
  const { schedules, loading: schedulesLoading } = useGymSchedules(gymId);

  const loading = gymLoading || presencesLoading || schedulesLoading;

  // Filter schedules into today and tomorrow
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

  // Live timer: tick every 60s to re-render durations
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (presences.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [presences.length]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Pulse animation for active player indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const playerCount = gym?.currentPresenceCount ?? paramPlayers ?? 0;
  const todayCount = todaySchedules.length || paramPlannedToday || 0;
  const tomorrowCount = tomorrowSchedules.length || paramPlannedTomorrow || 0;

  const fakeReviews = [
    { id: 'r1', name: 'Big Ray',    avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',   rating: 5, comment: 'Best run in the city. Good competition, everybody plays the right way. Been coming here for years.', date: '2 days ago',  skillLevel: 'Pro' },
    { id: 'r2', name: 'Aaliyah S.', avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg', rating: 4, comment: 'Good spot. Gets packed on weekends but the courts are clean and well-lit at night.', date: '5 days ago',  skillLevel: 'Advanced' },
    { id: 'r3', name: 'Coach D',    avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg',   rating: 5, comment: 'Community is welcoming to all skill levels. Perfect for beginners wanting to improve.', date: '1 week ago', skillLevel: 'Pro' },
    { id: 'r4', name: 'Lil TJ',     avatarUrl: 'https://randomuser.me/api/portraits/men/4.jpg',    rating: 4, comment: 'Rims are a little tight but the competition is real. Usually run 5v5 full court here.', date: '2 weeks ago', skillLevel: 'Beginner' },
    { id: 'r5', name: 'Marcus W.',  avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',   rating: 5, comment: 'Always a good run. Respectful players, no ball hogs. Great for evening games after work.', date: '3 weeks ago', skillLevel: 'Advanced' },
  ];

  const fakePlayers = [
    { id: 'fp1', name: 'Big Ray',      skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',   minutesAgo: 8  },
    { id: 'fp2', name: 'Marcus W.',    skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',   minutesAgo: 15 },
    { id: 'fp3', name: 'Lil TJ',       skillLevel: 'Beginner',     avatarUrl: 'https://randomuser.me/api/portraits/men/4.jpg',    minutesAgo: 22 },
    { id: 'fp4', name: 'Aaliyah S.',   skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg', minutesAgo: 31 },
    { id: 'fp5', name: 'Coach D',      skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg',   minutesAgo: 40 },
    { id: 'fp6', name: 'Jordan T.',    skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/men/44.jpg',   minutesAgo: 52 },
    { id: 'fp7', name: 'Lil Kev',      skillLevel: 'Intermediate', avatarUrl: 'https://randomuser.me/api/portraits/men/7.jpg',    minutesAgo: 58 },
    { id: 'fp8', name: 'Keisha L.',    skillLevel: 'Intermediate', avatarUrl: 'https://randomuser.me/api/portraits/women/45.jpg', minutesAgo: 67 },
    { id: 'fp9', name: 'O.G. Andre',   skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/91.jpg',   minutesAgo: 75 },
    { id: 'fp10', name: 'DeShawn R.',  skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/men/67.jpg',   minutesAgo: 82 },
  ];

  const fakeScheduledToday = [
    { id: 'st1', name: 'Young Buck',   skillLevel: 'Intermediate', avatarUrl: 'https://randomuser.me/api/portraits/men/10.jpg',   time: '6:00 PM' },
    { id: 'st2', name: 'Brianna C.',   skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/women/14.jpg', time: '6:30 PM' },
    { id: 'st3', name: 'Mr. Williams', skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/80.jpg',   time: '7:00 PM' },
    { id: 'st4', name: 'Devon W.',     skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/men/36.jpg',   time: '7:00 PM' },
    { id: 'st5', name: 'Simone R.',    skillLevel: 'Intermediate', avatarUrl: 'https://randomuser.me/api/portraits/women/33.jpg', time: '7:30 PM' },
  ];

  const fakeScheduledTomorrow = [
    { id: 'sm1', name: 'Isaiah T.',    skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/17.jpg',   time: '5:30 PM' },
    { id: 'sm2', name: 'Kayla N.',     skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/women/52.jpg', time: '6:00 PM' },
    { id: 'sm3', name: 'Lil Chris',    skillLevel: 'Beginner',     avatarUrl: 'https://randomuser.me/api/portraits/men/8.jpg',    time: '6:00 PM' },
    { id: 'sm4', name: 'Trina D.',     skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/women/61.jpg', time: '6:30 PM' },
    { id: 'sm5', name: 'Pop',          skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/88.jpg',   time: '6:30 PM' },
    { id: 'sm6', name: 'Nadia P.',     skillLevel: 'Intermediate', avatarUrl: 'https://randomuser.me/api/portraits/women/19.jpg', time: '7:00 PM' },
    { id: 'sm7', name: 'Elijah F.',    skillLevel: 'Advanced',     avatarUrl: 'https://randomuser.me/api/portraits/men/29.jpg',   time: '7:00 PM' },
    { id: 'sm8', name: 'Rasheed V.',   skillLevel: 'Pro',          avatarUrl: 'https://randomuser.me/api/portraits/men/48.jpg',   time: '7:30 PM' },
  ];

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
        <View style={styles.header}>
          <Text style={styles.gymName}>{gym?.name || gymName}</Text>
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

        <View style={styles.statsCard}>
          {/* Live now */}
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              {playerCount > 0 && (
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

          {/* Planning today */}
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{todayCount}</Text>
            <Text style={styles.statLabel}>Planning{'\n'}Today</Text>
          </View>

          <View style={styles.statDivider} />

          {/* Planning tomorrow */}
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{tomorrowCount}</Text>
            <Text style={styles.statLabel}>Planning{'\n'}Tomorrow</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Playing</Text>
          {presences.length > 0 ? (
            <PresenceList items={presences} type="presence" />
          ) : playerCount > 0 ? (
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

        {/* Reviews Preview */}
        <View style={styles.section}>
          <View style={styles.reviewsHeaderRow}>
            <Text style={styles.sectionTitle}>Player Reviews</Text>
            <TouchableOpacity onPress={() => navigation.navigate('GymReviews', { gymId, gymName: gym?.name || gymName, reviews: fakeReviews })}>
              <Text style={styles.seeAllLink}>See All ({fakeReviews.length})</Text>
            </TouchableOpacity>
          </View>

          {/* Rating summary */}
          <View style={styles.ratingSummary}>
            <Text style={styles.ratingBig}>4.7</Text>
            <View style={styles.ratingDetails}>
              <View style={styles.starsRow}>
                {[1,2,3,4,5].map(i => (
                  <Ionicons key={i} name={i <= 4 ? 'star' : 'star-half'} size={16} color="#F97316" />
                ))}
              </View>
              <Text style={styles.ratingCount}>Based on {fakeReviews.length} reviews</Text>
            </View>
          </View>

          {/* Preview 2 reviews */}
          {fakeReviews.slice(0, 2).map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Image source={{ uri: review.avatarUrl }} style={styles.reviewAvatar} />
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewerName}>{review.name}</Text>
                  <View style={styles.reviewStarsRow}>
                    {[1,2,3,4,5].map(i => (
                      <Ionicons key={i} name={i <= review.rating ? 'star' : 'star-outline'} size={12} color="#F97316" />
                    ))}
                    <Text style={styles.reviewDate}> · {review.date}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.reviewComment}>{review.comment}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={() => navigation.navigate('GymReviews', { gymId, gymName: gym?.name || gymName, reviews: fakeReviews })}
          >
            <Text style={styles.seeAllButtonText}>See All {fakeReviews.length} Reviews</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.checkInButton}
          onPress={() => navigation.getParent()?.navigate('CheckIn')}
        >
          <Text style={styles.checkInButtonText}>Check In Here</Text>
        </TouchableOpacity>

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
  gymName: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
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

  // Reviews
  reviewsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  seeAllLink: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
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
