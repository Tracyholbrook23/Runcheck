/**
 * CreatePrivateRunScreen.js — Private & Paid Run Creator (Premium Teaser)
 *
 * UI-only teaser for two upcoming Premium features:
 *
 *   1. Private Run (Invite Only) — organizer controls who gets in via invite.
 *   2. Paid Run — organizer sets an entry fee; players pay in-app and the
 *      organizer receives the bulk of the payout (RunCheck keeps a small cut).
 *
 * The entire form is interactive so users can explore the experience, but
 * the final CTA button surfaces a "Coming Soon / Premium Only" block screen
 * instead of actually creating anything.
 *
 * Designed as a full-screen navigation push so it feels like a real flow.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { FONT_SIZES, FONT_WEIGHTS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_FEE_PCT = 0.10; // RunCheck takes 10%
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatCurrency — Formats a number as a dollar string, e.g. 9 → "$9.00"
 */
const formatCurrency = (n) =>
  `$${Number(n).toFixed(2)}`;

// ─────────────────────────────────────────────────────────────────────────────

export default function CreatePrivateRunScreen({ route, navigation }) {
  // runType: 'private' | 'paid' — passed via route params, defaulting to 'private'
  const initialType = route?.params?.runType ?? 'private';

  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [runType, setRunType] = useState(initialType); // 'private' | 'paid'

  // ── Shared form fields ─────────────────────────────────────────────────────
  const [gymName, setGymName]       = useState('');
  const [gymAddress, setGymAddress] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [runDate, setRunDate]       = useState('');   // simple text, UI teaser only
  const [runTime, setRunTime]       = useState('');

  // ── Private-run specific ───────────────────────────────────────────────────
  const [minSkill, setMinSkill]     = useState(null); // null | 1-5

  // ── Paid-run specific ─────────────────────────────────────────────────────
  const [entryFeeText, setEntryFeeText] = useState('');
  const entryFee = parseFloat(entryFeeText) || 0;

  // ── Payout math ───────────────────────────────────────────────────────────
  const grossIfFull    = entryFee * maxPlayers;
  const platformCut    = grossIfFull * PLATFORM_FEE_PCT;
  const youReceiveFull = grossIfFull - platformCut;
  const perPlayerYou   = entryFee * (1 - PLATFORM_FEE_PCT);

  // ── Coming Soon gate modal ─────────────────────────────────────────────────
  const [gateVisible, setGateVisible] = useState(false);

  const handleIncrementPlayers = () => setMaxPlayers((p) => Math.min(p + 1, MAX_PLAYERS));
  const handleDecrementPlayers = () => setMaxPlayers((p) => Math.max(p - 1, MIN_PLAYERS));

  const handleCreateRun = useCallback(() => {
    setGateVisible(true);
  }, []);

  // ── Skill level labels ─────────────────────────────────────────────────────
  const SKILL_LEVELS = [
    { value: null, label: 'Any' },
    { value: 1, label: 'Beginner' },
    { value: 2, label: 'Casual' },
    { value: 3, label: 'Competitive' },
    { value: 4, label: 'Elite' },
  ];

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Nav bar ─────────────────────────────────────────────────────── */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Create a Run</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Run type toggle ───────────────────────────────────────────── */}
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeTab, runType === 'private' && styles.typeTabActive]}
              onPress={() => setRunType('private')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="lock-closed-outline"
                size={15}
                color={runType === 'private' ? '#FFFFFF' : colors.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.typeTabText, runType === 'private' && styles.typeTabTextActive]}>
                Private Run
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeTab, runType === 'paid' && styles.typeTabActivePaid]}
              onPress={() => setRunType('paid')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="cash-outline"
                size={15}
                color={runType === 'paid' ? '#FFFFFF' : colors.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.typeTabText, runType === 'paid' && styles.typeTabTextActive]}>
                Paid Run
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Type description banner ───────────────────────────────────── */}
          <View style={[styles.typeBanner, runType === 'paid' && styles.typeBannerPaid]}>
            <Ionicons
              name={runType === 'private' ? 'lock-closed' : 'cash'}
              size={16}
              color={runType === 'private' ? colors.primary : '#22C55E'}
              style={{ marginRight: SPACING.sm }}
            />
            <Text style={styles.typeBannerText}>
              {runType === 'private'
                ? 'Only players you invite can join. You control the roster and skill level.'
                : 'Charge players an entry fee. You set the price — we handle the payments.'}
            </Text>
          </View>

          {/* ── Premium badge ─────────────────────────────────────────────── */}
          <View style={styles.premiumBadgeRow}>
            <Ionicons name="flash" size={13} color="#FF6B35" style={{ marginRight: 4 }} />
            <Text style={styles.premiumBadgeText}>Premium Feature — Coming Soon</Text>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              FORM FIELDS
          ══════════════════════════════════════════════════════════════ */}

          {/* ── Gym Info ──────────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Gym / Location</Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputWrap}>
              <Ionicons name="business-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Gym name"
                placeholderTextColor={colors.textMuted}
                value={gymName}
                onChangeText={setGymName}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.inputWrap, styles.inputWrapBorderTop]}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Address"
                placeholderTextColor={colors.textMuted}
                value={gymAddress}
                onChangeText={setGymAddress}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* ── Date & Time ───────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Date & Time</Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <View style={[styles.inputWrap, { flex: 1 }]}>
                <Ionicons name="calendar-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Date (e.g. Mar 25)"
                  placeholderTextColor={colors.textMuted}
                  value={runDate}
                  onChangeText={setRunDate}
                />
              </View>
              <View style={{ width: SPACING.sm }} />
              <View style={[styles.inputWrap, { flex: 1 }]}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Time (e.g. 7:00 PM)"
                  placeholderTextColor={colors.textMuted}
                  value={runTime}
                  onChangeText={setRunTime}
                />
              </View>
            </View>
          </View>

          {/* ── Players ───────────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Max Players</Text>

          <View style={styles.stepperCard}>
            <Text style={styles.stepperLabel}>Roster limit</Text>
            <View style={styles.stepperControls}>
              <TouchableOpacity
                style={[styles.stepperBtn, maxPlayers <= MIN_PLAYERS && styles.stepperBtnDisabled]}
                onPress={handleDecrementPlayers}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={18} color={maxPlayers <= MIN_PLAYERS ? colors.textMuted : colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{maxPlayers}</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, maxPlayers >= MAX_PLAYERS && styles.stepperBtnDisabled]}
                onPress={handleIncrementPlayers}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={maxPlayers >= MAX_PLAYERS ? colors.textMuted : colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Min Skill Level (Private only) ────────────────────────────── */}
          {runType === 'private' && (
            <>
              <Text style={styles.sectionLabel}>Minimum Skill Level</Text>
              <View style={styles.skillRow}>
                {SKILL_LEVELS.map((s) => (
                  <TouchableOpacity
                    key={String(s.value)}
                    style={[styles.skillChip, minSkill === s.value && styles.skillChipActive]}
                    onPress={() => setMinSkill(s.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.skillChipText, minSkill === s.value && styles.skillChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ── Entry Fee + Payout Preview (Paid only) ────────────────────── */}
          {runType === 'paid' && (
            <>
              <Text style={styles.sectionLabel}>Entry Fee</Text>

              <View style={styles.inputGroup}>
                <View style={styles.inputWrap}>
                  <Text style={styles.currencyPrefix}>$</Text>
                  <TextInput
                    style={[styles.input, styles.inputFee]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    value={entryFeeText}
                    onChangeText={(t) => setEntryFeeText(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.currencySuffix}>per player</Text>
                </View>
              </View>

              {/* ── Payout preview card ────────────────────────────────────── */}
              <View style={styles.payoutCard}>
                <View style={styles.payoutCardHeader}>
                  <Ionicons name="wallet-outline" size={16} color="#22C55E" style={{ marginRight: 6 }} />
                  <Text style={styles.payoutCardTitle}>Your Estimated Payout</Text>
                </View>

                <View style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>Entry fee × max players</Text>
                  <Text style={styles.payoutValue}>
                    {formatCurrency(entryFee)} × {maxPlayers} = {formatCurrency(grossIfFull)}
                  </Text>
                </View>

                <View style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>RunCheck platform fee (10%)</Text>
                  <Text style={styles.payoutValueDeduct}>− {formatCurrency(platformCut)}</Text>
                </View>

                <View style={styles.payoutDivider} />

                <View style={styles.payoutRow}>
                  <Text style={styles.payoutTotalLabel}>You receive (if full)</Text>
                  <Text style={styles.payoutTotalValue}>{formatCurrency(youReceiveFull)}</Text>
                </View>

                <View style={styles.payoutPerPlayerRow}>
                  <Ionicons name="person-outline" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
                  <Text style={styles.payoutPerPlayer}>
                    {formatCurrency(perPlayerYou)} per player that joins
                  </Text>
                </View>
              </View>

              <Text style={styles.payoutDisclaimer}>
                Payouts are sent after the run ends. RunCheck keeps 10% to cover payment processing and platform costs.
              </Text>
            </>
          )}

          {/* ── Summary card ─────────────────────────────────────────────── */}
          {(gymName || gymAddress) && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>
                {runType === 'private' ? '🔒 Private Run' : '💰 Paid Run'}
              </Text>
              {gymName ? <Text style={styles.summaryLine}>📍 {gymName}{gymAddress ? `, ${gymAddress}` : ''}</Text> : null}
              {runDate || runTime ? <Text style={styles.summaryLine}>🗓 {[runDate, runTime].filter(Boolean).join(' · ')}</Text> : null}
              <Text style={styles.summaryLine}>👥 Up to {maxPlayers} players</Text>
              {runType === 'paid' && entryFee > 0 && (
                <Text style={styles.summaryLine}>💵 {formatCurrency(entryFee)} entry · You keep {formatCurrency(perPlayerYou)}/player</Text>
              )}
              {runType === 'private' && minSkill !== null && (
                <Text style={styles.summaryLine}>
                  ⭐ Min skill: {SKILL_LEVELS.find((s) => s.value === minSkill)?.label}
                </Text>
              )}
            </View>
          )}

          {/* ── CTA Button ────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.ctaBtn, runType === 'paid' && styles.ctaBtnPaid]}
            onPress={handleCreateRun}
            activeOpacity={0.85}
          >
            <Ionicons
              name={runType === 'private' ? 'lock-closed' : 'flash'}
              size={18}
              color="#FFFFFF"
              style={{ marginRight: SPACING.xs }}
            />
            <Text style={styles.ctaBtnText}>
              {runType === 'private' ? 'Create Private Run' : 'Create Paid Run'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.ctaNote}>
            {runType === 'private'
              ? 'Only invited players will be able to join.'
              : 'Players will be charged at the time they join.'}
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Coming Soon / Premium Gate Modal ─────────────────────────────── */}
      <Modal
        visible={gateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGateVisible(false)}
      >
        <View style={styles.gateOverlay}>
          <View style={styles.gateCard}>

            {/* Icon */}
            <View style={styles.gateIconWrap}>
              <Ionicons name="flash" size={36} color="#FF6B35" />
            </View>

            {/* Headline */}
            <Text style={styles.gateTitle}>Premium Feature</Text>
            <Text style={styles.gateSubtitle}>
              {runType === 'private'
                ? 'Private invite-only runs are available to RunCheck Premium subscribers.'
                : 'Hosting paid runs and collecting entry fees is a Premium-only feature.'}
            </Text>

            {/* Coming soon badge */}
            <View style={styles.gateComingSoonBadge}>
              <Text style={styles.gateComingSoonText}>COMING SOON</Text>
            </View>

            <Text style={styles.gateBody}>
              {runType === 'paid'
                ? `You built a great run — ${gymName || 'your gym'}, ${maxPlayers} players at ${formatCurrency(entryFee)} each. When Premium launches you'll be ready to host it and collect ${formatCurrency(youReceiveFull > 0 ? youReceiveFull : 0)}.`
                : `Your private run at ${gymName || 'your gym'} is ready to go. Upgrade to Premium when it launches to start inviting players.`}
            </Text>

            {/* Actions */}
            <TouchableOpacity
              style={styles.gateUpgradeBtn}
              onPress={() => {
                setGateVisible(false);
                navigation.navigate('Premium');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="flash" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.gateUpgradeBtnText}>See Premium Features</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gateDismissBtn}
              onPress={() => setGateVisible(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.gateDismissBtnText}>Maybe Later</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

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

    // ── Nav ──
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 60,
    },
    backText: {
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.medium,
      marginLeft: 2,
    },
    navTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },

    scroll: {
      padding: SPACING.md,
      paddingBottom: 60,
    },

    // ── Type toggle ──
    typeToggle: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surface : '#F3F4F6',
      borderRadius: RADIUS.full,
      padding: 3,
      marginBottom: SPACING.md,
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    },
    typeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
    },
    typeTabActive: {
      backgroundColor: colors.primary,
    },
    typeTabActivePaid: {
      backgroundColor: '#22C55E',
    },
    typeTabText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textMuted,
    },
    typeTabTextActive: {
      color: '#FFFFFF',
    },

    // ── Type banner ──
    typeBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? `${colors.primary}18` : `${colors.primary}12`,
      borderRadius: RADIUS.md,
      padding: SPACING.sm,
      marginBottom: SPACING.sm,
      borderWidth: 1,
      borderColor: isDark ? `${colors.primary}40` : `${colors.primary}30`,
    },
    typeBannerPaid: {
      backgroundColor: isDark ? '#22C55E18' : '#22C55E10',
      borderColor: isDark ? '#22C55E40' : '#22C55E30',
    },
    typeBannerText: {
      flex: 1,
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 19,
    },

    // ── Premium badge ──
    premiumBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: '#FF6B3515',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      marginBottom: SPACING.lg,
      borderWidth: 1,
      borderColor: '#FF6B3535',
    },
    premiumBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FF6B35',
      letterSpacing: 0.3,
    },

    // ── Section label ──
    sectionLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: SPACING.xs,
    },

    // ── Input group card ──
    inputGroup: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      marginBottom: SPACING.md,
      overflow: 'hidden',
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    },
    inputRow: {
      flexDirection: 'row',
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      minHeight: 50,
    },
    inputWrapBorderTop: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    inputIcon: {
      marginRight: SPACING.sm,
      flexShrink: 0,
    },
    input: {
      flex: 1,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    inputFee: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
    },
    currencyPrefix: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginRight: 2,
    },
    currencySuffix: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      marginLeft: SPACING.xs,
    },

    // ── Player stepper ──
    stepperCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    },
    stepperLabel: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
    },
    stepperControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    stepperBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? colors.surfaceLight : '#F3F4F6',
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepperBtnDisabled: {
      opacity: 0.4,
    },
    stepperValue: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      minWidth: 36,
      textAlign: 'center',
    },

    // ── Skill level chips ──
    skillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      marginBottom: SPACING.md,
    },
    skillChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skillChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    skillChipText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textSecondary,
    },
    skillChipTextActive: {
      color: '#FFFFFF',
      fontWeight: FONT_WEIGHTS.semibold,
    },

    // ── Payout card ──
    payoutCard: {
      backgroundColor: isDark ? '#0D2015' : '#F0FDF4',
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.xs,
      borderWidth: 1,
      borderColor: isDark ? '#22C55E35' : '#86EFAC',
    },
    payoutCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    payoutCardTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#4ADE80' : '#15803D',
    },
    payoutRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    payoutLabel: {
      fontSize: FONT_SIZES.small,
      color: isDark ? '#86EFAC' : '#166534',
      flex: 1,
    },
    payoutValue: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: isDark ? '#D1FAE5' : '#166534',
    },
    payoutValueDeduct: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: isDark ? '#FCA5A5' : '#DC2626',
    },
    payoutDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? '#22C55E40' : '#86EFAC',
      marginVertical: SPACING.xs,
    },
    payoutTotalLabel: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#4ADE80' : '#15803D',
    },
    payoutTotalValue: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: '#22C55E',
    },
    payoutPerPlayerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.xs,
    },
    payoutPerPlayer: {
      fontSize: FONT_SIZES.xs,
      color: isDark ? '#86EFAC' : '#166534',
      fontStyle: 'italic',
    },
    payoutDisclaimer: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      lineHeight: 16,
      marginBottom: SPACING.md,
    },

    // ── Summary card ──
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    summaryTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
    },
    summaryLine: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    // ── CTA ──
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      marginBottom: SPACING.xs,
      ...SHADOWS.glow,
    },
    ctaBtnPaid: {
      backgroundColor: '#22C55E',
    },
    ctaBtnText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    ctaNote: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: SPACING.xl,
    },

    // ── Premium gate modal ──
    gateOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    gateCard: {
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      borderRadius: RADIUS.xl ?? 20,
      padding: SPACING.lg,
      width: '100%',
      alignItems: 'center',
    },
    gateIconWrap: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: '#FF6B3520',
      borderWidth: 2,
      borderColor: '#FF6B3550',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    gateTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: isDark ? '#FFFFFF' : '#111111',
      marginBottom: SPACING.xs,
      textAlign: 'center',
    },
    gateSubtitle: {
      fontSize: FONT_SIZES.small,
      color: isDark ? '#AEAEB2' : '#6B7280',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: SPACING.sm,
    },
    gateComingSoonBadge: {
      backgroundColor: '#FF6B3520',
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: '#FF6B3555',
      paddingHorizontal: SPACING.md,
      paddingVertical: 4,
      marginBottom: SPACING.md,
    },
    gateComingSoonText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FF6B35',
      letterSpacing: 1.4,
    },
    gateBody: {
      fontSize: FONT_SIZES.small,
      color: isDark ? '#AEAEB2' : '#6B7280',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: SPACING.lg,
      paddingHorizontal: SPACING.sm,
    },
    gateUpgradeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FF6B35',
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.xl,
      width: '100%',
      marginBottom: SPACING.sm,
    },
    gateUpgradeBtnText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
    },
    gateDismissBtn: {
      paddingVertical: SPACING.sm,
    },
    gateDismissBtnText: {
      fontSize: FONT_SIZES.body,
      color: isDark ? '#AEAEB2' : '#6B7280',
    },
  });
