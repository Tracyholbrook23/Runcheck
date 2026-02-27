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
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';

/** The three play-style options a user can choose from during registration. */
const SKILL_OPTIONS = ['Casual', 'Competitive', 'Either'];

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
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { colors, isDark } = useTheme();

  // Recompute styles only when the theme changes
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleSignup — Validates the form then creates the Firebase Auth user
   * and Firestore profile document.
   *
   * Firestore write path: `users/{uid}` with fields:
   *   { name, age, skillLevel, email }
   *
   * Both the Auth creation and Firestore write must succeed for the user
   * to proceed. If either fails, the raw Firebase error message is shown.
   */
  const handleSignup = async () => {
    if (!name || !email || !password || !age || !skillLevel) {
      alert('Please fill out all fields');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create the Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Step 2: Write the user profile to Firestore under users/{uid}
      await setDoc(doc(db, 'users', user.uid), {
        name,
        age,
        skillLevel,
        email,
      });

      alert('Signup successful!');
      navigation.navigate('CityGate');
    } catch (error) {
      console.error('Signup error:', error);
      alert(error.message);
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
});
