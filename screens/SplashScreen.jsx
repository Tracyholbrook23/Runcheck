/**
 * SplashScreen.jsx — Animated App Launch Screen
 *
 * The first screen users see when opening RunCheck. Plays a branded
 * animation sequence and then navigates to LoginScreen after 4.5 seconds.
 *
 * Animation sequence:
 *   1. Logo fades in (opacity 0 → 1, 1000ms) and springs to full size
 *      (scale 0.85 → 1) simultaneously — giving it a "pop" entrance feel.
 *   2. After both animations complete, the tagline fades in (800ms).
 *   3. Simultaneously, the logo begins a subtle idle pulse loop
 *      (scale 1 ↔ 1.05, 800ms per direction) to show the app is alive.
 *   4. A 4500ms timeout fires `navigation.replace('Login')`, removing
 *      SplashScreen from the navigation stack so the back button doesn't
 *      return here.
 *
 * All animations use `useNativeDriver: true` to run on the UI thread and
 * avoid blocking the JS thread during the Firebase Auth init that happens
 * in parallel.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';

const logo = require('../assets/logo/runcheck-logo-transparent.png');

/**
 * SplashScreen — Branded intro animation with auto-navigation.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop used to replace this screen with Login after the
 *   animation completes.
 * @returns {JSX.Element}
 */
export default function SplashScreen({ navigation }) {
  // Animated values — initialized outside JSX so they're stable across renders
  const fadeAnim = useRef(new Animated.Value(0)).current;       // Logo opacity
  const scaleAnim = useRef(new Animated.Value(0.85)).current;   // Logo entrance scale
  const pulseAnim = useRef(new Animated.Value(1)).current;      // Logo idle pulse
  const taglineFade = useRef(new Animated.Value(0)).current;    // Tagline opacity

  useEffect(() => {
    // Phase 1: Fade + spring the logo in simultaneously
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,          // Lower friction = bouncier spring
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: Fade in the tagline after the logo settles
      Animated.timing(taglineFade, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();

      // Phase 3: Start an infinite idle pulse on the logo
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });

    // Phase 4: Replace this screen with Login after the branding moment ends.
    // `replace` is used instead of `navigate` so the user can't back-navigate here.
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 4500);

    // Cleanup: cancel the timer if the component unmounts early (e.g., in tests)
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Logo: combines entrance scale + idle pulse via transform array */}
      <Animated.Image
        source={logo}
        style={[
          styles.logo,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
          },
        ]}
        resizeMode="contain"
      />
      {/* Tagline fades in after the logo animation completes */}
      <Animated.Text style={[styles.tagline, { opacity: taglineFade }]}>
        Your City. Your Court. Your People.
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 220,
    height: 220,
  },
  tagline: {
    color: '#F97316',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 16,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
