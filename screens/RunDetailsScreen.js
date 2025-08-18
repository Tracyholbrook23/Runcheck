import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';

export default function RunDetailsScreen({ route }) {
  const { location, time, players } = route.params;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{location}</Text>
        <Text style={styles.info}>🕒 Time: {time}</Text>
        <Text style={styles.info}>🙋 Players: {players}</Text>
        <Text style={styles.note}>More details and RSVP features coming soon!</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  info: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textDark,
    marginBottom: SPACING.sm,
  },
  note: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textLight,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
});
