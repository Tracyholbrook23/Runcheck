import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';
import { subscribeToGyms, seedGyms, getAllGyms } from '../services/gymService';

export default function ViewRunsScreen({ navigation }) {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let unsubscribe;

    const initializeGyms = async () => {
      try {
        // Check if gyms exist, seed if not
        const existingGyms = await getAllGyms();
        if (existingGyms.length === 0) {
          await seedGyms();
        }

        // Subscribe to real-time updates
        unsubscribe = subscribeToGyms((gymsData) => {
          setGyms(gymsData);
          setLoading(false);
          setRefreshing(false);
        });
      } catch (error) {
        console.error('Error initializing gyms:', error);
        setLoading(false);
        setRefreshing(false);
      }
    };

    initializeGyms();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    // The subscription will update automatically
  };

  const getActivityLevel = (count) => {
    if (count === 0) return { label: 'Empty', color: '#9e9e9e' };
    if (count < 5) return { label: 'Light', color: '#4caf50' };
    if (count < 10) return { label: 'Active', color: '#ff9800' };
    return { label: 'Busy', color: '#f44336' };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
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
                  <View style={styles.gymHeader}>
                    <Text style={styles.gymName}>{gym.name}</Text>
                    <View style={[styles.activityBadge, { backgroundColor: activity.color }]}>
                      <Text style={styles.activityText}>{activity.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.gymAddress}>{gym.address}</Text>

                  <View style={styles.gymFooter}>
                    <Text style={styles.playerCount}>
                      {count === 0
                        ? 'No one here yet'
                        : count === 1
                        ? '1 player here now'
                        : `${count} players here now`}
                    </Text>
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: SPACING.lg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.body,
    color: COLORS.textDark,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: COLORS.textDark,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: SPACING.lg,
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
    color: COLORS.textDark,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textLight,
    marginTop: SPACING.sm,
  },
  gymCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  gymHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  gymName: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: COLORS.textDark,
    flex: 1,
  },
  activityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activityText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: '600',
  },
  gymAddress: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
  },
  gymFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerCount: {
    fontSize: FONT_SIZES.body,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
