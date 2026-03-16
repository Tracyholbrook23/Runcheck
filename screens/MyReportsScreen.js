/**
 * MyReportsScreen.js — View My Submitted Reports
 *
 * Displays the signed-in user's reports from the `reports` Firestore
 * collection, sorted newest first. Each card shows the report type,
 * a human-readable target label, reason, optional description, status
 * badge, and submission date.
 *
 * Read-only — no edit, delete, or reopen actions.
 *
 * Firestore query: `reports` where `reportedBy == auth.uid`,
 * ordered by `createdAt desc`. Existing Firestore rules already
 * restrict non-admin reads to own reports (`reportedBy == auth.uid`).
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
import { useAuth } from '../hooks';
import { db } from '../config/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from 'firebase/firestore';
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

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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

export default function MyReportsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { user } = useAuth();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time listener — own reports only, newest first
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'reports'),
      where('reportedBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReports(docs);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('MyReportsScreen: onSnapshot error', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  // ── Resolve targetId into human-readable labels ──────────────────
  const [targetLabels, setTargetLabels] = useState({});

  useEffect(() => {
    if (reports.length === 0) return;

    let cancelled = false;

    async function resolveLabels() {
      const newLabels = {};

      const gymIds = new Set();
      const userIds = new Set();
      const runIds = new Set();
      const clipIds = new Set();

      for (const r of reports) {
        if (targetLabels[r.targetId]) continue;
        if (r.type === 'gym') gymIds.add(r.targetId);
        else if (r.type === 'player') userIds.add(r.targetId);
        else if (r.type === 'run') runIds.add(r.targetId);
        else if (r.type === 'clip') clipIds.add(r.targetId);
      }

      // Fetch gym names
      for (const id of gymIds) {
        try {
          const snap = await getDoc(doc(db, 'gyms', id));
          if (snap.exists()) newLabels[id] = `Gym: ${snap.data().name}`;
        } catch (_) { /* fallback to raw ID */ }
      }

      // Fetch player display names
      for (const id of userIds) {
        try {
          const snap = await getDoc(doc(db, 'users', id));
          if (snap.exists()) {
            const d = snap.data();
            newLabels[id] = `Player: ${d.displayName || d.name || id}`;
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
            if (gymId) {
              try {
                const gymSnap = await getDoc(doc(db, 'gyms', gymId));
                if (gymSnap.exists()) gymName = gymSnap.data().name;
              } catch (_) { /* use gymId */ }
            }
            newLabels[id] = `Run at ${gymName}`;
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
            newLabels[id] = `Clip by ${uploaderName}`;
          }
        } catch (_) { /* fallback */ }
      }

      if (cancelled) return;

      if (Object.keys(newLabels).length > 0) {
        setTargetLabels((prev) => ({ ...prev, ...newLabels }));
      }
    }

    resolveLabels();
    return () => { cancelled = true; };
  }, [reports]);

  // Pull-to-refresh visual feedback (data is real-time)
  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
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
  if (reports.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="flag-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Reports</Text>
          <Text style={styles.emptyText}>
            Reports you submit will appear here so you can track their status.
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

          return (
            <View key={report.id} style={styles.card}>
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

              {/* Target — resolved to human-readable label */}
              <View style={styles.metaRow}>
                <Ionicons name="link-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {targetLabels[report.targetId] || report.targetId}
                </Text>
              </View>

              {/* Admin notes (if set by moderator) */}
              {report.adminNotes ? (
                <View style={styles.adminNotesRow}>
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.adminNotesText} numberOfLines={2}>
                    {report.adminNotes}
                  </Text>
                </View>
              ) : null}

              {/* Footer: date */}
              <View style={styles.footerRow}>
                {report.createdAt && (
                  <Text style={styles.dateText}>
                    Submitted {formatRelativeTime(report.createdAt)}
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
    metaText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      flex: 1,
    },

    // Admin notes
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

    // Footer row
    footerRow: {
      paddingTop: SPACING.xs,
      marginTop: SPACING.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },
    dateText: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
    },
  });
