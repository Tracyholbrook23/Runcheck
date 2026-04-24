/**
 * OnboardingRegionScreen.js — Service Area Notice (Onboarding Step 1 of 4)
 *
 * Shown once, right before the Welcome screen, to set expectations about
 * RunCheck's current geographic focus. Explains that the app is currently
 * active in Austin, TX and Lansing, MI, will expand, and that players can
 * request any gym to be added at any time.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button } from '../components';

const BULLETS = [
  {
    icon: 'location',
    iconColor: '#F97316',
    text: 'RunCheck is currently active in Austin, TX and Lansing, MI — with more cities coming soon.',
  },
  {
    icon: 'basketball',
    iconColor: '#F97316',
    text: "Gyms outside the area may not be listed yet — we're adding new courts as we grow.",
  },
  {
    icon: 'add-circle',
    iconColor: '#22C55E',
    text: "Don't see your gym? You can request it to be added right from the app anytime.",
  },
  {
    icon: 'globe-outline',
    iconColor: '#60A5FA',
    text: 'We plan to expand across Texas and other regions of the country in 2027.',
  },
];

export default function OnboardingRegionScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        <Logo size="medium" style={{ marginBottom: SPACING.lg }} />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={28} color="#F97316" />
          </View>
          <Text style={styles.headline}>Where We Play Right Now</Text>
        </View>

        <Text style={styles.subtext}>
          Before you jump in, here's a quick heads-up about where RunCheck is currently active.
        </Text>

        {/* Bullet list */}
        <View style={styles.card}>
          {BULLETS.map((b, i) => (
            <View key={i} style={[styles.bulletRow, i < BULLETS.length - 1 && styles.bulletDivider]}>
              <View style={[styles.bulletIcon, { backgroundColor: b.iconColor + '22' }]}>
                <Ionicons name={b.icon} size={18} color={b.iconColor} />
              </View>
              <Text style={styles.bulletText}>{b.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonArea}>
          <Button
            title="Got It — Let's Go"
            variant="primary"
            size="lg"
            onPress={() => navigation.replace('OnboardingWelcome')}
          />
        </View>
      </View>
    </ImageBackground>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  bgImage: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  headerRow: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(249,115,22,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  headline: {
    fontSize: FONT_SIZES.h2 ?? 22,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtext: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    width: '100%',
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bulletDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  bulletIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 20,
  },
  buttonArea: {
    width: '100%',
  },
});
