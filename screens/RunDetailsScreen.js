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
import { FONT_SIZES, SPACING, SHADOWS, SKILL_LEVEL_COLORS } from '../constants/theme';

const courtImage = require('../assets/basketball-court.jpg');
import { useTheme } from '../contexts';
import { useGym, useGymPresences, useGymSchedules } from '../hooks';

export default function RunDetailsScreen({ route, navigation }) {
  const { gymId, gymName } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const { gym, loading: gymLoading } = useGym(gymId);
  const { presences, loading: presencesLoading } = useGymPresences(gymId);
  const { schedules, schedulesBySlot, loading: schedulesLoading } = useGymSchedules(gymId);

  const loading = gymLoading || presencesLoading || schedulesLoading;

  // Live timer: tick every 60s to re-render durations
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (presences.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [presences.length]);

  // Pulse animation for active player indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const playerCount = gym?.currentPresenceCount || 0;

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

  const getHereDuration = (timestamp) => {
    if (!timestamp) return '';
    const checkedInAt = timestamp.toDate();
    const minutes = Math.round((new Date() - checkedInAt) / 60000);
    if (minutes < 1) return 'Here for <1m';
    if (minutes < 60) return `Here for ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `Here for ${hours}h ${mins}m` : `Here for ${hours}h`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container}>
        <Image source={courtImage} style={styles.heroImage} resizeMode="cover" />
        <View style={styles.header}>
          <Text style={styles.gymName}>{gym?.name || gymName}</Text>
          <Text style={styles.gymAddress}>{gym?.address}</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Who's Here Now</Text>

          {presences.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No one here yet</Text>
              <Text style={styles.emptySubtext}>
                Be the first to check in!
              </Text>
            </View>
          ) : (
            presences.map((presence) => (
              <View key={presence.id} style={styles.playerCard}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerInitial}>
                    {(presence.userName || 'A').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.playerName}>
                      {presence.userName || 'Anonymous'}
                    </Text>
                    {presence.skillLevel && (
                      <View style={[
                        styles.skillBadge,
                        { backgroundColor: (SKILL_LEVEL_COLORS[presence.skillLevel] || SKILL_LEVEL_COLORS.Beginner).bg },
                      ]}>
                        <Text style={[
                          styles.skillBadgeText,
                          { color: (SKILL_LEVEL_COLORS[presence.skillLevel] || SKILL_LEVEL_COLORS.Beginner).text },
                        ]}>
                          {presence.skillLevel}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.playerTime}>
                    {getHereDuration(presence.checkedInAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {schedules.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coming Soon</Text>
            {Object.keys(schedulesBySlot)
              .sort()
              .slice(0, 3)
              .map((slot) => {
                const slotSchedules = schedulesBySlot[slot];
                const time = new Date(slot);
                const now = new Date();
                const isToday = time.toDateString() === now.toDateString();
                const timeStr = time.toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                const label = isToday ? `Today ${timeStr}` : `Tomorrow ${timeStr}`;

                return (
                  <View key={slot} style={styles.intentSlot}>
                    <Text style={styles.intentTime}>{label}</Text>
                    <Text style={styles.intentCount}>
                      {slotSchedules.length} {slotSchedules.length === 1 ? 'player' : 'players'} planning to come
                    </Text>
                  </View>
                );
              })}
          </View>
        )}

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

const getStyles = (colors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  heroImage: {
    width: '100%',
    height: 200,
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
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
  },
  gymAddress: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
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
    borderRadius: 12,
    padding: SPACING.lg,
    ...SHADOWS.card,
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
    fontWeight: '600',
    color: colors.success,
    marginTop: 4,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
  },
  section: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: SPACING.md,
  },
  emptyState: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.subtle,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  playerInitial: {
    color: '#fff',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: SPACING.xs,
  },
  skillBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  playerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playerTime: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  intentSlot: {
    backgroundColor: colors.scheduleBackground,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  intentTime: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: colors.scheduleText,
  },
  intentCount: {
    fontSize: FONT_SIZES.small,
    color: colors.scheduleTextBright,
    marginTop: 2,
  },
  checkInButton: {
    backgroundColor: colors.primary,
    marginHorizontal: SPACING.lg,
    borderRadius: 10,
    padding: SPACING.md,
    alignItems: 'center',
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  planButton: {
    backgroundColor: colors.secondary,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: 10,
    padding: SPACING.md,
    alignItems: 'center',
  },
  planButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  bottomPadding: {
    height: SPACING.lg * 2,
  },
});
