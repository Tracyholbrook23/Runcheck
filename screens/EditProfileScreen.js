/**
 * EditProfileScreen.js — Account Info & Profile Editing
 *
 * Lets the signed-in user view and update their account information.
 *
 * Editable fields:
 *   - Display Name   — written to Firestore users/{uid}.name
 *                      and Firebase Auth displayName
 *   - Skill Level    — written to Firestore users/{uid}.skillLevel
 *                      ('Casual' | 'Competitive' | 'Either')
 *
 * Read-only fields:
 *   - Email          — changing email requires reauthentication (out of scope
 *                      for launch). Contact support note shown instead.
 *   - Username       — set at signup; not changeable post-registration.
 *
 * Navigation: ProfileStack → Settings → EditProfile
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useProfile } from '../hooks';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { sanitizeName } from '../utils/sanitize';

// Valid skill level options — matches models.js and onboarding
const SKILL_LEVELS = ['Casual', 'Competitive', 'Either'];

const SKILL_DESCRIPTIONS = {
  Casual:      'Recreational — just here for fun',
  Competitive: 'Serious — love a good game',
  Either:      'Flexible — whatever the run needs',
};

export default function EditProfileScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { profile } = useProfile();

  const uid        = auth.currentUser?.uid;
  const email      = auth.currentUser?.email ?? '—';
  const username   = profile?.username ?? null;

  // ── Local form state ────────────────────────────────────────────────────
  const [name, setName]             = useState('');
  const [skillLevel, setSkillLevel] = useState('Casual');
  const [saving, setSaving]         = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Seed form from profile once it loads
  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setSkillLevel(profile.skillLevel ?? 'Casual');
    }
  }, [profile?.name, profile?.skillLevel]);

  // Track whether anything has changed vs. saved values
  useEffect(() => {
    if (!profile) return;
    const nameChanged  = name.trim() !== (profile.name ?? '').trim();
    const skillChanged = skillLevel !== (profile.skillLevel ?? 'Casual');
    setHasChanges(nameChanged || skillChanged);
  }, [name, skillLevel, profile]);

  // ── Save handler ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
    if (!uid) return;

    setSaving(true);
    try {
      // Write to Firestore
      await updateDoc(doc(db, 'users', uid), {
        name:       trimmedName,
        skillLevel,
      });
      // Sync Firebase Auth display name
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }
      setHasChanges(false);
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      if (__DEV__) console.warn('[EditProfile] save error:', err);
      Alert.alert('Error', 'Could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Read-only field row ──────────────────────────────────────────────────
  const ReadOnlyField = ({ label, value, hint }) => (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.readOnlyRow}>
        <Text style={styles.readOnlyValue}>{value}</Text>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Section: Identity ─────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Identity</Text>
          <View style={styles.card}>

            {/* Display Name */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={(text) => setName(sanitizeName(text))}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>

            <View style={styles.divider} />

            {/* Email — read only */}
            <ReadOnlyField
              label="Email"
              value={email}
              hint="To change your email, contact support."
            />

            {/* Username — read only, only shown if set */}
            {username && (
              <>
                <View style={styles.divider} />
                <ReadOnlyField
                  label="Username"
                  value={`@${username}`}
                  hint="Usernames can't be changed after signup."
                />
              </>
            )}
          </View>

          {/* ── Section: Game Style ───────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Game Style</Text>
          <View style={styles.card}>
            <Text style={styles.skillLabel}>How do you like to play?</Text>
            {SKILL_LEVELS.map((level, index) => {
              const active = skillLevel === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.skillRow,
                    active && styles.skillRowActive,
                    index < SKILL_LEVELS.length - 1 && styles.skillRowBorder,
                  ]}
                  onPress={() => setSkillLevel(level)}
                  activeOpacity={0.75}
                >
                  <View style={styles.skillRowLeft}>
                    <View style={[styles.skillRadio, active && styles.skillRadioActive]}>
                      {active && <View style={styles.skillRadioDot} />}
                    </View>
                    <View>
                      <Text style={[styles.skillName, active && styles.skillNameActive]}>
                        {level}
                      </Text>
                      <Text style={styles.skillDesc}>{SKILL_DESCRIPTIONS[level]}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Save button ───────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
            activeOpacity={0.82}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
    marginLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  divider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : colors.border,
    marginHorizontal: SPACING.md,
  },

  // ── Fields ──────────────────────────────────────────────────────────────
  fieldBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  textInput: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : colors.border,
  },
  readOnlyValue: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },
  fieldHint: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 5,
  },

  // ── Skill level ─────────────────────────────────────────────────────────
  skillLabel: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  skillRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : colors.border,
  },
  skillRowActive: {
    backgroundColor: isDark ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.05)',
  },
  skillRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  skillRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillRadioActive: {
    borderColor: colors.primary,
  },
  skillRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  skillName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textSecondary,
  },
  skillNameActive: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  skillDesc: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Save button ─────────────────────────────────────────────────────────
  saveButton: {
    marginTop: SPACING.xl,
    backgroundColor: colors.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },
});
