/**
 * CityGateScreen.js — City Availability Gate
 *
 * Shown once immediately after a new user signs up, before they reach Main.
 * Explains that RunCheck is currently live in the Austin metro area and
 * optionally verifies the user's physical location.
 *
 * Flow:
 *   1. Default state — logo, title, two buttons
 *   2. "Use My Location" pressed:
 *        a. Request foreground location permission via expo-location.
 *        b. If granted, compute Haversine distance from Austin, TX.
 *        c. Within 50 miles  → save flag, proceed to Main.
 *        d. Outside 50 miles → switch to out-of-range state showing a
 *             friendly message and a "Continue Anyway" button.
 *        e. Permission denied / error → alert, then proceed to Main.
 *   3. "Skip for Now" pressed → save flag, proceed to Main.
 *   4. Out-of-range "Continue Anyway" → save flag, proceed to Main.
 *
 * Persistence:
 *   Once the user passes through (any path), `cityGateShown: true` is
 *   written to their `users/{uid}` Firestore document so this screen is
 *   never shown again on future logins.
 *
 * UI:
 *   Full-bleed court background with dark overlay — identical to LoginScreen
 *   and SignupScreen for visual continuity in the onboarding flow.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button } from '../components';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

/** Austin, TX city center — used as the reference point for proximity checks. */
const AUSTIN_LAT = 30.2672;
const AUSTIN_LON = -97.7431;

/** Users within this distance (miles) are considered "in range". */
const MAX_DISTANCE_MILES = 50;

/**
 * toRad — Converts decimal degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
const toRad = (deg) => deg * (Math.PI / 180);

/**
 * haversineDistanceMiles — Computes great-circle distance between two coordinates.
 *
 * Uses the Haversine formula; accurate enough for city-range proximity checks.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in miles.
 */
const haversineDistanceMiles = (lat1, lon1, lat2, lon2) => {
  const R = 3958.8; // Earth's mean radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * CityGateScreen — One-time city availability gate shown after signup.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function CityGateScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [checking, setChecking] = useState(false);
  const [outOfRange, setOutOfRange] = useState(false);

  /**
   * saveCityGateFlag — Writes `cityGateShown: true` to the signed-in user's
   * Firestore profile so this screen is skipped on all future logins.
   *
   * Non-critical: navigation proceeds even if the write fails.
   */
  const saveCityGateFlag = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await updateDoc(doc(db, 'users', uid), { cityGateShown: true });
      }
    } catch (err) {
      console.warn('CityGate: could not save cityGateShown flag:', err);
    }
  };

  /**
   * proceedToMain — Saves the gate flag then navigates to the main app.
   */
  const proceedToMain = async () => {
    await saveCityGateFlag();
    navigation.navigate('Main');
  };

  /**
   * handleUseLocation — Requests foreground location permission, measures
   * distance from Austin, and either proceeds or shows the out-of-range state.
   */
  const handleUseLocation = async () => {
    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        // Permission denied — don't block the user, just move them along
        alert("Location permission wasn't granted. You can still explore the app!");
        await proceedToMain();
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      const miles = haversineDistanceMiles(latitude, longitude, AUSTIN_LAT, AUSTIN_LON);

      if (miles <= MAX_DISTANCE_MILES) {
        await proceedToMain();
      } else {
        setOutOfRange(true);
      }
    } catch (err) {
      console.error('CityGate location error:', err);
      alert("Couldn't get your location. You can still explore the app!");
      await proceedToMain();
    } finally {
      setChecking(false);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      {/* Dark overlay — matches LoginScreen / SignupScreen overlay opacity */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>

          {/* Brand section — logo + title + subtitle */}
          <View style={styles.brandSection}>
            <Logo size="large" style={{ marginBottom: SPACING.lg }} />
            <Text style={styles.title}>
              {outOfRange ? 'Outside Our Coverage' : "You're Almost In"}
            </Text>
            <Text style={styles.subtitle}>
              {outOfRange
                ? "Looks like you're outside the Austin area. RunCheck is currently focused on Austin and surrounding cities, but you're welcome to explore the app!"
                : 'RunCheck is currently live in the Austin metro area'}
            </Text>
            {!outOfRange && (
              <Text style={styles.expanding}>Expanding across Texas in 2025</Text>
            )}
          </View>

          {outOfRange ? (
            /* ── Out-of-range state ── */
            <>
              <View style={styles.iconRow}>
                <Ionicons name="location-outline" size={52} color="rgba(255,255,255,0.30)" />
              </View>
              <Button
                title="Continue Anyway"
                variant="primary"
                size="lg"
                onPress={proceedToMain}
                style={styles.button}
              />
            </>
          ) : (
            /* ── Default state — location check or skip ── */
            <>
              {checking ? (
                <View style={styles.checkingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={styles.checkingText}>Checking your location…</Text>
                </View>
              ) : (
                <>
                  <Button
                    title="Use My Location"
                    variant="primary"
                    size="lg"
                    onPress={handleUseLocation}
                    style={styles.button}
                  />
                  <Button
                    title="Skip for Now"
                    variant="ghost"
                    size="lg"
                    onPress={proceedToMain}
                    style={styles.buttonSecondary}
                  />
                </>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for CityGateScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) =>
  StyleSheet.create({
    bgImage: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.70)',
    },
    safe: {
      flex: 1,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: SPACING.lg,
    },
    brandSection: {
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    title: {
      fontSize: FONT_SIZES.h1,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: '#FFFFFF',
      textAlign: 'center',
      letterSpacing: -0.3,
      marginBottom: SPACING.sm,
    },
    subtitle: {
      fontSize: FONT_SIZES.body,
      color: 'rgba(255,255,255,0.65)',
      textAlign: 'center',
      lineHeight: 22,
      letterSpacing: 0.1,
      paddingHorizontal: SPACING.md,
    },
    expanding: {
      fontSize: FONT_SIZES.small,
      color: 'rgba(255,255,255,0.35)',
      textAlign: 'center',
      letterSpacing: 0.3,
      marginTop: SPACING.sm,
    },
    iconRow: {
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    button: {
      marginBottom: SPACING.sm,
    },
    buttonSecondary: {
      marginTop: SPACING.xs,
    },
    checkingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.lg,
    },
    checkingText: {
      fontSize: FONT_SIZES.body,
      color: 'rgba(255,255,255,0.70)',
      fontWeight: FONT_WEIGHTS.medium,
    },
  });
