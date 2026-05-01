/**
 * RatingPromptModal.js — "Enjoying RunCheck?" interstitial
 *
 * Shown at check-in milestones (5th, 20th, 50th...).
 * Directs happy users to the App Store rating sheet.
 * Directs unhappy users to support email — keeping bad reviews out of the store.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';

export default function RatingPromptModal({ visible, onLoveIt, onNotReally, onDismiss }) {
  const { colors, isDark } = useTheme();

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Dismiss X */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
            <Text style={styles.iconEmoji}>🏀</Text>
          </View>

          {/* Copy */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Enjoying RunCheck?
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            You've been putting in work on the court. Takes 10 seconds and helps us grow.
          </Text>

          {/* CTA buttons */}
          <TouchableOpacity
            style={[styles.loveItBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={onLoveIt}
          >
            <Ionicons name="star" size={16} color="#FFFFFF" />
            <Text style={styles.loveItText}>Yes, rate it!</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.notReallyBtn, { borderColor: colors.border }]}
            activeOpacity={0.7}
            onPress={onNotReally}
          >
            <Text style={[styles.notReallyText, { color: colors.textMuted }]}>
              Not really — send feedback
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  card: {
    width: '100%',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.small,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  loveItBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  loveItText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  notReallyBtn: {
    width: '100%',
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  notReallyText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
