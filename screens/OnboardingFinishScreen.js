/**
 * OnboardingFinishScreen.js — Step 3 of first-time onboarding
 *
 * Requests location permission with a clear explanation, then shows
 * a "You're all set" state. Saves `onboardingCompleted: true` on the
 * user profile and sends the user to the Runs tab to find a game.
 *
 * If location is denied, the user can still continue — location is
 * requested again at check-in time when it's actually needed.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button } from '../components';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function OnboardingFinishScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [locationDone, setLocationDone] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * handleEnableLocation — Requests foreground location permission.
   * Whether granted or denied, advances to the "all set" state.
   */
  const handleEnableLocation = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch (err) {
      if (__DEV__) console.warn('[Onboarding] Location request error:', err);
    }
    setLocationDone(true);
  };

  /**
   * handleFinish — Saves the onboarding flag and navigates to the Runs tab.
   */
  const handleFinish = async () => {
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await updateDoc(doc(db, 'users', uid), { onboardingCompleted: true });
      }
    } catch (err) {
      if (__DEV__) console.warn('[Onboarding] Failed to save flag:', err);
      // Non-fatal — continue. The useAuth snapshot will pick it up anyway
      // once it's eventually written, and worst case the user sees onboarding
      // again next launch (harmless).
    }
    setSaving(false);

    // Navigate into the main app, landing on the Runs tab
    navigation.replace('Main', { screen: 'Runs' });
  };

  // ── "All set" state — shown after location step ──
  if (locationDone) {
    return (
      <ImageBackground
        source={require('../assets/images/court-bg.jpg')}
        style={styles.bgImage}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        <View style={styles.container}>
          <Ionicons name="checkmark-circle" size={64} color="#22C55E" style={{ marginBottom: SPACING.md }} />
          <Text style={styles.headline}>You're All Set</Text>
          <Text style={styles.subtext}>
            Find a gym, jump into a run, and start hooping.
          </Text>
          <View style={styles.buttonArea}>
            <Button
              title="Find a Run"
              variant="primary"
              size="lg"
              onPress={handleFinish}
              loading={saving}
            />
          </View>
        </View>
      </ImageBackground>
    );
  }

  // ── Location permission request state ──
  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="location" size={36} color="#F97316" />
        </View>

        <Text style={styles.headline}>Enable Location</Text>
        <Text style={styles.subtext}>
          RunCheck uses your location to show runs near you and verify check-ins at gyms.
        </Text>

        <View style={styles.buttonArea}>
          <Button
            title="Enable Location"
            variant="primary"
            size="lg"
            onPress={handleEnableLocation}
          />
          <Button
            title="Not Now"
            variant="ghost"
            size="sm"
            onPress={() => setLocationDone(true)}
            style={{ marginTop: SPACING.sm }}
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
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(249,115,22,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headline: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: SPACING.sm,
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
