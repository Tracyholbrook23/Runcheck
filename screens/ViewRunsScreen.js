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
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useTheme } from '../contexts';
import { useGyms } from '../hooks';
import { Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';

export default function ViewRunsScreen({ navigation }) {
  const { gyms, loading, ensureGymsExist } = useGyms();
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

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
                    source={require('../assets/basketball-court.png')}
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

const getStyles = (colors) => StyleSheet.create({
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
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginBottom: SPACING.md,
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
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    marginTop: SPACING.sm,
  },
  gymCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: SPACING.sm,
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
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: SPACING.xs,
  },
  activityBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activityText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  runType: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  runTypeAccent: {
    color: colors.primary,
    fontWeight: '600',
  },
  playerCount: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: '500',
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
