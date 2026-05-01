/**
 * EditProfileScreen.js — Account Info & Profile Editing
 *
 * Organised into two sections:
 *
 *   Public Profile  — what other players see across the app
 *     • Display Name     — users/{uid}.displayName  (shown everywhere instead of real name)
 *     • Instagram Handle — users/{uid}.instagramHandle  (optional, shown on profile)
 *
 *   Account Info    — private identity data, never shown to other players
 *     • First Name / Last Name — users/{uid}.firstName / .lastName
 *     • Email       — read-only; contact support to change
 *     • Username    — read-only; set at signup, never changeable
 *
 *   Game Style      — users/{uid}.skillLevel
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
import { sanitizeName, sanitizePersonName } from '../utils/sanitize';

// Valid skill level options — matches models.js and onboarding
const SKILL_LEVELS = ['Casual', 'Competitive', 'Either'];

const SKILL_DESCRIPTIONS = {
  Casual:      'Recreational — just here for fun',
  Competitive: 'Serious — love a good game',
  Either:      'Flexible — whatever the run needs',
};

/** Strip leading @ if user types it, keep the rest */
function sanitizeInstagram(raw) {
  return raw.replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}

export default function EditProfileScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { profile } = useProfile();

  const uid      = auth.currentUser?.uid;
  const email    = auth.currentUser?.email ?? '—';
  const username = profile?.username ?? null;

  // ── Local form state ──────────────────────────────────────────────────────
  // Public
  const [displayName,      setDisplayName]      = useState('');
  const [instagramHandle,  setInstagramHandle]  = useState('');
  // Private (real name — now editable so users can correct typos from signup)
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  // Game style
  const [skillLevel, setSkillLevel] = useState('Casual');

  const [saving,      setSaving]      = useState(false);
  const [hasChanges,  setHasChanges]  = useState(false);

  // Seed form from profile once it loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? profile.name ?? '');
      setInstagramHandle(profile.instagramHandle ?? '');
      setFirstName(profile.firstName ?? '');
      setLastName(profile.lastName ?? '');
      setSkillLevel(profile.skillLevel ?? 'Casual');
    }
  }, [profile?.displayName, profile?.instagramHandle, profile?.firstName, profile?.lastName, profile?.skillLevel]);

  // Track whether anything has changed vs. saved values
  useEffect(() => {
    if (!profile) return;
    const changed =
      displayName.trim()     !== (profile.displayName ?? profile.name ?? '').trim()  ||
      instagramHandle.trim() !== (profile.instagramHandle ?? '').trim()               ||
      firstName.trim()       !== (profile.firstName ?? '').trim()                     ||
      lastName.trim()        !== (profile.lastName  ?? '').trim()                     ||
      skillLevel             !== (profile.skillLevel ?? 'Casual');
    setHasChanges(changed);
  }, [displayName, instagramHandle, firstName, lastName, skillLevel, profile]);

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    const trimmedDisplay = displayName.trim();
    if (!trimmedDisplay) {
      Alert.alert('Display name required', 'Please enter a display name so other players can find you.');
      return;
    }
    if (!uid) return;

    const trimmedFirst = firstName.trim();
    const trimmedLast  = lastName.trim();
    const trimmedIG    = instagramHandle.trim();

    setSaving(true);
    try {
      const updates = {
        displayName: trimmedDisplay,
        instagramHandle: trimmedIG,
        skillLevel,
      };

      // Update real name fields only if they have content
      if (trimmedFirst) updates.firstName = trimmedFirst;
      if (trimmedLast)  updates.lastName  = trimmedLast;
      // Keep the legacy `name` field in sync so old code paths still work
      if (trimmedFirst || trimmedLast) {
        updates.name = `${trimmedFirst || profile?.firstName || ''} ${trimmedLast || profile?.lastName || ''}`.trim();
      }

      await updateDoc(doc(db, 'users', uid), updates);

      // Sync Firebase Auth displayName with the chosen display name
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedDisplay });
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

  // ── Read-only field row ───────────────────────────────────────────────────
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

  // ── Editable text field ───────────────────────────────────────────────────
  const EditableField = ({ label, value, onChangeText, placeholder, hint, autoCapitalize = 'words', maxLength = 40, prefix }) => (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        {prefix ? <Text style={[styles.inputPrefix, { color: colors.textMuted }]}>{prefix}</Text> : null}
        <TextInput
          style={[styles.textInput, prefix && styles.textInputWithPrefix]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          maxLength={maxLength}
          autoCorrect={false}
          autoCapitalize={autoCapitalize}
          returnKeyType="done"
        />
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

          {/* ── Section: Public Profile ───────────────────────────────── */}
          <Text style={styles.sectionTitle}>Public Profile</Text>
          <Text style={styles.sectionSubtitle}>What other players see across the app</Text>
          <View style={styles.card}>

            <EditableField
              label="Display Name"
              value={displayName}
              onChangeText={(t) => setDisplayName(sanitizeName(t))}
              placeholder="Your display name"
              hint="This is what shows on runs, leaderboards, and your profile."
              maxLength={40}
            />

            <View style={styles.divider} />

            <EditableField
              label="Instagram"
              value={instagramHandle}
              onChangeText={(t) => setInstagramHandle(sanitizeInstagram(t))}
              placeholder="yourhandle"
              hint="Optional. Other players can tap it to visit your profile."
              autoCapitalize="none"
              maxLength={30}
              prefix="@"
            />

          </View>

          {/* ── Section: Account Info ─────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Account Info</Text>
          <Text style={styles.sectionSubtitle}>Your private identity — not visible to other players</Text>
          <View style={styles.card}>

            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <EditableField
                  label="First Name"
                  value={firstName}
                  onChangeText={(t) => setFirstName(sanitizePersonName(t))}
                  placeholder="First"
                  maxLength={30}
                />
              </View>
              <View style={styles.nameFieldDivider} />
              <View style={styles.nameField}>
                <EditableField
                  label="Last Name"
                  value={lastName}
                  onChangeText={(t) => setLastName(sanitizePersonName(t))}
                  placeholder="Last"
                  maxLength={30}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <ReadOnlyField
              label="Email"
              value={email}
              hint="To change your email, contact support."
            />

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
    marginBottom: 2,
    marginTop: SPACING.lg,
    marginLeft: 2,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginBottom: SPACING.xs,
    marginLeft: 2,
    opacity: 0.7,
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

  // ── Name row (first + last side by side) ──────────────────────────────────
  nameRow: {
    flexDirection: 'row',
  },
  nameField: {
    flex: 1,
  },
  nameFieldDivider: {
    width: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : colors.border,
    marginVertical: SPACING.md,
  },

  // ── Fields ────────────────────────────────────────────────────────────────
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
    overflow: 'hidden',
  },
  inputPrefix: {
    fontSize: FONT_SIZES.body,
    paddingLeft: SPACING.md,
    paddingRight: 2,
  },
  textInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  textInputWithPrefix: {
    paddingLeft: 2,
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
    lineHeight: 16,
  },

  // ── Skill level ───────────────────────────────────────────────────────────
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

  // ── Save button ───────────────────────────────────────────────────────────
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
