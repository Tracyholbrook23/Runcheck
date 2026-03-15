/**
 * MyGymRequestsScreen.js — View Submitted Gym Requests
 *
 * Displays the signed-in user's gym requests from the `gymRequests`
 * Firestore collection, sorted newest first. Each card shows the gym name,
 * submitted date, status badge, and any admin feedback.
 *
 * Statuses:
 *   - pending   → neutral grey, "Under Review"
 *   - approved  → green, "Approved"
 *   - duplicate → amber, "Already Listed"
 *   - rejected  → soft red, "Not Added"
 */

import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useMyGymRequests } from '../hooks';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Status display configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: {
    label: 'Under Review',
    icon: 'time-outline',
    colors: { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
    darkColors: { bg: '#1F2937', text: '#9CA3AF', border: '#374151' },
    message: 'We\'re reviewing your request. This usually takes a few days.',
  },
  approved: {
    label: 'Approved',
    icon: 'checkmark-circle-outline',
    colors: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    darkColors: { bg: '#064E3B', text: '#34D399', border: '#065F46' },
    message: 'This gym has been added to RunCheck!',
  },
  duplicate: {
    label: 'Already Listed',
    icon: 'copy-outline',
    colors: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
    darkColors: { bg: '#451A03', text: '#FBBF24', border: '#78350F' },
    message: 'This gym is already in RunCheck under a different name or listing.',
  },
  rejected: {
    label: 'Not Added',
    icon: 'close-circle-outline',
    colors: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    darkColors: { bg: '#450A0A', text: '#F87171', border: '#7F1D1D' },
    message: 'We weren\'t able to add this gym at this time.',
  },
};

/**
 * Formats a Firestore Timestamp or Date into a short readable string.
 * @param {object|Date|null} ts
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MyGymRequestsScreen() {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const { requests, loading } = useMyGymRequests();

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
          <Text style={styles.emptyTitle}>No Requests Yet</Text>
          <Text style={styles.emptyText}>
            When you request a gym to be added to RunCheck, it will show up here
            so you can track its status.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Request list ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {requests.map((req) => {
          const status = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          const statusColors = isDark ? status.darkColors : status.colors;

          return (
            <View key={req.id} style={styles.card}>
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

              {/* Location + date */}
              <View style={styles.metaRow}>
                {(req.city || req.state) && (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.metaText}>
                      {[req.city, req.state].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                )}
                {req.createdAt && (
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.metaText}>{formatDate(req.createdAt)}</Text>
                  </View>
                )}
              </View>

              {/* Status message */}
              <Text style={styles.statusMessage}>{status.message}</Text>

              {/* Admin notes (only if present and status is not pending) */}
              {req.adminNotes && req.status !== 'pending' && (
                <View style={styles.adminNoteBox}>
                  <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.adminNoteText}>{req.adminNotes}</Text>
                </View>
              )}

              {/* Approved with promotedGymId — hint that the gym is live */}
              {req.status === 'approved' && req.promotedGymId && (
                <View style={styles.promotedHint}>
                  <Ionicons name="basketball-outline" size={13} color={STATUS_CONFIG.approved.colors.text} />
                  <Text style={[styles.promotedHintText, { color: isDark ? STATUS_CONFIG.approved.darkColors.text : STATUS_CONFIG.approved.colors.text }]}>
                    Now live in RunCheck — find it on the Runs tab
                  </Text>
                </View>
              )}

              {/* Duplicate with duplicateOfGymId — hint */}
              {req.status === 'duplicate' && req.duplicateOfGymId && (
                <View style={styles.promotedHint}>
                  <Ionicons name="search-outline" size={13} color={STATUS_CONFIG.duplicate.colors.text} />
                  <Text style={[styles.promotedHintText, { color: isDark ? STATUS_CONFIG.duplicate.darkColors.text : STATUS_CONFIG.duplicate.colors.text }]}>
                    Check the Runs tab — it may be listed under a different name
                  </Text>
                </View>
              )}
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
      marginBottom: SPACING.md,
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
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
      fontWeight: FONT_WEIGHTS.semiBold,
    },

    // Meta row
    metaRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.sm,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaText: {
      fontSize: FONT_SIZES.caption,
      color: colors.textMuted,
    },

    // Status message
    statusMessage: {
      fontSize: FONT_SIZES.caption,
      color: colors.textSecondary,
      lineHeight: 18,
    },

    // Admin notes
    adminNoteBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
      marginTop: SPACING.sm,
      paddingTop: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    adminNoteText: {
      fontSize: FONT_SIZES.caption,
      color: colors.textSecondary,
      flex: 1,
      fontStyle: 'italic',
      lineHeight: 18,
    },

    // Promoted / duplicate hint
    promotedHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.sm,
    },
    promotedHintText: {
      fontSize: FONT_SIZES.caption,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
  });
