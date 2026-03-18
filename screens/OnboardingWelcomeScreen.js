/**
 * OnboardingWelcomeScreen.js — Step 1 of first-time onboarding
 *
 * Simple branded welcome screen with headline and CTA.
 * Navigates to OnboardingHomeCourt on continue.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { FONT_SIZES, SPACING, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button } from '../components';

export default function OnboardingWelcomeScreen({ navigation }) {
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
        <Logo size="large" style={{ marginBottom: SPACING.lg }} />

        <Text style={styles.headline}>Find runs.{'\n'}Show up.{'\n'}Hoop.</Text>
        <Text style={styles.subtext}>
          See who's playing, check in to your gym, and never miss a good run again.
        </Text>

        <View style={styles.buttonArea}>
          <Button
            title="Let's Go"
            variant="primary"
            size="lg"
            onPress={() => navigation.replace('OnboardingHomeCourt')}
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
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  headline: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: SPACING.md,
  },
  subtext: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  buttonArea: {
    width: '100%',
  },
});
