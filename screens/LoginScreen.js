/**
 * LoginScreen.js — Email / Password Sign-In Screen
 *
 * Entry point for returning users. Authenticates via Firebase Auth's
 * `signInWithEmailAndPassword` and navigates to the Main tab navigator
 * on success. Provides user-friendly error messages for the most common
 * Firebase Auth error codes rather than surfacing raw SDK messages.
 *
 * UI:
 *   - Full-bleed basketball court background image with dark overlay
 *   - RunCheck logo and tagline centered above the form
 *   - Email + password inputs inside a frosted-glass card
 *   - Primary "Log In" button and secondary "Create Account" navigation
 *
 * Styles are memoized via `getStyles(colors, isDark)` so they update
 * correctly when the user toggles dark/light mode.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ImageBackground,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Keyboard,
  Platform,
} from 'react-native';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button, Input } from '../components';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * LoginScreen — Sign-in screen component.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for navigating to Main or Signup.
 * @returns {JSX.Element}
 */
export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { colors, isDark } = useTheme();

  // Recompute styles only when the theme changes, not on every keystroke
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleLogin — Validates inputs and authenticates with Firebase Auth.
   *
   * Translates Firebase Auth error codes into human-readable messages:
   *   - `auth/user-not-found`    → "No account found with this email."
   *   - `auth/wrong-password`    → "Incorrect password."
   *   - `auth/invalid-email`     → "Please enter a valid email address."
   *   - `auth/too-many-requests` → "Too many failed attempts. Please try again later."
   *
   * On success, navigates to the 'Main' route (the bottom tab navigator).
   */
  const handleLogin = async () => {
    if (!email || !password) {
      alert('Please enter both email and password');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Route based on verification + username state
      if (!user.emailVerified) {
        navigation.replace('VerifyEmail');
      } else {
        // Check if user has a username
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.data();
        if (!data?.username) {
          navigation.replace('ClaimUsername');
        } else if (!data?.onboardingCompleted) {
          navigation.replace('OnboardingWelcome');
        } else {
          navigation.replace('Main');
        }
      }
    } catch (error) {
      // Expected auth failures are normal UX — log at warn, not error
      if (__DEV__) console.warn('[Login] Auth error:', error.code);

      let errorMessage = 'Login failed. Please try again.';
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
          errorMessage = 'Invalid email or password.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Check your connection and try again.';
          break;
      }
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleForgotPassword — Sends a Firebase password-reset email.
   * Uses the email already in the input if present; otherwise prompts the user
   * to enter one first.
   */
  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      alert('Enter your email address above, then tap "Forgot password?" again.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      alert('Check your inbox — we\'ve sent a password reset link to ' + trimmedEmail + '.');
    } catch (error) {
      if (__DEV__) console.warn('[Login] Password reset error:', error.code);

      let message = 'Something went wrong. Please try again.';
      switch (error.code) {
        case 'auth/user-not-found':
          message = 'No account found with that email address.';
          break;
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;
        case 'auth/network-request-failed':
          message = 'Network error. Check your connection and try again.';
          break;
      }
      alert(message);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      {/* Semi-transparent overlay darkens the background for text legibility */}
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandSection}>
              <Logo size="large" style={{ marginBottom: SPACING.md }} />
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.tagline}>Real runs. Real players. Real time.</Text>
            </View>

            <View style={styles.formCard}>
              <Input
                label="Email"
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                testID="email-input"
              />
              <Input
                label="Password"
                placeholder="Enter your password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                testID="password-input"
              />

              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.forgotPassword}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>

              <Button
                title="Log In"
                variant="primary"
                size="lg"
                onPress={handleLogin}
                loading={loading}
                testID="login-button"
                style={{ marginTop: SPACING.sm }}
              />

              <Button
                title="Create Account"
                variant="outline"
                size="lg"
                onPress={() => navigation.navigate('Signup')}
                style={{ marginTop: SPACING.sm }}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for LoginScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  bgImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  container: {
    flexGrow: 1,
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
    marginBottom: SPACING.xs,
  },
  tagline: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  forgotPasswordText: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.55)',
  },
});
