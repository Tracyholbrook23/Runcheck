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
  const fakeGyms = [
  {
    id: 'fake1',
    name: 'Pan American Recreation Center',
    type: 'indoor',
    address: '2100 E 3rd St, Austin, TX 78702',
    currentPresenceCount: 10,
    plannedToday: 5,
    plannedTomorrow: 8,
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlugK3VDdlosE9o97HH-NdRI89Eww_GHZaHQ&s',
  },
  {
    id: 'fake2',
    name: "Life Time Austin North",
    type: 'indoor',
    address: '13725 Ranch Rd 620 N, Austin, TX 78717',
    currentPresenceCount: 9,
    plannedToday: 7,
    plannedTomorrow: 12,
    imageUrl: 'https://media.lifetime.life/is/image/lifetimeinc/fso-gymnasium-01-1?crop=362,224,1360,1088&id=1701881564012&fit=crop,1&wid=390',
  },
  {
    id: 'fake3',
    name: "Gold's Gym Hester's Crossing",
    type: 'indoor',
    address: '2400 S I-35 Frontage Rd, Round Rock, TX 78681',
    currentPresenceCount: 12,
    plannedToday: 3,
    plannedTomorrow: 6,
    imageUrl: 'https://res.cloudinary.com/ggus-dev/image/private/s--HzKSnHnn--/c_auto%2Cg_center%2Cw_1200%2Ch_800/v1/25fcf1e9/austin-hesters-crossing-basketball.webp?_a=BAAAV6DQ',
  },
  {
    id: 'fake4',
    name: 'Clay Madsen Recreation Center',
    type: 'indoor',
    address: '1600 Gattis School Rd, Round Rock, TX 78664',
    currentPresenceCount: 5,
    plannedToday: 4,
    plannedTomorrow: 9,
    imageUrl: 'https://s3-media0.fl.yelpcdn.com/bphoto/R1OXLFLx0N6gUT2rNfqLoA/348s.jpg',
  },
];

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
        <View style={styles.titleRow}>
  <View>
    <Text style={styles.title}>Find a Run</Text>
    <Text style={styles.subtitle}>See who's playing right now</Text>
  </View>
  <TouchableOpacity onPress={() => navigation.navigate('GymMap')}>
    <Ionicons name="map-outline" size={24} color={colors.textPrimary} />
  </TouchableOpacity>
</View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {fakeGyms.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No gyms available</Text>
              <Text style={styles.emptySubtext}>
                Pull down to refresh
              </Text>
            </View>
          ) : (
            fakeGyms.map((gym) => {
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
                      imageUrl: gym.imageUrl,
                      plannedToday: gym.plannedToday || 0,
                      plannedTomorrow: gym.plannedTomorrow || 0,
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
                      <Text style={styles.gymName} numberOfLines={2}>{gym.name}</Text>
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
                    {gym.plannedTomorrow > 0 && (
                      <View style={styles.plannedRow}>
                        <Ionicons name="calendar-outline" size={11} color={colors.primary} />
                        <Text style={styles.plannedText}>
                          {gym.plannedTomorrow} planning tomorrow
                        </Text>
                      </View>
                    )}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
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
  marginBottom: 12,
  overflow: 'hidden',
  ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  ...(isDark && SHADOWS.lg),
},
  thumbnail: {
  width: 100,
  height: 100,
  borderRadius: 0,
},
 gymInfo: {
  flex: 1,
  justifyContent: 'center',
  padding: SPACING.md,
},
  gymRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  gymName: {
  fontSize: FONT_SIZES.h3,
  fontWeight: FONT_WEIGHTS.semibold,
  color: colors.textPrimary,
  marginRight: SPACING.xs,
  letterSpacing: 0.3,
  flexShrink: 1,
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
  plannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  plannedText: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
