import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';

export default function ViewRunsScreen({ navigation }) {
  const fakeRuns = [
    { id: 1, location: '24 Hour Fitness - Midtown', time: '6:30 PM', players: 8 },
    { id: 2, location: 'LA Fitness - Buckhead', time: '7:15 PM', players: 10 },
    { id: 3, location: 'YMCA - West End', time: '8:00 PM', players: 5 },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Open Runs Near You</Text>
        <ScrollView contentContainerStyle={styles.scroll}>
          {fakeRuns.map((run) => (
            <TouchableOpacity
              key={run.id}
              style={styles.runCard}
              onPress={() =>
                navigation.navigate('RunDetails', {
                  location: run.location,
                  time: run.time,
                  players: run.players,
                })
              }
            >
              <Text style={styles.runLocation}>{run.location}</Text>
              <Text style={styles.runDetails}>
                🕒 {run.time}  |  🙋 {run.players} players
              </Text>
            </TouchableOpacity>
          ))}
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
