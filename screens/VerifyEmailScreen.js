/**
 * VerifyEmailScreen.js — Email Verification Gate
 *
 * Shown to users who have signed up (or logged in) but have not yet
 * verified their email address via the Firebase Auth verification link.
 *
 * Provides two actions:
 *   1. "Resend Verification Email" — calls sendEmailVerification with a
 *      60-second cooldown to avoid Firebase rate limits.
 *   2. "I Verified, Continue" — calls user.reload() to refresh the
 *      emailVerified flag from the server, then navigates forward if
 *      verified. If not, shows a hint message.
 *
 * Also includes a sign-out option so the user can switch accounts if
 * they signed up with the wrong email.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button } from '../components';
import { auth, db } from '../config/firebase';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { doc, getDoc, runTransaction } from 'firebase/firestore';

/**
 * VerifyEmailScreen — Gate screen for unverified email addresses.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function VerifyEmailScreen({ navigation, route }) {
  // signupData is passed from SignupScreen. It is null/undefined when an
  // existing (already-profiled) user lands here to re-verify.
  const signupData = route?.params?.signupData ?? null;
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [hint, setHint] = useState('');
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  /**
   * handleResend — Sends a new verification email with a 60-second cooldown
   * to stay within Firebase's rate limit. Catches rate-limit and
   * already-sent errors and shows a friendly message instead of raw errors.
   */
  const handleResend = async () => {
    if (cooldown) {
      setHint('Verification email already sent. Check your inbox or spam folder, then try again in a minute.');
      return;
    }

    setResending(true);
    setHint('');

    try {
      const user = auth.currentUser;
      if (user) {
        await sendEmailVerification(user);
        setHint('Verification email sent! Check your inbox and spam folder.');
        setCooldown(true);
        setTimeout(() => setCooldown(false), 60000);
      }
    } catch (error) {
      // Only log truly unexpected errors — rate limits are normal and handled below
      if (error.code === 'auth/too-many-requests') {
        setHint('Verification email already sent. Check your inbox or spam folder, then try again in a minute.');
        setCooldown(true);
        setTimeout(() => setCooldown(false), 60000);
      } else {
        if (__DEV__) console.warn('[VerifyEmail] Resend error:', error.code);
        setHint('Could not send email right now. Please wait a moment and try again.');
      }
    } finally {
      setResending(false);
    }
  };

  /**
   * handleCheckVerified — Reloads the Firebase Auth user to refresh the
   * emailVerified flag. If now verified AND this is a new signup (signupData
   * present), writes the Firestore profile + username reservation atomically
   * before navigating forward. Nothing is written for unverified accounts.
   */
  const handleCheckVerified = async () => {
    setChecking(true);
    setHint('');

    try {
      const user = auth.currentUser;
      if (!user) return;

      await user.reload();

      if (!user.emailVerified) {
        setHint('Not verified yet. Tap the link in the email we sent, then come back and tap this button again.');
        return;
      }

      // ── Email is verified ─────────────────────────────────────────────────

      if (signupData) {
        // New signup — write profile + reserve username now that email is confirmed.
        const { name, firstName, lastName, username, usernameLower, age, skillLevel, email } = signupData;
        const usernameRef = doc(db, 'usernames', usernameLower);
        const userRef = doc(db, 'users', user.uid);

        await runTransaction(db, async (transaction) => {
          const usernameSnap = await transaction.get(usernameRef);
          // Allow if the reservation already belongs to this user (idempotent retry).
          if (usernameSnap.exists() && usernameSnap.data().uid !== user.uid) {
            throw new Error('USERNAME_TAKEN');
          }
          transaction.set(usernameRef, { uid: user.uid, createdAt: new Date() });
          transaction.set(userRef, {
            name,
            firstName,
            lastName,
            username,
            usernameLower,
            phoneNumber: null,
            age,
            skillLevel,
            email,
          });
        });

        // Profile written — proceed to region notice, then welcome.
        navigation.replace('OnboardingRegion');
      } else {
        // Returning user (e.g. logged in but unverified) — profile already exists.
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
      if (error.message === 'USERNAME_TAKEN') {
        setHint('That username was just claimed by someone else. Please sign out and sign up again with a different username.');
      } else {
        if (__DEV__) console.warn('[VerifyEmail] Verify error:', error);
        setHint('Something went wrong. Please try again.');
      }
    } finally {
      setChecking(false);
    }
  };

  /**
   * handleSignOut — Signs out the current user so they can switch accounts.
   */
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      if (__DEV__) console.warn('[VerifyEmail] Sign out error:', error.code);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        <Logo size="medium" style={{ marginBottom: SPACING.md }} />

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to{'\n'}
          <Text style={styles.emailText}>{auth.currentUser?.email}</Text>
        </Text>
        <Text style={styles.instruction}>
          Check your inbox (and spam folder) for the verification link.{'\n'}
          Once you tap it, come back here and continue.
        </Text>

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <View style={styles.buttonGroup}>
          <Button
            title="I Verified, Continue"
            variant="primary"
            size="lg"
            onPress={handleCheckVerified}
            loading={checking}
            style={{ marginBottom: SPACING.sm }}
          />
          <Button
            title={cooldown ? 'Email Sent — Check Inbox' : 'Resend Verification Email'}
            variant="outline"
            size="lg"
            onPress={handleResend}
            loading={resending}
            style={{ marginBottom: SPACING.sm }}
          />
          <Button
            title="Wrong email address? Sign out & start over"
            variant="ghost"
            size="sm"
            onPress={handleSignOut}
          />
        </View>
      </View>
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
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    marginBottom: SPACING.sm,
    lineHeight: 22,
  },
  emailText: {
    color: '#F97316',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  instruction: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  hint: {
    fontSize: FONT_SIZES.small,
    color: '#F97316',
    textAlign: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    lineHeight: 20,
  },
  buttonGroup: {
    width: '100%',
  },
});
