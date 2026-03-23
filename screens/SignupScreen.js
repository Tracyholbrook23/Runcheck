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
import { doc } from 'firebase/firestore';

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
 * EMAIL_REGEX — Basic format check. Catches missing @, missing dot in domain,
 * etc. Firebase's own validation covers most cases, but this runs first so
 * the user gets an inline message instead of waiting for a round-trip.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * DOMAIN_TYPOS — Common personal-email domain misspellings mapped to the
 * likely intended domain. Used by detectEmailTypo() to surface a "did you
 * mean …?" hint before account creation is attempted.
 */
const DOMAIN_TYPOS = {
  // Gmail
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cpm': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gmail.ocm': 'gmail.com',
  'gmail.coim': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaim.com': 'gmail.com',
  // Yahoo
  'yahoo.co': 'yahoo.com',
  'yahoo.comm': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  // Hotmail / Outlook
  'hotmail.co': 'hotmail.com',
  'hotmail.comm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outook.com': 'outlook.com',
  'outloook.com': 'outlook.com',
  'outlook.comm': 'outlook.com',
  // iCloud
  'iclod.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'icloud.comm': 'icloud.com',
};

/**
 * detectEmailTypo — Returns a corrected email string if a known domain typo
 * is detected, or null if the email looks fine.
 */
function detectEmailTypo(email) {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return null;
  const domain = trimmed.slice(atIndex + 1);
  const fix = DOMAIN_TYPOS[domain];
  return fix ? `${trimmed.slice(0, atIndex + 1)}${fix}` : null;
}

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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const { colors, isDark } = useTheme();

  // Recompute styles only when the theme changes
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Password requirements — evaluated live as the user types
  const pwChecks = useMemo(() => ({
    length: password.length >= 8,
    hasNumber: /[0-9]/.test(password),
    hasLetter: /[a-zA-Z]/.test(password),
  }), [password]);

  // All fields must have a value before the button becomes active.
  // Deep validation (email format, password strength, etc.) runs on submit.
  const isFormComplete = Boolean(
    firstName.trim() &&
    lastName.trim() &&
    username.trim() &&
    age.trim() &&
    skillLevel &&
    email.trim() &&
    password &&
    pwChecks.length &&
    pwChecks.hasNumber &&
    pwChecks.hasLetter,
  );

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

    if (!firstName.trim() || !lastName.trim() || !username || !email || !password || !age || !skillLevel) {
      setFormError('Please fill out all fields.');
      return;
    }

    // Validate age is a real number in a sensible range
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
      setFormError('Please enter a valid age (13–100).');
      return;
    }

    // Combine first + last name into a single display name for the profile
    const name = `${firstName.trim()} ${lastName.trim()}`;

    // Validate username format — targeted messages so the user knows exactly what to fix
    if (username.length < 3 || username.length > 20) {
      setFormError('Username must be between 3 and 20 characters.');
      return;
    }
    if (!/^[a-zA-Z]/.test(username)) {
      setFormError('Username must start with a letter (a–z).');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setFormError('Username can only contain letters, numbers, dots, and underscores.');
      return;
    }

    // Password strength check
    if (!pwChecks.length || !pwChecks.hasNumber || !pwChecks.hasLetter) {
      setFormError('Password must be at least 8 characters and include a letter and a number.');
      return;
    }

    // Basic email format check
    if (!EMAIL_REGEX.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    // Typo detection — catches things like @gmail.co before Firebase ever sees it
    const typoSuggestion = detectEmailTypo(email);
    if (typoSuggestion) {
      setFormError(`Did you mean ${typoSuggestion}? Double-check your email and try again.`);
      return;
    }

    setLoading(true);
    const usernameLower = username.toLowerCase();

    // Firestore is NOT written here. The profile + username reservation happens
    // in VerifyEmailScreen AFTER the user confirms their email. This ensures
    // nothing is ever stored for an unverified account.
    let authUser = null;

    try {
      // Step 1: Create the Firebase Auth account only
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      authUser = userCredential.user;

      // Step 2: Send verification email
      await sendEmailVerification(authUser);

      // Step 3: Navigate to verification gate, passing form data so
      // VerifyEmailScreen can write to Firestore once email is confirmed.
      navigation.replace('VerifyEmail', {
        signupData: {
          name,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          username,
          usernameLower,
          age,
          skillLevel,
          email,
        },
      });
    } catch (error) {
      // If the Auth user was created but something failed (e.g. email send),
      // delete it immediately so there's no orphaned Auth account.
      if (authUser) {
        try { await authUser.delete(); } catch (e) {
          if (__DEV__) console.warn('[Signup] Auth cleanup failed:', e);
        }
      }

      if (error.code === 'auth/email-already-in-use') {
        setFormError('An account with this email already exists. Try logging in instead.');
      } else if (error.code === 'auth/weak-password') {
        setFormError('Password should be at least 6 characters.');
      } else if (error.code === 'auth/invalid-email') {
        setFormError('Please enter a valid email address.');
      } else if (error.code === 'auth/network-request-failed') {
        setFormError('Network error. Check your connection and try again.');
      } else {
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
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <Input
                    label="First Name"
                    placeholder="First"
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                </View>
                <View style={styles.nameField}>
                  <Input
                    label="Last Name"
                    placeholder="Last"
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              </View>
              <Input
                label="Username"
                placeholder="e.g. hoopKing23"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={(val) => setUsername(val.replace(/[^a-zA-Z0-9._]/g, ''))}
              />
              <Text style={styles.fieldHint}>
                3–20 characters · letters, numbers, dots, underscores · must start with a letter
              </Text>
              <Input
                label="Age"
                placeholder="Your age"
                keyboardType="number-pad"
                value={age}
                onChangeText={(val) => setAge(val.replace(/[^0-9]/g, ''))}
                maxLength={3}
              />

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

              {/* Live password requirement indicators */}
              {password.length > 0 && (
                <View style={styles.pwChecks}>
                  <Text style={[styles.pwCheck, pwChecks.length ? styles.pwCheckMet : styles.pwCheckUnmet]}>
                    {pwChecks.length ? '✓' : '✗'} At least 8 characters
                  </Text>
                  <Text style={[styles.pwCheck, pwChecks.hasLetter ? styles.pwCheckMet : styles.pwCheckUnmet]}>
                    {pwChecks.hasLetter ? '✓' : '✗'} Contains a letter
                  </Text>
                  <Text style={[styles.pwCheck, pwChecks.hasNumber ? styles.pwCheckMet : styles.pwCheckUnmet]}>
                    {pwChecks.hasNumber ? '✓' : '✗'} Contains a number
                  </Text>
                </View>
              )}

              {formError ? (
                <Text style={styles.errorText}>{formError}</Text>
              ) : null}

              <Button
                title="Create Account"
                variant="primary"
                size="lg"
                onPress={handleSignup}
                loading={loading}
                disabled={!isFormComplete}
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
  nameRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  nameField: {
    flex: 1,
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
  fieldHint: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.40)',
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },
  pwChecks: {
    marginBottom: SPACING.sm,
    gap: 4,
  },
  pwCheck: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 18,
  },
  pwCheckMet: {
    color: '#22C55E',
  },
  pwCheckUnmet: {
    color: 'rgba(255,255,255,0.45)',
  },
  errorText: {
    fontSize: FONT_SIZES.small,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
});
