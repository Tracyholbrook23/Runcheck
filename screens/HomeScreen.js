import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
} from 'react-native';
import { COLORS, FONT_SIZES, SPACING, BUTTON } from '../constants/theme';

const HomeScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Logo */}
        <View style={styles.logoWrapper}>
          <Image
            source={require('../assets/hoop-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>🏀 RunCheck</Text>
        <Text style={styles.subtitle}>Find or join a pickup run near you</Text>

        <TouchableOpacity
          style={BUTTON.base}
          onPress={() => navigation.navigate('CheckIn')}
        >
          <Text style={BUTTON.text}>Check Into a Run</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[BUTTON.base, styles.accentButton]}
          onPress={() => navigation.navigate('ViewRuns')} // ✅ Corrected screen name
        >
          <Text style={BUTTON.text}>Find Open Runs</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    marginBottom: SPACING.md,
  },
  logo: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: FONT_SIZES.title + 4,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.subtitle,
    color: COLORS.textDark,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  accentButton: {
    backgroundColor: COLORS.accent,
    marginTop: SPACING.md,
  },
  footer: {
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.border,
  },
});

export default HomeScreen;
