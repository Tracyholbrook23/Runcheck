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
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function ViewRunsScreen({ navigation }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Real-time listener for runs collection
    const runsRef = collection(db, 'runs');
    const q = query(runsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const runsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRuns(runsData);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.error('Error fetching runs:', error);
      setLoading(false);
      setRefreshing(false);
    });

    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading runs...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Open Runs Near You</Text>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {runs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active runs right now</Text>
              <Text style={styles.emptySubtext}>Be the first to check in!</Text>
            </View>
          ) : (
            runs.map((run) => (
              <TouchableOpacity
                key={run.id}
                style={styles.runCard}
                onPress={() =>
                  navigation.navigate('RunDetails', {
                    runId: run.id,
                    location: run.location,
                    time: run.time,
                    players: run.players || 0,
                  })
                }
              >
                <Text style={styles.runLocation}>{run.location}</Text>
                <Text style={styles.runDetails}>
                  🕒 {run.time}  |  🙋 {run.players || 0} players
                </Text>
              </TouchableOpacity>
            ))
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
    marginBottom: SPACING.md,
    textAlign: 'center',
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
  runCard: {
    backgroundColor: '#f1f3f6',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  runLocation: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  runDetails: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textDark,
    marginTop: 4,
  },
});
