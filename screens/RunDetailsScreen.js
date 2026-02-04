import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { COLORS, FONT_SIZES, SPACING, SHADOWS } from '../constants/theme';
import { useGym, useGymPresences, useGymSchedules } from '../hooks';

export default function RunDetailsScreen({ route, navigation }) {
  const { gymId, gymName } = route.params;

  const { gym, loading: gymLoading } = useGym(gymId);
  const { presences, loading: presencesLoading } = useGymPresences(gymId);
  const { schedules, schedulesBySlot, loading: schedulesLoading } = useGymSchedules(gymId);

  const loading = gymLoading || presencesLoading || schedulesLoading;

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const checkedInAt = timestamp.toDate();
    const minutes = Math.round((new Date() - checkedInAt) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const playerCount = gym?.currentPresenceCount || 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.gymName}>{gym?.name || gymName}</Text>
          <Text style={styles.gymAddress}>{gym?.address}</Text>
        </View>

        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{playerCount}</Text>
            <Text style={styles.statLabel}>
              {playerCount === 1 ? 'Player' : 'Players'} Here
            </Text>
          </View>
        </View>

        {/* Players List */}
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
                  <Text style={styles.playerName}>
                    {presence.userName || 'Anonymous'}
                  </Text>
                  <Text style={styles.playerTime}>
                    Checked in {getTimeAgo(presence.checkedInAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Upcoming Visitors */}
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

        {/* Action Buttons */}
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.body,
    color: COLORS.textSecondary,
  },
  header: {
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  gymName: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  gymAddress: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textSecondary,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    margin: SPACING.lg,
    borderRadius: 12,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  section: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  emptyState: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.subtle,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
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
  playerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  playerTime: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  intentSlot: {
    backgroundColor: COLORS.scheduleBackground,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  intentTime: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: COLORS.scheduleText,
  },
  intentCount: {
    fontSize: FONT_SIZES.small,
    color: COLORS.scheduleTextBright,
    marginTop: 2,
  },
  checkInButton: {
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.secondary,
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
