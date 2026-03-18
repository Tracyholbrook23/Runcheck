/**
 * AdminSuspendedUsersScreen.js — View & Manage Suspended Users
 *
 * Lists all currently suspended users (isSuspended === true with active
 * suspension — either no expiry or expiry in the future). Each card shows
 * the user's avatar, name, suspension level, reason, who suspended them
 * (resolved to display name), dates, and provides an Unsuspend action button.
 *
 * Uses a real-time `onSnapshot` listener with client-side filtering for
 * active suspensions (Firestore can't express "endsAt > now OR endsAt is null").
 *
 * Gated by useIsAdmin — non-admin users see an Access Denied screen.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { useIsAdmin } from '../hooks';
import { db, callFunction } from '../config/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format remaining time for a suspension. */
function formatTimeRemaining(endsAt) {
  if (!endsAt) return 'Permanent';
  const end = endsAt.toDate ? endsAt.toDate() : new Date(endsAt);
  const now = new Date();
  const diffMs = end - now;
  if (diffMs <= 0) return 'Expired';

  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  const mins = Math.floor((diffMs % 3600000) / 60000);
  return `${mins}m remaining`;
}

/** Get initials from a display name string. */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminSuspendedUsersScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unsuspending, setUnsuspending] = useState(null); // userId being unsuspended

  // Resolve suspendedBy UID → display name
  const [adminNames, setAdminNames] = useState({});

  // Real-time listener: all users with isSuspended === true
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, 'users'),
      where('isSuspended', '==', true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = new Date();
        const activeSuspensions = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => {
            const endsAt = u.suspensionEndsAt?.toDate?.();
            return !endsAt || endsAt > now;
          })
          // Sort by suspendedAt descending (newest first)
          .sort((a, b) => {
            const aDate = a.suspendedAt?.toDate?.() || new Date(0);
            const bDate = b.suspendedAt?.toDate?.() || new Date(0);
            return bDate - aDate;
          });

        setUsers(activeSuspensions);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        if (__DEV__) console.error('AdminSuspendedUsersScreen: onSnapshot error', err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  // Resolve admin UIDs who performed suspensions
  useEffect(() => {
    if (users.length === 0) return;
    let cancelled = false;

    async function resolve() {
      const newNames = {};
      const idsToFetch = new Set();

      for (const u of users) {
        const by = u.suspendedBy;
        if (by && by !== 'auto-moderation' && !adminNames[by]) {
          idsToFetch.add(by);
        }
      }

      for (const uid of idsToFetch) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const d = snap.data();
            newNames[uid] = d.displayName || d.name || uid;
          }
        } catch (_) { /* fallback to uid */ }
      }

      if (cancelled) return;
      if (Object.keys(newNames).length > 0) {
        setAdminNames((prev) => ({ ...prev, ...newNames }));
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [users]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const handleUnsuspend = useCallback((user) => {
    const displayName = user.displayName || user.name || user.id;

    Alert.alert(
      'Unsuspend User',
      `This will unsuspend ${displayName} and restore their ability to start runs, upload clips, and join runs. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsuspend',
          onPress: async () => {
            setUnsuspending(user.id);
            try {
              await callFunction('unsuspendUser', { userId: user.id });
            } catch (err) {
              if (__DEV__) console.error('unsuspendUser error:', err);
              Alert.alert(
                'Unsuspend Failed',
                err?.message || 'Could not unsuspend user. Please try again.'
              );
            } finally {
              setUnsuspending(null);
            }
          },
        },
      ]
    );
  }, []);

  /** Resolve suspendedBy to a human-readable string. */
  const getSuspendedByLabel = (user) => {
    if (user.suspendedBy === 'auto-moderation') return 'Auto-moderation';
    if (!user.suspendedBy) return 'Unknown';
    return adminNames[user.suspendedBy] || user.suspendedBy;
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (users.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="happy-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Suspended Users</Text>
          <Text style={styles.emptyText}>
            There are no currently suspended users.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {users.length} suspended {users.length === 1 ? 'user' : 'users'}
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
        {users.map((user) => {
          const displayName = user.displayName || user.name || user.id;
          const level = user.suspensionLevel || 1;
          const initials = getInitials(displayName !== user.id ? displayName : null);

          return (
            <View key={user.id} style={styles.card}>
              {/* Header: avatar + name + level badge */}
              <View style={styles.cardHeader}>
                <View style={styles.nameRow}>
                  {user.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{initials}</Text>
                    </View>
                  )}
                  <Text style={styles.nameText} numberOfLines={1}>
                    {displayName}
                  </Text>
                </View>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>Level {level}</Text>
                </View>
              </View>

              {/* Reason */}
              {user.suspensionReason ? (
                <View style={styles.metaRow}>
                  <Ionicons name="alert-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={2}>
                    {user.suspensionReason}
                  </Text>
                </View>
              ) : null}

              {/* Suspended by — resolved to display name */}
              <View style={styles.metaRow}>
                <Ionicons name="shield-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Suspended by: </Text>
                <Text style={styles.metaText}>
                  {getSuspendedByLabel(user)}
                </Text>
              </View>

              {/* Suspended since */}
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Suspended: </Text>
                <Text style={styles.metaText}>
                  {formatRelativeTime(user.suspendedAt)}
                </Text>
              </View>

              {/* Time remaining */}
              <View style={styles.metaRow}>
                <Ionicons name="hourglass-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaLabel}>Expires: </Text>
                <Text style={[styles.metaText, styles.expiryText]}>
                  {formatTimeRemaining(user.suspensionEndsAt)}
                </Text>
              </View>

              {/* Auto-moderation indicator */}
              {user.autoModerated && (
                <View style={styles.autoModBadge}>
                  <Ionicons name="flash-outline" size={11} color={isDark ? '#FBBF24' : '#92400E'} />
                  <Text style={styles.autoModText}>Auto-moderated</Text>
                </View>
              )}

              {/* Unsuspend button */}
              <TouchableOpacity
                style={styles.unsuspendBtn}
                onPress={() => handleUnsuspend(user)}
                disabled={unsuspending === user.id}
                activeOpacity={0.7}
              >
                {unsuspending === user.id ? (
                  <ActivityIndicator size="small" color="#059669" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                    <Text style={styles.unsuspendBtnText}>Unsuspend</Text>
                  </>
                )}
              </TouchableOpacity>
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
      borderLeftWidth: 3,
      borderLeftColor: isDark ? '#DC2626' : '#EF4444',
      ...(isDark
        ? { borderWidth: 0, borderLeftWidth: 3 }
        : { borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3 }),
    },

    // Card header
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#333',
    },
    avatarFallback: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,107,53,0.15)' : '#FFF3ED',
    },
    avatarInitial: {
      fontSize: 14,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
    },
    nameText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      flex: 1,
    },
    levelBadge: {
      backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: isDark ? '#7F1D1D' : '#FECACA',
    },
    levelBadgeText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#FCA5A5' : '#DC2626',
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
    expiryText: {
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#FBBF24' : '#D97706',
    },

    // Auto-mod badge
    autoModBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: 'flex-start',
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    autoModText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#FBBF24' : '#92400E',
    },

    // Unsuspend button
    unsuspendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
      borderColor: isDark ? '#065F46' : '#A7F3D0',
      marginTop: SPACING.sm,
    },
    unsuspendBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: isDark ? '#34D399' : '#059669',
    },
  });
