/**
 * PremiumScreen.js — RunCheck Premium Teaser
 *
 * UI-only. No billing, no Stripe, no RevenueCat, no in-app purchases.
 * Shows upcoming Premium features and pricing. CTA button fires a Coming Soon
 * alert — nothing more.
 *
 * Design follows the RunCheck dark theme:
 *   - useTheme for colors / isDark
 *   - Same card / spacing / typography tokens as ProfileScreen
 *   - RunCheck signature orange (#FF6B35) as the Premium accent
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, FONT_WEIGHTS, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';

// ─── Feature card data ────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: 'private-runs',
    icon: 'lock-closed-outline',
    title: 'Private Runs (Invite Only)',
    description:
      'Create your own curated runs with full control over who shows up and how competitive the game is.',
    bullets: [
      'Invite specific players by name',
      'Set a minimum skill level requirement',
      'Cap the roster (e.g. 10 players max)',
      'Run locks automatically when full',
    ],
    example: 'Invite Only Competitive Run — 10 players max',
    value:
      'Ideal for players who want high-quality games without random drop-ins.',
  },
  {
    id: 'skill-filter',
    icon: 'funnel-outline',
    title: 'Skill Level Filtering',
    description:
      'Filter every visible run by the skill level of the players currently checked in.',
    bullets: [
      'Beginner Friendly',
      'Casual',
      'Competitive',
      'High Level / Elite',
    ],
    advanced: 'Show only runs where the average skill level is 4 or higher.',
    value:
      'Solves one of the biggest problems in pickup basketball — mismatched competition.',
  },
  {
    id: 'smart-alerts',
    icon: 'notifications-outline',
    title: 'Smart Run Alerts',
    description:
      'Get live push notifications when runs heat up or match your preferences.',
    bullets: [
      'Clay Madsen run heating up (8 players now)',
      'Competitive run starting in your area',
      'Your friends just checked in nearby',
    ],
    value:
      'Helps you time exactly when to leave for the gym — never show up to an empty court again.',
  },
  {
    id: 'clips',
    icon: 'videocam-outline',
    title: 'Unlimited Run Clips',
    description:
      'Free users have clip upload limits. Premium removes them entirely.',
    freeVsPremium: {
      free: ['1 clip per run', '3 clips per week'],
      premium: ['Unlimited clips', 'Full highlight reel profile'],
    },
    value:
      'Build a personal basketball highlight portfolio that grows with every run.',
  },
  {
    id: 'badge',
    icon: 'shield-checkmark-outline',
    title: 'Premium Player Badge',
    description:
      'Get a visible Verified Hooper badge on your profile and in every run you join.',
    bullets: [
      'Verified Hooper badge on your profile',
      'Highlighted in player lists',
      'Featured placement in run rosters',
    ],
    value:
      'Status and recognition matter — this rewards players who are serious about the game.',
  },
];

// ─── Pricing tiers ────────────────────────────────────────────────────────────

const PRICING = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$4.99',
    period: '/ month',
    highlight: false,
  },
  {
    id: 'annual',
    label: 'Annual',
    price: '$29.99',
    period: '/ year',
    badge: 'Save 50%',
    highlight: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * PremiumScreen — RunCheck Premium teaser. No billing logic.
 *
 * @param {object}  props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 */
