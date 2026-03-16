/**
 * AdminGymRequestsScreen.js — Admin Gym Request Review List
 *
 * Displays all gym requests across all users for admin review.
 * Sorted: pending requests first, then newest-first within each group.
 *
 * Each card shows: gym name, city/state, submitter name, created date,
 * and a status badge. Cards are tappable (ready for a future detail screen).
 *
 * No approval/rejection actions yet — this is the list view only.
 */

import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useAdminGymRequests } from '../hooks';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Status display configuration (matches MyGymRequestsScreen)
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: 'time-outline',
    colors: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    darkColors: { bg: '#451A03', text: '#FBBF24', border: '#78350F' },
  },
  approved: {
    label: 'Approved',
    icon: 'checkmark-circle-outline',
    colors: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    darkColors: { bg: '#064E3B', text: '#34D399', border: '#065F46' },
  },
  duplicate: {
    label: 'Duplicate',
    icon: 'copy-outline',
    colors: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
    darkColors: { bg: '#451A03', text: '#FBBF24', border: '#78350F' },
  },
  rejected: {
    label: 'Rejected',
    icon: 'close-circle-outline',
    colors: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    darkColors: { bg: '#450A0A', text: '#F87171', border: '#7F1D1D' },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a relative time string like "2h ago", "3d ago", or a short date.
 */
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

export default function AdminGymRequestsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const { requests, loading, pendingCount } = useAdminGymRequests();

  const handleCardPress = (request) => {
    navigation.navigate('AdminGymRequestDetail', { requestId: request.id });
  };

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
  if (requests.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Gym Requests</Text>
          <Text style={styles.emptyText}>
            When users submit gym requests, they will appear here for review.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Request list ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {requests.length} {requests.length === 1 ? 'request' : 'requests'}
        </Text>
        {pendingCount > 0 && (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingPillText}>
              {pendingCount} pending
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {requests.map((req) => {
          const status = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          const statusColors = isDark ? status.darkColors : status.colors;
          const isPending = req.status === 'pending';

          return (
            <TouchableOpacity
              key={req.id}
              style={[styles.card, isPending && styles.cardPending]}
              activeOpacity={0.7}
              onPress={() => handleCardPress(req)}
            >
              {/* Top row: gym name + status badge */}
              <View style={styles.cardHeader}>
                <Text style={styles.gymName} numberOfLines={2}>
                  {req.gymName}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusColors.bg,
                      borderColor: statusColors.border,
                    },
                  ]}
                >
                  <Ionicons name={status.icon} size={12} color={statusColors.text} />
                  <Text style={[styles.statusText, { color: statusColors.text }]}>
                    {status.label}
                  </Text>
                </View>
              </View>

              {/* Location */}
              {(req.city || req.state) && (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaText}>
                    {[req.city, req.state].filter(Boolean).join(', ')}
                  </Text>
                </View>
              )}

              {/* Bottom row: submitter + date */}
              <View style={styles.footerRow}>
                <View style={styles.submitterRow}>
                  <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.submitterText} numberOfLines={1}>
                    {req.submitterName || 'Unknown user'}
                  </Text>
                </View>
                {req.createdAt && (
                  <Text style={styles.dateText}>
                    {formatRelativeTime(req.createdAt)}
                  </Text>
                )}
              </View>

              {/* Chevron hint for tappability */}
              <View style={styles.chevronWrap}>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
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
      position: 'relative',
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
      alignItems: 'flex-start',
      gap: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    gymName: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      flex: 1,
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

    // Meta row
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginBottom: SPACING.sm,
    },
    metaText: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
    },

    // Footer row
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: SPACING.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    submitterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    submitterText: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      flex: 1,
    },
    dateText: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      marginLeft: SPACING.sm,
    },

    // Chevron
    chevronWrap: {
      position: 'absolute',
      right: SPACING.sm,
      top: '50%',
      marginTop: -8,
    },
  });
