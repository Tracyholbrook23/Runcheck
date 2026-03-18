/**
 * ClaimUsernameScreen.js — Username Migration Gate for Existing Users
 *
 * Shown to authenticated, email-verified users whose Firestore profile
 * at users/{uid} is missing the `username` field. This is the migration
 * path for accounts created before the username system was added.
 *
 * Flow:
 *   1. User enters a desired username.
 *   2. Client validates format via USERNAME_REGEX.
 *   3. Firestore transaction:
 *      a. Read usernames/{usernameLower} — abort if taken.
 *      b. Create usernames/{usernameLower} reservation doc.
 *      c. Update users/{uid} with username, usernameLower, and phoneNumber: null.
 *   4. On success, navigate to Main.
 *
 * The transaction uses updateDoc on the existing user doc (not setDoc)
 * to preserve all existing profile fields.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button, Input } from '../components';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * USERNAME_REGEX — Same validation pattern as SignupScreen.
 * Must start with a letter, 3–20 chars total, letters/digits/dots/underscores.
 */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._]{2,19}$/;

/**
 * ClaimUsernameScreen — One-time username claim for existing users.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function ClaimUsernameScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleClaim — Validates and reserves the username via Firestore
   * transaction, then updates the existing user profile.
   */
  const handleClaim = async () => {
    setError('');

    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }

    if (!USERNAME_REGEX.test(username)) {
      setError(
        'Username must be 3–20 characters, start with a letter, and contain only letters, numbers, dots, or underscores.',
      );
      return;
    }

    setLoading(true);
    const usernameLower = username.toLowerCase();
    const user = auth.currentUser;

    if (!user) {
      setError('You must be logged in. Please sign in again.');
      setLoading(false);
      return;
    }

    try {
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

        // Update existing user doc — merge new fields without overwriting anything
        transaction.update(userRef, {
          username,
          usernameLower,
          phoneNumber: null,
        });
      });

      // Success — navigate to main app
      navigation.replace('Main');
    } catch (err) {
      if (__DEV__) console.error('Claim username error:', err);
      if (err.message === 'USERNAME_TAKEN') {
        setError('That username is already taken. Please choose another.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleSignOut — Lets the user sign out if they want to switch accounts.
   */
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (err) {
      if (__DEV__) console.error('Sign out error:', err);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.container}>
            <Logo size="medium" style={{ marginBottom: SPACING.md }} />

            <Text style={styles.title}>Choose a Username</Text>
            <Text style={styles.subtitle}>
              Usernames are how players will find you on RunCheck. Pick something memorable.
            </Text>

            <View style={styles.formCard}>
              <Input
                label="Username"
                placeholder="e.g. hoopKing23"
                autoCapitalize="none"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setError('');
                }}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                title="Claim Username"
                variant="primary"
                size="lg"
                onPress={handleClaim}
                loading={loading}
                style={{ marginTop: SPACING.xs }}
              />
            </View>

            <Button
              title="Sign Out"
              variant="ghost"
              size="sm"
              onPress={handleSignOut}
              style={{ marginTop: SPACING.md }}
            />
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  bgImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
  formCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  errorText: {
    fontSize: FONT_SIZES.small,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
});
