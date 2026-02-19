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
  const { gymId, gymName, imageUrl: paramImageUrl, plannedToday: paramPlannedToday, plannedTomorrow: paramPlannedTomorrow } = route.params;
  const { colors, isDark } = useTheme();
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

  // Pulse animation for active player indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const playerCount = gym?.currentPresenceCount || 0;
  const todayCount = todaySchedules.length || paramPlannedToday || 0;
  const tomorrowCount = tomorrowSchedules.length || paramPlannedTomorrow || 0;

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
        <Image
          source={(gym?.imageUrl || paramImageUrl) ? { uri: gym?.imageUrl || paramImageUrl } : courtImage}
          style={styles.heroImage}
          resizeMode="cover"
        />
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
          <PresenceList
            items={presences}
            type="presence"
            emptyMessage="No one here yet"
            emptySubtext="Be the first to check in!"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Today</Text>
          <PresenceList
            items={todaySchedules}
            type="schedule"
            emptyMessage={todayCount > 0 ? `${todayCount} players planning to attend` : 'No one scheduled today'}
            emptySubtext={todayCount > 0 ? "Plan your visit to join them!" : undefined}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Tomorrow</Text>
          <PresenceList
            items={tomorrowSchedules}
            type="schedule"
            emptyMessage={tomorrowCount > 0 ? `${tomorrowCount} players planning to attend` : 'No one scheduled tomorrow'}
            emptySubtext={tomorrowCount > 0 ? "Plan your visit to join them!" : undefined}
          />
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
});
