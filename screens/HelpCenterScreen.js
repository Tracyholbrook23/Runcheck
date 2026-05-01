/**
 * HelpCenterScreen.js — In-app Help & FAQ
 *
 * Expandable FAQ sections covering every major feature in RunCheck.
 * Sections: Getting Started, Check-In, Runs, Reliability Score,
 *           Planning Visits, Profile & Points, Account & Settings.
 *
 * Navigation: Settings → Help Center
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';

const SUPPORT_EMAIL = 'support@theruncheck.app';

const FAQ_SECTIONS = [
  {
    title: 'Getting Started',
    icon: 'rocket-outline',
    color: '#F97316',
    questions: [
      {
        q: 'What is RunCheck?',
        a: 'RunCheck is a real-time app for pickup basketball players. You can find gyms near you, see who\'s currently playing, check in when you arrive, join or start group runs, plan future visits, and build a reliability score that shows the community how dependable you are.',
      },
      {
        q: 'How do I get started?',
        a: 'After signing up, set your home court in your profile and head to the Runs tab to see gyms near you. When you arrive at a gym, tap Check In to join the live count. If there\'s a group run happening, you can join it right from the gym page.',
      },
      {
        q: 'What cities is RunCheck available in?',
        a: 'RunCheck is currently active in Austin, TX and Lansing, MI — with more cities coming soon. If your city isn\'t listed yet, you can request a gym to help us expand.',
      },
    ],
  },
  {
    title: 'Check-In',
    icon: 'location-outline',
    color: '#22C55E',
    questions: [
      {
        q: 'How do I check in at a gym?',
        a: 'Tap the Check In tab at the bottom of the screen. Select your gym and tap the Check In button. You must be physically at the gym — RunCheck uses GPS to verify your location.',
      },
      {
        q: 'Why can\'t I check in?',
        a: 'There are two common reasons: (1) Location permission isn\'t granted — go to your device Settings > RunCheck > Location and set it to "While Using". (2) You\'re too far from the gym — each gym has a check-in radius (usually 100m). Make sure you\'re inside the building.',
      },
      {
        q: 'How long does a check-in last?',
        a: 'Check-ins automatically expire after 2 hours. If you\'re still at the gym, RunCheck will extend your session automatically as long as the app is open and GPS confirms you\'re still there.',
      },
      {
        q: 'Can I check in at multiple gyms at once?',
        a: 'No — you can only be checked in at one gym at a time. Checking in at a new gym automatically ends your current session.',
      },
      {
        q: 'What does checking in do for me?',
        a: 'Checking in adds you to the live player count so others can see the gym is active. It also awards you points, counts toward your attendance stats, and can fulfill a planned visit.',
      },
    ],
  },
  {
    title: 'Runs',
    icon: 'people-outline',
    color: '#3B82F6',
    questions: [
      {
        q: 'What is a run?',
        a: 'A run is a scheduled group game at a gym. When enough players want to play at the same time, someone starts a run. Others can join to lock in their spot and coordinate the game.',
      },
      {
        q: 'How do I start a run?',
        a: 'Go to the Runs tab, tap a gym, and tap "Start a Run." You\'ll set a time and run level (Casual, Mixed, or Competitive). Once created, other players at the gym can join.',
      },
      {
        q: 'What is the run merge rule?',
        a: 'If someone tries to create a run within 60 minutes of an existing run at the same gym, RunCheck automatically merges them into one run rather than creating duplicates. This keeps games organized.',
      },
      {
        q: 'What do the run levels mean?',
        a: 'Casual — recreational, just for fun. Competitive — serious players looking for a real game. Mixed — open to anyone regardless of skill. The creator sets this when starting the run.',
      },
      {
        q: 'Is there a limit to how many runs I can start?',
        a: 'Free accounts can start up to 3 runs per week. If your reliability score is below 50, you\'ll need to attend at least 3 sessions before you can create runs — this keeps the community trustworthy.',
      },
      {
        q: 'Can I chat with others in a run?',
        a: 'Yes — once you join a run, a group chat opens automatically. Only participants in the run can see or send messages. The chat stays open for 24 hours after the run starts.',
      },
    ],
  },
  {
    title: 'Reliability Score',
    icon: 'shield-checkmark-outline',
    color: '#F97316',
    questions: [
      {
        q: 'What is my reliability score?',
        a: 'Your reliability score (0–100) shows the community how dependable you are. It starts at 100 and changes based on whether you show up when you say you will.',
      },
      {
        q: 'How is the score calculated?',
        a: 'Score = 100 − (20 × no-shows) − (8 × late cancellations). It never goes below 0. Your score is locked at 100 until you\'ve attended at least 3 sessions — so new players aren\'t penalized before they\'ve had a chance to play.',
      },
      {
        q: 'What is a no-show?',
        a: 'A no-show happens when you plan a visit via the Plan tab but never check in before the session time passes. Each no-show deducts 20 points from your reliability score.',
      },
      {
        q: 'What is a late cancellation?',
        a: 'Cancelling a planned visit within 1 hour of the session start time counts as a late cancellation and deducts 8 points. Cancelling with more than 1 hour\'s notice has no penalty.',
      },
      {
        q: 'How do I improve my score?',
        a: 'Show up when you say you will. Every session you attend counts. If you need to cancel, do it early — more than 1 hour before the session to avoid a penalty.',
      },
      {
        q: 'What are the score tiers?',
        a: 'Elite (90–100) — top tier, highly trusted. Trusted (75–89) — solid track record. Reliable (60–74) — good standing. Fair (50–59) — room to improve. Low (below 50) — attendance has been inconsistent.',
      },
    ],
  },
  {
    title: 'Planning Visits',
    icon: 'calendar-outline',
    color: '#8B5CF6',
    questions: [
      {
        q: 'What is the Plan tab?',
        a: 'The Plan tab lets you schedule a future gym visit so other players know you\'re coming. It helps organize runs in advance and keeps your reliability score accurate.',
      },
      {
        q: 'What happens if I plan a visit but don\'t show up?',
        a: 'If you don\'t check in before your session time, it\'s automatically marked as a no-show and your reliability score drops by 20 points. Cancel early if your plans change.',
      },
      {
        q: 'How do I cancel a planned visit?',
        a: 'Go to the Plan tab, find your upcoming visit, and tap Cancel. You\'ll be asked to give a reason — this is saved to your session history. Cancel more than 1 hour early to avoid a penalty.',
      },
      {
        q: 'Can I plan a visit and also join a run?',
        a: 'Yes — planning a visit and joining a run are separate actions. You can do both. If you cancel your visit after already joining a run, RunCheck will ask if you want to leave the run too.',
      },
    ],
  },
  {
    title: 'Profile & Points',
    icon: 'person-outline',
    color: '#F59E0B',
    questions: [
      {
        q: 'How do I earn points?',
        a: 'Points are earned by: checking in at gyms, planning visits, attending sessions, starting runs, following gyms, writing reviews, and completing your profile. Points contribute to your rank tier.',
      },
      {
        q: 'What are rank tiers?',
        a: 'Ranks go from Bronze → Silver → Gold → Platinum → Diamond → Legend based on your total points. Higher ranks are displayed on your profile and signal your level of community involvement.',
      },
      {
        q: 'How do I set my home court?',
        a: 'Go to Profile → tap your profile card → Edit Profile, or set it during onboarding. Your home court appears on your profile and is highlighted on the Runs screen.',
      },
      {
        q: 'Can other players see my stats?',
        a: 'Your reliability score, rank, and home court are visible to others. Your full session history (attended, no-shows, cancellations) is private — only you can see it by tapping the stats on your own profile.',
      },
    ],
  },
  {
    title: 'Account & Settings',
    icon: 'settings-outline',
    color: '#6B7280',
    questions: [
      {
        q: 'How do I change my display name or Instagram?',
        a: 'Go to Profile → Settings → Account Info. You can update your display name, Instagram handle, and first/last name there.',
      },
      {
        q: 'Can I change my username?',
        a: 'No — usernames are permanent once set at signup. Your display name can be changed anytime.',
      },
      {
        q: 'How do I turn off notifications?',
        a: 'Go to Profile → Settings → Notifications. You can toggle individual notification types (runs, check-ins, messages) or turn them all off. If notifications are blocked at the system level, tap "Open Settings" to enable them.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Go to Profile → Settings → Delete Account. This permanently removes all your data including your profile, sessions, and messages. This action cannot be undone.',
      },
      {
        q: 'How do I request a new gym?',
        a: 'Go to the Runs tab and scroll to the bottom of the gym list. Tap "Request a Gym" to submit a gym for review. The RunCheck team will verify it and add it to the map.',
      },
    ],
  },
];

function FAQItem({ question, answer, colors, styles }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.75}
    >
      <View style={styles.faqRow}>
        <Text style={[styles.faqQuestion, { color: colors.textPrimary }]}>{question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </View>
      {expanded && (
        <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>{answer}</Text>
      )}
    </TouchableOpacity>
  );
}

function FAQSection({ section, colors, styles }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.75}
      >
        <View style={styles.sectionLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: section.color + '22' }]}>
            <Ionicons name={section.icon} size={18} color={section.color} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{section.title}</Text>
        </View>
        <View style={styles.sectionRight}>
          <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{section.questions.length}</Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {open && (
        <View style={[styles.sectionBody, { borderTopColor: colors.border }]}>
          {section.questions.map((item, i) => (
            <React.Fragment key={i}>
              <FAQItem
                question={item.q}
                answer={item.a}
                colors={colors}
                styles={styles}
              />
              {i < section.questions.length - 1 && (
                <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

export default function HelpCenterScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Find answers to common questions below. Tap any section to expand it.
        </Text>

        {FAQ_SECTIONS.map((section) => (
          <FAQSection
            key={section.title}
            section={section}
            colors={colors}
            styles={styles}
          />
        ))}

        {/* Contact support */}
        <View style={[styles.contactCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="mail-outline" size={22} color={colors.primary} />
          <View style={styles.contactText}>
            <Text style={[styles.contactTitle, { color: colors.textPrimary }]}>Still need help?</Text>
            <Text style={[styles.contactSub, { color: colors.textMuted }]}>Reach out and we'll get back to you.</Text>
          </View>
          <TouchableOpacity
            style={[styles.contactButton, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=RunCheck Help`)}
            activeOpacity={0.8}
          >
            <Text style={styles.contactButtonText}>Email Us</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: colors.textMuted }]}>RunCheck v1.0 · theruncheck.app</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.sm,
  },
  intro: {
    fontSize: FONT_SIZES.small,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  sectionCount: {
    fontSize: FONT_SIZES.xs,
  },
  sectionBody: {
    borderTopWidth: 1,
  },
  // ── FAQ item ───────────────────────────────────────────────────────────────
  faqItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  faqQuestion: {
    flex: 1,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: FONT_SIZES.small,
    lineHeight: 21,
    marginTop: SPACING.xs,
  },
  itemDivider: {
    height: 1,
    marginHorizontal: SPACING.md,
  },
  // ── Contact card ───────────────────────────────────────────────────────────
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.xs,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  contactText: { flex: 1 },
  contactTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  contactSub: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  contactButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    textAlign: 'center',
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.md,
  },
});
