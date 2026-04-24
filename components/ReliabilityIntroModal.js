/**
 * ReliabilityIntroModal.js — One-time reliability explanation modal
 *
 * Shown the first time a user takes an action that is tracked by the
 * reliability system: scheduling a visit, joining a run, or starting a run.
 *
 * Once the user taps "Got It", the flag `users/{uid}.hasSeenReliabilityWarning`
 * is set to true so the modal never appears again for that account.
 *
 * Usage:
 *   <ReliabilityIntroModal
 *     visible={showModal}
 *     onConfirm={handleConfirm}   // called after flag is written — execute the real action here
 *     onDismiss={() => setShowModal(false)}  // user closed without confirming
 *   />
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

const BULLETS = [
  {
    icon: 'checkmark-circle',
    color: '#22C55E',
    text: 'Show up to games you schedule or join — your score goes up.',
  },
  {
    icon: 'close-circle',
    color: '#EF4444',
    text: 'No-show or cancel within 60 min — your score takes a hit.',
  },
  {
    icon: 'trending-up',
    color: '#F97316',
    text: 'Your reliability score is visible to other players. Keep it high.',
  },
];

export default function ReliabilityIntroModal({ visible, onConfirm, onDismiss }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [saving, setSaving] = useState(false);

  const handleGotIt = async () => {
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await updateDoc(doc(db, 'users', uid), { hasSeenReliabilityWarning: true });
      }
    } catch (err) {
      if (__DEV__) console.warn('[ReliabilityIntroModal] flag write error:', err);
      // Non-fatal — proceed regardless so the user isn't blocked
    } finally {
      setSaving(false);
      onConfirm?.();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>

          {/* Header icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={30} color="#F97316" />
          </View>

          {/* Title */}
          <Text style={styles.title}>RunCheck Tracks Reliability</Text>
          <Text style={styles.subtitle}>
            Your reliability score is based on whether you follow through on
            games you commit to. Here's what you need to know:
          </Text>

          {/* Bullet list */}
          <View style={styles.bulletList}>
            {BULLETS.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <Ionicons name={b.icon} size={20} color={b.color} style={styles.bulletIcon} />
                <Text style={styles.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleGotIt}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmButtonText}>Got It — I'll Show Up</Text>
            )}
          </TouchableOpacity>

          {/* Dismiss */}
          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton} disabled={saving}>
            <Text style={styles.dismissText}>Remind me later</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: isDark ? '#111111' : '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl ?? 24,
    borderTopRightRadius: RADIUS.xl ?? 24,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl + 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(249,115,22,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.h2 ?? 20,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  bulletList: {
    width: '100%',
    marginBottom: SPACING.xl,
    gap: SPACING.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bulletIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: FONT_SIZES.small,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  confirmButton: {
    width: '100%',
    backgroundColor: '#F97316',
    paddingVertical: 15,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  confirmButtonText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  dismissButton: {
    paddingVertical: SPACING.sm,
  },
  dismissText: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
});
