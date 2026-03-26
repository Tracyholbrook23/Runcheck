/**
 * ReportModal.js — Reusable Report Modal
 *
 * Bottom-sheet-style modal for reporting content (clips, players, runs, gyms).
 * Users select a reason and optionally add a description. The report is
 * submitted via the `submitReport` Cloud Function, which enforces duplicate
 * prevention server-side (one report per user per item).
 *
 * Usage:
 *   <ReportModal
 *     visible={showReport}
 *     onClose={() => setShowReport(false)}
 *     type="clip"           // "clip" | "player" | "run" | "gym"
 *     targetId={clipId}
 *   />
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  InputAccessoryView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { callFunction, auth } from '../config/firebase';
import { blockUser } from '../services/dmService';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { sanitizeFreeText } from '../utils/sanitize';

// ---------------------------------------------------------------------------
// Reason options
// ---------------------------------------------------------------------------

const REASON_OPTIONS = [
  { label: 'Inappropriate Content', value: 'inappropriate' },
  { label: 'Spam', value: 'spam' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Misleading Info', value: 'misleading' },
  { label: 'Other', value: 'other' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const INPUT_ACCESSORY_ID = 'reportDescriptionDone';

export default function ReportModal({ visible, onClose, type, targetId, messageContext, blockSenderId }) {
  const { colors, isDark } = useTheme();
  const [reason, setReason] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // "Also block" toggle — only shown for message reports when blockSenderId is provided
  const [alsoBlock, setAlsoBlock] = useState(false);
  const descriptionRef = useRef(null);
  const scrollRef = useRef(null);
  const descriptionYRef = useRef(0);

  const canSubmit = reason !== null && !submitting;

  const resetForm = () => {
    setReason(null);
    setDescription('');
    setAlsoBlock(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const payload = {
        type,
        targetId,
        reason,
      };
      if (description.trim().length > 0) {
        payload.description = description.trim();
      }
      if (messageContext) {
        payload.messageContext = messageContext;
      }
      await callFunction('submitReport', payload);

      // Block the sender if the toggle was selected — best-effort, non-blocking
      let blocked = false;
      if (alsoBlock && blockSenderId) {
        const currentUid = auth.currentUser?.uid;
        if (currentUid) {
          try {
            await blockUser(currentUid, blockSenderId);
            blocked = true;
          } catch (blockErr) {
            // Non-critical — arrayUnion is idempotent so this only fails on
            // permission or network issues. Proceed without surfacing the error.
            if (__DEV__) console.warn('[ReportModal] blockUser error:', blockErr.message);
          }
        }
      }

      resetForm();
      onClose();
      Alert.alert(
        'Report Submitted',
        blocked
          ? 'Your report has been submitted and the user has been blocked. They will no longer be able to message you.'
          : 'Thanks for letting us know. We\'ll review this report shortly.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      const message = err?.message || 'Something went wrong. Please try again.';
      if (message.includes('already reported') || message.includes('already-exists')) {
        Alert.alert(
          'Already Reported',
          'You have already reported this item.',
          [{ text: 'OK' }]
        );
        resetForm();
        onClose();
      } else {
        Alert.alert('Error', message, [{ text: 'OK' }]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel =
    type === 'clip' ? 'clip' :
    type === 'player' ? 'player' :
    type === 'run' ? 'run' :
    type === 'gym' ? 'gym' :
    type === 'message' ? 'message' : 'item';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.backdrop}>
            <TouchableOpacity
              style={styles.backdropDismiss}
              activeOpacity={1}
              onPress={handleClose}
            />
            <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
              <ScrollView
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {/* Header */}
                <View style={styles.header}>
                  <Ionicons name="flag-outline" size={22} color={colors.error || '#EF4444'} />
                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Report {typeLabel}
                  </Text>
                </View>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Why are you reporting this {typeLabel}?
                </Text>

                {/* Message preview — shown for message reports */}
                {messageContext?.messageText ? (
                  <View style={[styles.messagePreview, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6', borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]}>
                    <Text style={[styles.messagePreviewText, { color: colors.textSecondary }]} numberOfLines={3}>
                      "{messageContext.messageText}"
                    </Text>
                  </View>
                ) : null}

                {/* Reason selector */}
                <View style={styles.reasonList}>
                  {REASON_OPTIONS.map((option) => {
                    const isSelected = reason === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.reasonRow,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(255,107,53,0.12)' : '#FFF3ED')
                              : (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'),
                            borderColor: isSelected
                              ? colors.primary
                              : (isDark ? 'rgba(255,255,255,0.1)' : colors.border),
                          },
                        ]}
                        onPress={() => setReason(option.value)}
                        activeOpacity={0.7}
                      >
                        <View style={[
                          styles.radio,
                          {
                            borderColor: isSelected ? colors.primary : colors.textMuted,
                          },
                        ]}>
                          {isSelected && (
                            <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                          )}
                        </View>
                        <Text style={[
                          styles.reasonLabel,
                          { color: isSelected ? colors.textPrimary : colors.textSecondary },
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Optional description */}
                <View
                  onLayout={(e) => { descriptionYRef.current = e.nativeEvent.layout.y; }}
                >
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Additional details (optional)
                  </Text>
                  <TextInput
                    ref={descriptionRef}
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
                        color: colors.textPrimary,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
                      },
                    ]}
                    value={description}
                    onChangeText={(text) => setDescription(sanitizeFreeText(text, 500))}
                    placeholder="Tell us more about the issue..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                    inputAccessoryViewID={Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined}
                    onFocus={() => {
                      // Small delay lets the keyboard finish animating before we scroll
                      setTimeout(() => {
                        scrollRef.current?.scrollTo({ y: descriptionYRef.current, animated: true });
                      }, 300);
                    }}
                  />
                </View>

                {/* "Also block this user" toggle — message reports only */}
                {type === 'message' && blockSenderId ? (
                  <TouchableOpacity
                    style={[
                      styles.alsoBlockRow,
                      {
                        backgroundColor: alsoBlock
                          ? (isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2')
                          : (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'),
                        borderColor: alsoBlock
                          ? (isDark ? 'rgba(239,68,68,0.4)' : '#FECACA')
                          : (isDark ? 'rgba(255,255,255,0.1)' : colors.border),
                      },
                    ]}
                    onPress={() => setAlsoBlock((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={alsoBlock ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={alsoBlock ? '#EF4444' : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alsoBlockLabel, { color: alsoBlock ? '#EF4444' : colors.textSecondary }]}>
                        Also block this user
                      </Text>
                      <Text style={[styles.alsoBlockSub, { color: colors.textMuted }]}>
                        They won't be able to message you
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {/* Buttons */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    onPress={handleClose}
                    disabled={submitting}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      { backgroundColor: colors.error || '#EF4444' },
                      !canSubmit && styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.submitBtnText}>Submit Report</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* iOS "Done" button above the keyboard */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          <View style={[styles.accessoryBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={[styles.accessoryDone, { color: colors.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl + 10,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xxs,
  },
  title: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  messagePreview: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  messagePreviewText: {
    fontSize: FONT_SIZES.body,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  reasonList: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reasonLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  inputLabel: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  input: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZES.body,
    minHeight: 70,
    marginBottom: SPACING.md,
  },
  alsoBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  alsoBlockLabel: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  alsoBlockSub: {
    fontSize: FONT_SIZES.caption,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  submitBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  // iOS "Done" accessory bar
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryDone: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
});
