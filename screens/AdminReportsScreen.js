/**
 * AdminReportsScreen.js — Admin Reports / Moderation List
 *
 * Read-only MVP screen showing all user-submitted reports from the `reports`
 * Firestore collection. Reports are displayed in reverse chronological order
 * (newest first), with pending reports highlighted.
 *
 * Uses a real-time `onSnapshot` listener so new reports appear immediately.
 *
 * Gated by useIsAdmin — non-admin users see an Access Denied screen.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin } from '../hooks';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Status display configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: 'time-outline',
    colors: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    darkColors: { bg: '#451A03', text: '#FBBF24', border: '#78350F' },
  },
  reviewed: {
    label: 'Reviewed',
    icon: 'eye-outline',
    colors: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
    darkColors: { bg: '#1E3A5F', text: '#60A5FA', border: '#1E40AF' },
  },
  resolved: {
    label: 'Resolved',
    icon: 'checkmark-circle-outline',
    colors: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    darkColors: { bg: '#064E3B', text: '#34D399', border: '#065F46' },
  },
};

// ---------------------------------------------------------------------------
// Type display configuration
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  clip: { label: 'Clip', icon: 'videocam-outline', color: '#8B5CF6' },
  player: { label: 'Player', icon: 'person-outline', color: '#3B82F6' },
  run: { label: 'Run', icon: 'walk-outline', color: '#F59E0B' },
  gym: { label: 'Gym', icon: 'basketball-outline', color: '#EF4444' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capitalize first letter of a string. */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Returns a relative time string like "2h ago", "3d ago", or a short date. */
function formatRelativeTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminReportsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time listener on reports collection, newest first
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, 'reports'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setReports(docs);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('AdminReportsScreen: onSnapshot error', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  // Pull-to-refresh is a no-op with a real-time listener, but gives visual feedback
  const handleRefresh = () => {
    setRefreshing(true);
    // onSnapshot will fire and clear refreshing
    setTimeout(() => setRefreshing(false), 1500);
  };

  // ── Admin gate ────────────────────────────────────────────────────
  if (adminLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Access Denied</Text>
          <Text style={styles.emptyText}>You do not have permission to view this screen.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────
  if (reports.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="shield-checkmark-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Reports</Text>
          <Text style={styles.emptyText}>
            When users submit reports, they will appear here for review.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Report list ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {reports.length} {reports.length === 1 ? 'report' : 'reports'}
        </Text>
        {pendingCount > 0 && (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingPillText}>
              {pendingCount} pending
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {reports.map((report) => {
          const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
          const statusColors = isDark ? status.darkColors : status.colors;
          const typeInfo = TYPE_CONFIG[report.type] || TYPE_CONFIG.clip;
          const isPending = report.status === 'pending';

          return (
            <View
              key={report.id}
              style={[styles.card, isPending && styles.cardPending]}
            >
              {/* Top row: type badge + status badge */}
              <View style={styles.cardHeader}>
                <View style={[styles.typeBadge, { backgroundColor: typeInfo.color + '18' }]}>
                  <Ionicons name={typeInfo.icon} size={13} color={typeInfo.color} />
                  <Text style={[styles.typeBadgeText, { color: typeInfo.color }]}>
                    {typeInfo.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColors.bg, borderColor: statusColors.border },
                  ]}
                >
                  <Ionicons name={status.icon} size={12} color={statusColors.text} />
                  <Text style={[styles.statusText, { color: statusColors.text }]}>
                    {status.label}
                  </Text>
                </View>
              </View>

              {/* Reason */}
              <Text style={styles.reasonText}>
                {capitalize(report.reason)}
              </Text>

              {/* Description (if present) */}
              {report.description ? (
                <Text style={styles.descriptionText} numberOfLines={3}>
                  {report.description}
                </Text>
              ) : null}

              {/* Target info row */}
              <View style={styles.metaRow}>
                <Ionicons name="link-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {report.targetId}
                </Text>
              </View>

              {/* Target owner (if known) */}
              {report.targetOwnerId && (
                <View style={styles.metaRow}>
                  <Ionicons name="person-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>Owner: </Text>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {report.targetOwnerId}
                  </Text>
                </View>
              )}

              {/* Footer: reporter + date */}
              <View style={styles.footerRow}>
                <View style={styles.reporterRow}>
                  <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.reporterText} numberOfLines={1}>
                    {report.reporterName || 'Unknown user'}
                  </Text>
                </View>
                {report.createdAt && (
                  <Text style={styles.dateText}>
                    {formatRelativeTime(report.createdAt)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
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
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    scroll: {
      padding: SPACING.md,
      paddingBottom: SPACING.lg * 2,
    },

    // Summary bar
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    summaryText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textSecondary,
    },
    pendingPill: {
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderRadius: RADIUS.full,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    pendingPillText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#FBBF24' : '#92400E',
    },

    // Empty state
    emptyTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
    },
    emptyText: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 280,
    },

    // Card
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    cardPending: {
      borderLeftWidth: 3,
      borderLeftColor: isDark ? '#FBBF24' : '#D97706',
    },

    // Card header
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: RADIUS.sm,
    },
    typeBadgeText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semibold,
    },

    // Reason
    reasonText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
    },

    // Description
    descriptionText: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: SPACING.sm,
    },

    // Meta rows
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    metaLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      fontWeight: FONT_WEIGHTS.medium,
    },
    metaText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      flex: 1,
    },

    // Footer row
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: SPACING.xs,
      marginTop: SPACING.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    reporterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    reporterText: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      flex: 1,
    },
    dateText: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      marginLeft: SPACING.sm,
    },
  });