export default function PremiumScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const handleCtaPress = () => {
    Alert.alert(
      'Coming Soon',
      "RunCheck Premium is still in development. We'll notify you as soon as it launches.",
      [{ text: 'Got It', style: 'cancel' }]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Back nav ──────────────────────────────────────────────────────── */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={styles.backText}>Profile</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="flash" size={38} color="#FF6B35" />
          </View>
          <Text style={styles.heroTitle}>RunCheck Premium</Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>COMING SOON</Text>
          </View>
        </View>

        {/* ── Free vs Premium framing ──────────────────────────────────────── */}
        <View style={styles.framingCard}>
          <View style={styles.framingRow}>
            <View style={styles.framingCol}>
              <View style={[styles.framingPill, styles.framingPillFree]}>
                <Text style={[styles.framingPillText, styles.framingPillTextFree]}>Free</Text>
              </View>
              <Text style={styles.framingQuestion}>
                Where are people playing?
              </Text>
            </View>
            <View style={styles.framingDivider} />
            <View style={styles.framingCol}>
              <View style={[styles.framingPill, styles.framingPillPremium]}>
                <Ionicons name="flash" size={10} color="#FF6B35" style={{ marginRight: 3 }} />
                <Text style={[styles.framingPillText, styles.framingPillTextPremium]}>Premium</Text>
              </View>
              <Text style={[styles.framingQuestion, styles.framingQuestionPremium]}>
                Where are the BEST runs and how do I get into them?
              </Text>
            </View>
          </View>
        </View>

        {/* ── Pricing ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Pricing</Text>
        <View style={styles.pricingRow}>
          {PRICING.map((tier) => (
            <View
              key={tier.id}
              style={[styles.pricingCard, tier.highlight && styles.pricingCardHL]}
            >
              {tier.badge && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>{tier.badge}</Text>
                </View>
              )}
              <Text style={[styles.pricingLabel, tier.highlight && styles.pricingLabelHL]}>
                {tier.label}
              </Text>
              <Text style={[styles.pricingPrice, tier.highlight && styles.pricingPriceHL]}>
                {tier.price}
              </Text>
              <Text style={[styles.pricingPeriod, tier.highlight && styles.pricingPeriodHL]}>
                {tier.period}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Feature cards ───────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>What You Get</Text>

        {FEATURES.map((feature) => (
          <View key={feature.id} style={styles.featureCard}>

            {/* Card header */}
            <View style={styles.featureHeader}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={feature.icon} size={22} color="#FF6B35" />
              </View>
              <Text style={styles.featureTitle}>{feature.title}</Text>
            </View>

            {/* Description */}
            <Text style={styles.featureDesc}>{feature.description}</Text>

            {/* Bullet list (standard features) */}
            {feature.bullets && (
              <View style={styles.bulletList}>
                {feature.bullets.map((b) => (
                  <View key={b} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Advanced option (Skill Filtering only) */}
            {feature.advanced && (
              <View style={styles.advancedRow}>
                <Ionicons name="options-outline" size={13} color={colors.textMuted} />
                <Text style={styles.advancedText}>{feature.advanced}</Text>
              </View>
            )}

            {/* Free vs Premium comparison (Clips only) */}
            {feature.freeVsPremium && (
              <View style={styles.comparisonWrap}>
                <View style={styles.comparisonCol}>
                  <Text style={styles.comparisonHeader}>Free</Text>
                  {feature.freeVsPremium.free.map((item) => (
                    <View key={item} style={styles.comparisonRow}>
                      <Ionicons name="close-circle" size={14} color={colors.danger} />
                      <Text style={styles.comparisonText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.comparisonDivider} />
                <View style={styles.comparisonCol}>
                  <Text style={[styles.comparisonHeader, styles.comparisonHeaderPremium]}>
                    Premium
                  </Text>
                  {feature.freeVsPremium.premium.map((item) => (
                    <View key={item} style={styles.comparisonRow}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={[styles.comparisonText, styles.comparisonTextPremium]}>
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Example callout (Private Runs only) */}
            {feature.example && (
              <View style={styles.exampleWrap}>
                <Ionicons name="basketball-outline" size={13} color="#FF6B35" />
                <Text style={styles.exampleText}>{feature.example}</Text>
              </View>
            )}

            {/* Value statement */}
            <View style={styles.valueRow}>
              <Ionicons name="checkmark-done-outline" size={13} color={colors.textMuted} />
              <Text style={styles.valueText}>{feature.value}</Text>
            </View>

          </View>
        ))}

        {/* ── CTA button — Coming Soon, no billing ────────────────────────── */}
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={handleCtaPress}
        >
          <Ionicons name="flash" size={18} color="#FFFFFF" style={{ marginRight: SPACING.xs }} />
          <Text style={styles.ctaButtonText}>Premium Coming Soon</Text>
        </TouchableOpacity>

        <Text style={styles.ctaDisclaimer}>
          No payment required. We'll let you know when Premium launches.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ── Navigation ──
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xxs,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backText: {
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.medium,
      marginLeft: 2,
    },

    // ── Scroll ──
    scroll: {
      padding: SPACING.md,
      paddingBottom: SPACING.xxxl,
    },

    // ── Hero ──
    hero: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      marginBottom: SPACING.md,
    },
    heroIconWrap: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: '#FF6B3520',
      borderWidth: 2,
      borderColor: '#FF6B3555',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
      ...SHADOWS.glow,
    },
    heroTitle: {
      fontSize: FONT_SIZES.h1,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
      marginBottom: SPACING.sm,
      textAlign: 'center',
    },
    comingSoonBadge: {
      backgroundColor: '#FF6B3520',
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: '#FF6B3566',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xxs,
    },
    comingSoonText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FF6B35',
      letterSpacing: 1.4,
    },

    // ── Free vs Premium framing ──
    framingCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    },
    framingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    framingCol: {
      flex: 1,
    },
    framingDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginHorizontal: SPACING.sm,
      alignSelf: 'stretch',
    },
    framingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      marginBottom: SPACING.xs,
    },
    framingPillFree: {
      backgroundColor: colors.surfaceLight,
    },
    framingPillPremium: {
      backgroundColor: '#FF6B3520',
      borderWidth: 1,
      borderColor: '#FF6B3555',
    },
    framingPillText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.3,
    },
    framingPillTextFree: {
      color: colors.textMuted,
    },
    framingPillTextPremium: {
      color: '#FF6B35',
    },
    framingQuestion: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    framingQuestionPremium: {
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.semibold,
    },

    // ── Section label ──
    sectionLabel: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },

    // ── Pricing ──
    pricingRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    pricingCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      alignItems: 'center',
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    },
    pricingCardHL: {
      borderWidth: 2,
      borderColor: '#FF6B35',
      backgroundColor: isDark ? '#1F1510' : '#FFF3ED',
    },
    saveBadge: {
      backgroundColor: '#FF6B35',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      marginBottom: SPACING.xxs,
    },
    saveBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    pricingLabel: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: SPACING.xxs,
    },
    pricingLabelHL: {
      color: '#FF6B35',
    },
    pricingPrice: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: colors.textPrimary,
    },
    pricingPriceHL: {
      color: '#FF6B35',
    },
    pricingPeriod: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    pricingPeriodHL: {
      color: '#FF6B3599',
    },

    // ── Feature cards ──
    featureCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    },
    featureHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    featureIconWrap: {
      width: 42,
      height: 42,
      borderRadius: RADIUS.sm,
      backgroundColor: '#FF6B3518',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.sm,
      flexShrink: 0,
    },
    featureTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      flex: 1,
    },
    featureDesc: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: SPACING.sm,
    },

    // Bullet list
    bulletList: {
      marginBottom: SPACING.sm,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: SPACING.xxs,
    },
    bulletDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: '#FF6B35',
      marginTop: 6,
      marginRight: SPACING.xs,
      flexShrink: 0,
    },
    bulletText: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 19,
      flex: 1,
    },

    // Advanced option
    advancedRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? colors.surfaceLight : '#F9FAFB',
      borderRadius: RADIUS.sm,
      padding: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    advancedText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginLeft: SPACING.xxs,
      flex: 1,
      lineHeight: 17,
    },

    // Free vs Premium comparison (clips)
    comparisonWrap: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceLight : '#F9FAFB',
      borderRadius: RADIUS.sm,
      padding: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    comparisonCol: {
      flex: 1,
    },
    comparisonDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginHorizontal: SPACING.sm,
    },
    comparisonHeader: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: SPACING.xxs,
    },
    comparisonHeaderPremium: {
      color: '#FF6B35',
    },
    comparisonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    comparisonText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
      marginLeft: 4,
    },
    comparisonTextPremium: {
      color: colors.textPrimary,
    },

    // Example callout
    exampleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF6B3512',
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xxs,
      marginBottom: SPACING.sm,
      borderWidth: 1,
      borderColor: '#FF6B3530',
    },
    exampleText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.semibold,
      color: '#FF6B35',
      marginLeft: SPACING.xxs,
    },

    // Value statement
    valueRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: SPACING.xs,
      marginTop: SPACING.xxs,
    },
    valueText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginLeft: SPACING.xxs,
      flex: 1,
      lineHeight: 17,
      fontStyle: 'italic',
    },

    // ── CTA ──
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FF6B35',
      borderRadius: RADIUS.sm,
      paddingVertical: SPACING.sm + 4,
      marginBottom: SPACING.sm,
      ...SHADOWS.glow,
    },
    ctaButtonText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    ctaDisclaimer: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 17,
    },
  });
