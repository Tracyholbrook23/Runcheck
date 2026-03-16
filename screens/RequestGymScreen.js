/**
 * RequestGymScreen.js — Submit a Gym Request
 *
 * Simple form that lets authenticated users request a new gym be added to
 * RunCheck. Calls the `submitGymRequest` Cloud Function, which enforces
 * the 1-request-per-7-days rate limit server-side.
 *
 * Requests land in the `gymRequests` Firestore collection as "pending"
 * and are reviewed manually by an admin in the Firebase Console.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { callFunction } from '../config/firebase';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// Type options for the picker
const TYPE_OPTIONS = [
  { label: 'Indoor', value: 'indoor' },
  { label: 'Outdoor', value: 'outdoor' },
  { label: "I'm not sure", value: 'unknown' },
];

// Access type options for the picker
const ACCESS_TYPE_OPTIONS = [
  { label: 'Free', value: 'free' },
  { label: 'Paid', value: 'paid' },
  { label: "I'm not sure", value: 'unknown' },
];

/**
 * RequestGymScreen — Gym request submission form.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function RequestGymScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);

  // Form state
  const [gymName, setGymName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [type, setType] = useState('indoor');
  const [accessType, setAccessType] = useState('unknown');
  const [notes, setNotes] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    gymName.trim().length > 0 &&
    address.trim().length > 0 &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const payload = {
        gymName: gymName.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        type,
        notes: notes.trim(),
      };
      // Only include accessType if the user made a definite selection
      if (accessType !== 'unknown') {
        payload.accessType = accessType;
      }
      await callFunction('submitGymRequest', payload);
      setSubmitted(true);
    } catch (err) {
      // The Cloud Function returns structured errors with codes.
      // `resource-exhausted` means rate limit hit (1 per 7 days).
      const message = err?.message || 'Something went wrong. Please try again.';

      if (message.includes('one gym request per week') || message.includes('resource-exhausted')) {
        Alert.alert(
          'Request Limit Reached',
          'You can only submit one gym request per week. Please try again later.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', message, [{ text: 'OK' }]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text style={styles.successTitle}>Request Submitted</Text>
          <Text style={styles.successText}>
            Thanks for the suggestion! We'll review your request and add the gym
            if it meets our criteria.
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text style={styles.heading}>Request a Gym</Text>
          <Text style={styles.subheading}>
            Know a gym with basketball courts that should be on RunCheck?
            Let us know and we'll check it out.
          </Text>

          {/* Gym Name */}
          <Text style={styles.label}>Gym Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Planet Fitness - Round Rock"
            placeholderTextColor={colors.textMuted}
            value={gymName}
            onChangeText={setGymName}
            maxLength={200}
            autoCapitalize="words"
            returnKeyType="next"
          />

          {/* Address */}
          <Text style={styles.label}>Address *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 123 Main St, Round Rock, TX 78664"
            placeholderTextColor={colors.textMuted}
            value={address}
            onChangeText={setAddress}
            maxLength={300}
            autoCapitalize="words"
            returnKeyType="next"
          />

          {/* City + State row */}
          <View style={styles.row}>
            <View style={styles.rowFieldLarge}>
              <Text style={styles.label}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="Round Rock"
                placeholderTextColor={colors.textMuted}
                value={city}
                onChangeText={setCity}
                maxLength={100}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            <View style={styles.rowFieldSmall}>
              <Text style={styles.label}>State *</Text>
              <TextInput
                style={styles.input}
                placeholder="TX"
                placeholderTextColor={colors.textMuted}
                value={state}
                onChangeText={setState}
                maxLength={2}
                autoCapitalize="characters"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Type picker */}
          <Text style={styles.label}>Court Type</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.typeChip,
                  type === option.value && styles.typeChipActive,
                ]}
                onPress={() => setType(option.value)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    type === option.value && styles.typeChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Access type picker */}
          <Text style={styles.label}>Access Type</Text>
          <View style={styles.typeRow}>
            {ACCESS_TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.typeChip,
                  accessType === option.value && styles.typeChipActive,
                ]}
                onPress={() => setAccessType(option.value)}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    accessType === option.value && styles.typeChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Notes */}
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any details that would help us find and verify this gym — hours, number of courts, entry fee, membership requirements, etc."
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            maxLength={500}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Rate limit notice */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.infoText} />
            <Text style={styles.infoText}>
              You can submit one gym request per week. Make it count!
            </Text>
          </View>
        </ScrollView>

        {/* Fixed bottom bar — always visible above the keyboard */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Request</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      padding: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    bottomBar: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    heading: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
    },
    subheading: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      marginBottom: SPACING.xl,
      lineHeight: 20,
    },
    label: {
      fontSize: FONT_SIZES.caption,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textSecondary,
      marginBottom: SPACING.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: 12,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
      marginBottom: SPACING.md,
    },
    textArea: {
      minHeight: 80,
      paddingTop: 12,
    },
    row: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    rowFieldLarge: {
      flex: 2,
    },
    rowFieldSmall: {
      flex: 1,
    },
    typeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    typeChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 8,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
    },
    typeChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typeChipText: {
      fontSize: FONT_SIZES.caption,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.textSecondary,
    },
    typeChipTextActive: {
      color: '#FFFFFF',
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.infoBackground,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      gap: SPACING.xs,
    },
    infoText: {
      fontSize: FONT_SIZES.caption,
      color: colors.infoText,
      flex: 1,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: RADIUS.md,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
    },
    // Success state
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    successTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },
    successText: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: SPACING.xl,
    },
    doneButton: {
      backgroundColor: colors.primary,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.xl * 2,
      paddingVertical: 12,
    },
    doneButtonText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
    },
  });
