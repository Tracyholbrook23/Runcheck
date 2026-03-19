/**
 * SignupScreen.js — New User Registration Screen
 *
 * Allows new users to create a RunCheck account by providing their name,
 * age, skill level, email, and password. On successful registration:
 *   1. Creates a Firebase Auth user with `createUserWithEmailAndPassword`.
 *   2. Writes a Firestore user profile document under `users/{uid}` with
 *      the collected form data (name, age, skillLevel, email).
 *   3. Navigates to the Main tab navigator.
 *
 * Skill level is selected via a row of pill-style buttons styled with the
 * skill-level color palette from the theme constants. The selected pill
 * gets its background and text color updated to match the skill's brand color.
 *
 * UI:
 *   - Same court background + overlay as LoginScreen for brand consistency
 *   - Ghost "Back to Login" button at the top
 *   - Form card with all inputs and skill picker inside
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ImageBackground,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS, SKILL_LEVEL_COLORS } from '../constants/theme';
import { useTheme } from '../contexts';
import { formatSkillLevel } from '../services/models';
import { Logo, Button, Input } from '../components';
import { auth, db } from '../config/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { setDoc, doc, getDoc, runTransaction } from 'firebase/firestore';

/** The three play-style options a user can choose from during registration. */
const SKILL_OPTIONS = ['Casual', 'Competitive', 'Either'];

/**
 * USERNAME_REGEX — Validation pattern for RunCheck usernames.
 *
 * Rules:
 *   - Must start with a letter (a-z, A-Z)
 *   - Followed by 2–19 characters that are letters, digits, dots, or underscores
 *   - Total length: 3–20 characters
 *
 * Casing is preserved for display; lowercase is used for uniqueness checks.
 */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._]{2,19}$/;

/**
 * SignupScreen — Account creation form.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for navigating back to Login or forward to Main.
 * @returns {JSX.Element}
 */
export default function SignupScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const { colors, isDark } = useTheme();

  // Recompute styles only when the theme changes
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleSignup — Validates the form, creates the Firebase Auth user,
   * reserves the username atomically, and sends a verification email.
   *
   * Flow:
   *   1. Client-side validation (all fields + username regex)
   *   2. Create Firebase Auth account
   *   3. Firestore transaction:
   *      a. Read usernames/{usernameLower} — if exists, abort ("username taken")
   *      b. Write usernames/{usernameLower} reservation doc
   *      c. Write users/{uid} profile doc
   *   4. Send email verification
   *   5. Navigate to VerifyEmail screen
   *
   * If the transaction fails after Auth creation, the user can retry —
   * the Auth account exists but the profile doesn't, so the next attempt
   * will fail at createUserWithEmailAndPassword. The user can log in and
   * will be routed to ClaimUsername to complete setup.
   */
  const handleSignup = async () => {
    setFormError('');

    if (!name || !username || !email || !password || !age || !skillLevel) {
      setFormError('Please fill out all fields.');
      return;
    }

    // Validate username format
    if (!USERNAME_REGEX.test(username)) {
      setFormError(
        'Username must be 3–20 characters, start with a letter, and contain only letters, numbers, dots, or underscores.',
      );
      return;
    }

    setLoading(true);
    const usernameLower = username.toLowerCase();

    try {
      // Step 1: Create the Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Step 2: Atomic transaction — reserve username + write profile
      const usernameRef = doc(db, 'usernames', usernameLower);
      const userRef = doc(db, 'users', user.uid);

      await runTransaction(db, async (transaction) => {
        const usernameSnap = await transaction.get(usernameRef);
        if (usernameSnap.exists()) {
          throw new Error('USERNAME_TAKEN');
        }

        // Reserve the username
        transaction.set(usernameRef, {
          uid: user.uid,
          createdAt: new Date(),
        });

        // Write the user profile
        transaction.set(userRef, {
          name,
          username,
          usernameLower,
          phoneNumber: null,
          age,
          skillLevel,
          email,
        });
      });

      // Step 3: Send email verification (only after transaction succeeds)
      await sendEmailVerification(user);

      // Step 4: Navigate to verification gate
      navigation.replace('VerifyEmail');
    } catch (error) {
      // Known, expected errors — show inline message, no console noise
      if (error.message === 'USERNAME_TAKEN') {
        setFormError('That username is already taken. Please choose another.');
      } else if (error.code === 'auth/email-already-in-use') {
        setFormError('An account with this email already exists.');
      } else if (error.code === 'auth/weak-password') {
        setFormError('Password should be at least 6 characters.');
      } else if (error.code === 'auth/invalid-email') {
        setFormError('Please enter a valid email address.');
      } else if (error.code === 'auth/network-request-failed') {
        setFormError('Network error. Check your connection and try again.');
      } else {
        // Truly unexpected — log for debugging
        if (__DEV__) console.error('[Signup] Unexpected error:', error);
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      {/* Semi-transparent overlay for text legibility over the court image */}
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
            <Button
              title="← Back to Login"
              variant="ghost"
              size="sm"
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            />

            <View style={styles.brandSection}>
              <Logo size="medium" style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.title}>Create Your Account</Text>
              <Text style={styles.tagline}>Join the RunCheck community</Text>
            </View>

            <View style={styles.formCard}>
              <Input label="Full Name" placeholder="Your name" value={name} onChangeText={setName} />
              <Input
                label="Username"
                placeholder="e.g. hoopKing23"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
              <Input label="Age" placeholder="Your age" keyboardType="numeric" value={age} onChangeText={setAge} />

              {/* Skill Level Picker — pill buttons styled by the selected skill's theme color */}
              <Text style={styles.fieldLabel}>Skill Level</Text>
              <View style={styles.skillRow}>
                {SKILL_OPTIONS.map((level) => {
                  const selected = skillLevel === level;
                  // Look up this skill's brand colors from the theme constants
                  const skillColors = SKILL_LEVEL_COLORS[level];
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.skillPill,
                        // Apply skill-specific bg + border only when this pill is selected
                        selected && { backgroundColor: skillColors.bg, borderColor: skillColors.text },
                      ]}
                      onPress={() => setSkillLevel(level)}
                    >
                      <Text
                        style={[
                          styles.skillPillText,
                          selected && { color: skillColors.text },
                        ]}
                      >
                        {formatSkillLevel(level)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Input
                label="Email"
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <Input
                label="Password"
                placeholder="Create a password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {formError ? (
                <Text style={styles.errorText}>{formError}</Text>
              ) : null}

              <Button
                title="Create Account"
                variant="primary"
                size="lg"
                onPress={handleSignup}
                loading={loading}
                testID="signup-button"
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
 * getStyles — Generates a themed StyleSheet for SignupScreen.
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
    padding: SPACING.lg,
    paddingTop: SPACING.xxl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
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
  fieldLabel: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 6,
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  skillPill: {
    width: '48%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  skillPillText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(255,255,255,0.75)',
  },
  errorText: {
    fontSize: FONT_SIZES.small,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
});
