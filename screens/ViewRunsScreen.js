import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, SHADOWS, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms } from '../hooks';
import { Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';

export default function ViewRunsScreen({ navigation }) {
  const { gyms, loading, ensureGymsExist } = useGyms();
  const [refreshing, setRefreshing] = useState(false);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const onRefresh = async () => {
    setRefreshing(true);
    await ensureGymsExist();
    setRefreshing(false);
  };

  const getActivityLevel = (count) => {
    if (count === 0) return { label: 'Empty', color: colors.activityEmpty };
    if (count < 5) return { label: 'Light', color: colors.activityLight };
    if (count < 10) return { label: 'Active', color: colors.activityActive };
    return { label: 'Busy', color: colors.activityBusy };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Logo size="small" style={{ marginBottom: SPACING.sm }} />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading gyms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Find a Run</Text>
        <Text style={styles.subtitle}>See who's playing right now</Text>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {gyms.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No gyms available</Text>
              <Text style={styles.emptySubtext}>
                Pull down to refresh
              </Text>
            </View>
          ) : (
            gyms.map((gym) => {
              const count = gym.currentPresenceCount || 0;
              const activity = getActivityLevel(count);

              return (
                <TouchableOpacity
                  key={gym.id}
                  style={styles.gymCard}
                  onPress={() =>
                    navigation.navigate('RunDetails', {
                      gymId: gym.id,
                      gymName: gym.name,
                      players: count,
                    })
                  }
                >
                  <Image
                    source={
                      gym.imageUrl
                        ? { uri: gym.imageUrl }
                        : require('../assets/basketball-court.png')
                    }
                    style={styles.thumbnail}
                  />

                  <View style={styles.gymInfo}>
                    <View style={styles.gymRow}>
                      <Text style={styles.gymName} numberOfLines={1}>{gym.name}</Text>
                      <View style={[styles.activityBadge, { backgroundColor: activity.color }]}>
                        <Text style={styles.activityText}>{activity.label}</Text>
                      </View>
                    </View>

                    <View style={styles.gymRow}>
                      <Text style={styles.runType}>
                        {gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}{' '}
                        <Text style={styles.runTypeAccent}>OPEN RUN</Text>
                      </Text>
                      <Text style={styles.playerCount}>
                        {count}/15
                      </Text>
                    </View>

                    <View style={styles.addressRow}>
                      <Text style={styles.gymAddress} numberOfLines={1}>{gym.address}</Text>
                      {gym.location && (
                        <TouchableOpacity
                          onPress={() => openDirections(gym.location, gym.name)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
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
    padding: SPACING.md,
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
  title: {
    fontSize: FONT_SIZES.h1,  // Design system: 32px
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginBottom: SPACING.xxs,  // 4px
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,  // 16px
    color: colors.textSecondary,
    marginBottom: SPACING.lg,  // 24px (more breathing room)
  },
  scroll: {
    paddingBottom: SPACING.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg * 2,
  },
  emptyText: {
    fontSize: FONT_SIZES.subtitle,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    marginTop: SPACING.sm,
  },
  gymCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: 12,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    ...(isDark && SHADOWS.lg),
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    marginRight: SPACING.md,
  },
  gymInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  gymRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  gymName: {
    fontSize: FONT_SIZES.h3,  // Design system: 18px (card headers)
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
    flex: 1,
    marginRight: SPACING.xs,
    letterSpacing: 0.3,
  },
  activityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  activityText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runType: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  runTypeAccent: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  playerCount: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gymAddress: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    flex: 1,
  },
});
