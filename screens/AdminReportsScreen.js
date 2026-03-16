/**
 * AdminReportsScreen.js — Admin Reports / Moderation List
 *
 * Shows all user-submitted reports from the `reports` Firestore collection.
 * Reports are displayed in reverse chronological order (newest first), with
 * pending reports highlighted.
 *
 * Admin actions: Mark Reviewed, Mark Resolved, optional admin notes.
 * Calls the `moderateReport` Cloud Function for secure, server-side updates.
 *
 * Uses a real-time `onSnapshot` listener so new reports appear immediately.
 *
 * Gated by useIsAdmin — non-admin users see an Access Denied screen.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin } from '../hooks';
import { db, callFunction } from '../config/firebase';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
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

  // Moderation state
  const [expandedId, setExpandedId] = useState(null);   // which card shows actions
  const [noteText, setNoteText] = useState('');          // admin notes draft
  const [moderating, setModerating] = useState(null);    // reportId currently being moderated

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

  // ── Resolve targetId / targetOwnerId into display labels ──────────
  // Maps: targetId → display string, targetOwnerId → display name
  const [targetLabels, setTargetLabels] = useState({});
  const [ownerNames, setOwnerNames] = useState({});

  useEffect(() => {
    if (reports.length === 0) return;

    let cancelled = false;

    async function resolveLabels() {
      const newTargetLabels = {};
      const newOwnerNames = {};

      // Collect unique IDs to fetch, grouped by type
      const gymIds = new Set();
      const userIds = new Set();
      const runIds = new Set();
      const clipIds = new Set();
      const ownerUserIds = new Set();

      for (const r of reports) {
        if (targetLabels[r.targetId]) continue; // already resolved
        if (r.type === 'gym') gymIds.add(r.targetId);
        else if (r.type === 'player') userIds.add(r.targetId);
        else if (r.type === 'run') runIds.add(r.targetId);
        else if (r.type === 'clip') clipIds.add(r.targetId);
      }
      for (const r of reports) {
        if (r.targetOwnerId && !ownerNames[r.targetOwnerId]) {
          ownerUserIds.add(r.targetOwnerId);
        }
      }

      // Fetch gym names
      for (const id of gymIds) {
        try {
          const snap = await getDoc(doc(db, 'gyms', id));
          if (snap.exists()) newTargetLabels[id] = `Gym: ${snap.data().name}`;
        } catch (_) { /* fallback to raw ID */ }
      }

      // Fetch player display names
      for (const id of userIds) {
        try {
          const snap = await getDoc(doc(db, 'users', id));
          if (snap.exists()) {
            const d = snap.data();
            newTargetLabels[id] = `Player: ${d.displayName || d.name || id}`;
          }
        } catch (_) { /* fallback */ }
      }

      // Fetch run info (gymId → gym name)
      for (const id of runIds) {
        try {
          const snap = await getDoc(doc(db, 'runs', id));
          if (snap.exists()) {
            const runData = snap.data();
            const gymId = runData.gymId;
            let gymName = gymId || 'Unknown Gym';
            // Try to get gym name
            if (gymId) {
              try {
                const gymSnap = await getDoc(doc(db, 'gyms', gymId));
                if (gymSnap.exists()) gymName = gymSnap.data().name;
              } catch (_) { /* use gymId */ }
            }
            newTargetLabels[id] = `Run at ${gymName}`;
          }
        } catch (_) { /* fallback */ }
      }

      // Fetch clip info (uploader name)
      for (const id of clipIds) {
        try {
          const snap = await getDoc(doc(db, 'gymClips', id));
          if (snap.exists()) {
            const clipData = snap.data();
            const uploaderUid = clipData.uploaderUid || clipData.uid;
            let uploaderName = 'Unknown';
            if (uploaderUid) {
              try {
                const userSnap = await getDoc(doc(db, 'users', uploaderUid));
                if (userSnap.exists()) {
                  const u = userSnap.data();
                  uploaderName = u.displayName || u.name || uploaderUid;
                }
              } catch (_) { /* use uid */ }
            }
            newTargetLabels[id] = `Clip by ${uploaderName}`;
          }
        } catch (_) { /* fallback */ }
      }

      // Fetch owner display names
      for (const id of ownerUserIds) {
        try {
          const snap = await getDoc(doc(db, 'users', id));
          if (snap.exists()) {
            const d = snap.data();
            newOwnerNames[id] = d.displayName || d.name || id;
          }
        } catch (_) { /* fallback */ }
      }

      if (cancelled) return;

      if (Object.keys(newTargetLabels).length > 0) {
        setTargetLabels((prev) => ({ ...prev, ...newTargetLabels }));
      }
      if (Object.keys(newOwnerNames).length > 0) {
        setOwnerNames((prev) => ({ ...prev, ...newOwnerNames }));
      }
    }

    resolveLabels();
    return () => { cancelled = true; };
  }, [reports]);

  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  // Pull-to-refresh is a no-op with a real-time listener, but gives visual feedback
  const handleRefresh = () => {
    setRefreshing(true);
    // onSnapshot will fire and clear refreshing
    setTimeout(() => setRefreshing(false), 1500);
  };

  // Toggle expanded actions for a card
  const toggleExpanded = useCallback((reportId) => {
    setExpandedId((prev) => {
      if (prev === reportId) {
        setNoteText('');
        return null;
      }
      setNoteText('');
      return reportId;
    });
    Keyboard.dismiss();
  }, []);

  // Moderate a report (mark reviewed or resolved)
  const handleModerate = useCallback(async (reportId, newStatus) => {
    setModerating(reportId);
    try {
      const payload = { reportId, status: newStatus };
      if (noteText.trim().length > 0) {
        payload.adminNotes = noteText.trim();
      }
      await callFunction('moderateReport', payload);
      setExpandedId(null);
      setNoteText('');
    } catch (err) {
      console.error('moderateReport error:', err);
      Alert.alert(
        'Update Failed',
        err?.message || 'Could not update report. Please try again.'
      );
    } finally {
      setModerating(null);
    }
  }, [noteText]);

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

              {/* Target info row — resolved to human-readable label */}
              <View style={styles.metaRow}>
                <Ionicons name="link-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {targetLabels[report.targetId] || report.targetId}
                </Text>
              </View>

              {/* Target owner (if known) — resolved to display name */}
              {report.targetOwnerId && (
                <View style={styles.metaRow}>
                  <Ionicons name="person-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>Owner: </Text>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {ownerNames[report.targetOwnerId] || report.targetOwnerId}
                  </Text>
                </View>
              )}

              {/* Admin notes (if previously set) */}
              {report.adminNotes ? (
                <View style={styles.adminNotesRow}>
                  <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.adminNotesText} numberOfLines={2}>
                    {report.adminNotes}
                  </Text>
                </View>
              ) : null}

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

              {/* Action toggle button */}
              <TouchableOpacity
                style={styles.actionToggle}
                onPress={() => toggleExpanded(report.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={expandedId === report.id ? 'chevron-up-outline' : 'ellipsis-horizontal'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.actionToggleText}>
                  {expandedId === report.id ? 'Hide Actions' : 'Actions'}
                </Text>
              </TouchableOpacity>

              {/* Expanded action panel */}
              {expandedId === report.id && (
                <View style={styles.actionPanel}>
                  {/* Optional admin note input */}
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Add admin note (optional)..."
                    placeholderTextColor={colors.textMuted}
                    value={noteText}
                    onChangeText={setNoteText}
                    maxLength={500}
                    multiline
                    numberOfLines={2}
                  />

                  {/* Action buttons */}
                  <View style={styles.actionButtons}>
                    {report.status !== 'reviewed' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.reviewedBtn]}
                        onPress={() => handleModerate(report.id, 'reviewed')}
                        disabled={moderating === report.id}
                        activeOpacity={0.7}
                      >
                        {moderating === report.id ? (
                          <ActivityIndicator size="small" color="#1D4ED8" />
                        ) : (
                          <>
                            <Ionicons name="eye-outline" size={14} color="#1D4ED8" />
                            <Text style={styles.reviewedBtnText}>Mark Reviewed</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                    {report.status !== 'resolved' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.resolvedBtn]}
                        onPress={() => handleModerate(report.id, 'resolved')}
                        disabled={moderating === report.id}
                        activeOpacity={0.7}
                      >
                        {moderating === report.id ? (
                          <ActivityIndicator size="small" color="#059669" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
                            <Text style={styles.resolvedBtnText}>Mark Resolved</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
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

    // Admin notes (previously saved)
    adminNotesRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
      marginBottom: SPACING.xs,
      paddingHorizontal: 2,
    },
    adminNotesText: {
      fontSize: FONT_SIZES.xs,
      color: isDark ? '#93C5FD' : '#1D4ED8',
      fontStyle: 'italic',
      flex: 1,
      lineHeight: 16,
    },

    // Action toggle
    actionToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingTop: SPACING.sm,
      marginTop: SPACING.xs,
    },
    actionToggleText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.primary,
    },

    // Action panel
    actionPanel: {
      marginTop: SPACING.sm,
      paddingTop: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    noteInput: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
      borderRadius: RADIUS.sm,
      padding: SPACING.sm,
      fontSize: FONT_SIZES.small,
      color: colors.textPrimary,
      marginBottom: SPACING.sm,
      minHeight: 40,
      maxHeight: 80,
      textAlignVertical: 'top',
    },
    actionButtons: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 8,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
    },
    reviewedBtn: {
      backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE',
      borderColor: isDark ? '#1E40AF' : '#93C5FD',
    },
    reviewedBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#60A5FA' : '#1D4ED8',
    },
    resolvedBtn: {
      backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
      borderColor: isDark ? '#065F46' : '#A7F3D0',
    },
    resolvedBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#34D399' : '#059669',
    },
  });
