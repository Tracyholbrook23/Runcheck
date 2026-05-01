/**
 * ScreenHelpButton.js — Contextual help button for main screens.
 *
 * Renders a small "?" icon that opens a bottom-sheet modal with
 * screen-specific tips. Pass a `screen` prop matching one of the
 * keys in SCREEN_HELP below.
 *
 * Usage:
 *   import ScreenHelpButton from '../components/ScreenHelpButton';
 *   // In your header JSX:
 *   <ScreenHelpButton screen="runs" />
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';

const SCREEN_HELP = {
  home: {
    title: 'Home Screen',
    icon: 'home-outline',
    tips: [
      { icon: 'people-outline', text: 'Live Runs Near You shows active group games happening right now at gyms in your area.' },
      { icon: 'home-outline', text: 'Your Home Court is your go-to gym. Tap it to jump straight to that gym\'s runs and live count.' },
      { icon: 'pulse-outline', text: 'Community Activity shows recent check-ins and new runs from players near you.' },
      { icon: 'chatbubble-outline', text: 'Tap the message icon at the top to access your DMs and run group chats.' },
    ],
  },
  runs: {
    title: 'Runs',
    icon: 'basketball-outline',
    tips: [
      { icon: 'search-outline', text: 'Browse gyms near you. The number on each gym shows how many players are there right now.' },
      { icon: 'people-outline', text: 'Tap a gym to see active runs, join one, or start your own.' },
      { icon: 'notifications-outline', text: 'Tap "Notify Me" on a gym to get alerts when a run starts or players check in.' },
      { icon: 'filter-outline', text: 'Use the filter button to search by gym name, indoor/outdoor, or free/paid access.' },
    ],
  },
  checkin: {
    title: 'Check In',
    icon: 'location-outline',
    tips: [
      { icon: 'location-outline', text: 'You must be physically at the gym to check in. RunCheck uses GPS to verify — usually within 100 meters.' },
      { icon: 'time-outline', text: 'Check-ins last 2 hours. If you\'re still there, your session extends automatically while the app is open.' },
      { icon: 'alert-circle-outline', text: 'Can\'t check in? Make sure location permission is set to "While Using" in your device Settings.' },
      { icon: 'phone-portrait-outline', text: 'Phone died before you could check in? Contact support — we can review your case.' },
    ],
  },
  plan: {
    title: 'Plan a Visit',
    icon: 'calendar-outline',
    tips: [
      { icon: 'calendar-outline', text: 'Plan ahead by scheduling a future visit. Other players can see you\'re coming and runs form more easily.' },
      { icon: 'shield-checkmark-outline', text: 'If you plan a visit but don\'t check in, it\'s a no-show — which lowers your reliability score by 20 points.' },
      { icon: 'close-circle-outline', text: 'Cancel early — more than 1 hour before your session — to avoid a late cancellation penalty.' },
      { icon: 'checkmark-circle-outline', text: 'When you check in after planning, your visit is automatically marked as Attended.' },
    ],
  },
  profile: {
    title: 'Your Profile',
    icon: 'person-outline',
    tips: [
      { icon: 'shield-checkmark-outline', text: 'Your Reliability Score shows how dependable you are. It starts at 100 and changes based on your attendance.' },
      { icon: 'stats-chart-outline', text: 'Tap any stat (Scheduled, Attended, No-Shows, Cancelled) to see your full session history.' },
      { icon: 'trophy-outline', text: 'Points earn you rank tiers — from Bronze to Legend. Every check-in, run, and review earns points.' },
      { icon: 'settings-outline', text: 'Go to Settings to edit your profile, manage notifications, and access the Help Center.' },
    ],
  },
};

export default function ScreenHelpButton({ screen }) {
  const { colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const help = SCREEN_HELP[screen];
  if (!help) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name={help.icon} size={20} color={colors.primary} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{help.title}</Text>
            <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Tips */}
          {help.tips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={[styles.tipIconWrap, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name={tip.icon} size={16} color={colors.primary} />
              </View>
              <Text style={[styles.tipText, { color: colors.textSecondary }]}>{tip.text}</Text>
            </View>
          ))}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Contact Support */}
          <TouchableOpacity
            style={[styles.supportButton, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '33' }]}
            activeOpacity={0.75}
            onPress={() => {
              Linking.openURL('mailto:support@runcheck.app?subject=RunCheck%20Support%20Request');
            }}
          >
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <Text style={[styles.supportButtonText, { color: colors.primary }]}>Email Support</Text>
          </TouchableOpacity>

          {/* Help Center link hint */}
          <Text style={[styles.moreHint, { color: colors.textMuted }]}>
            More questions? Go to Profile → Settings → Help Center
          </Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl + 16,
    gap: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sheetIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  tipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZES.small,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.xs,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  supportButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  moreHint: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
