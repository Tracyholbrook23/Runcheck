/**
 * AdminToolsScreen.js — Admin Tools Dashboard
 *
 * Entry screen for admin-only tools. Currently provides access to:
 *   - Gym Requests (active — navigates to future admin review screen)
 *
 * Placeholder rows for upcoming tools:
 *   - Gym Management
 *   - Reports / Moderation
 *   - Featured Content
 *
 * Gated by useIsAdmin — non-admin users see an Access Denied screen.
 */

import React, { useState, useEffect } from 'react';
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
import { useIsAdmin } from '../hooks';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ---------------------------------------------------------------------------
// Tool row definitions
// ---------------------------------------------------------------------------

const ADMIN_TOOLS = [
  {
    id: 'gym-requests',
    label: 'Gym Requests',
    subtitle: 'Review and manage user-submitted gym requests',
    icon: 'document-text-outline',
    active: true,
  },
  {
    id: 'gym-management',
    label: 'Gym Management',
    subtitle: 'Edit gym details, images, and status',
    icon: 'basketball-outline',
    active: false,
  },
  {
    id: 'reports-moderation',
    label: 'Reports / Moderation',
    subtitle: 'Review flagged content and user reports',
    icon: 'shield-checkmark-outline',
    active: true,
  },
  {
    id: 'suspended-users',
    label: 'Suspended Users',
    subtitle: 'View and manage currently suspended users',
    icon: 'ban-outline',
    active: true,
  },
  {
    id: 'hidden-clips',
    label: 'Hidden Clips',
    subtitle: 'View and manage hidden clips',
    icon: 'eye-off-outline',
    active: true,
  },
  {
    id: 'featured-content',
    label: 'Featured Clips',
    subtitle: 'Manage featured clips and highlights',
    icon: 'star-outline',
    active: true,
  },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminToolsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  // Real-time overview counts
  const [pendingGymRequests, setPendingGymRequests] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  const [suspendedUsers, setSuspendedUsers] = useState(0);
  const [resolvedToday, setResolvedToday] = useState(0);
  const [hiddenClips, setHiddenClips] = useState(0);
  const [featuredClips, setFeaturedClips] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;

    const gymQ = query(
      collection(db, 'gymRequests'),
      where('status', '==', 'pending')
    );
    const unsubGym = onSnapshot(
      gymQ,
      (snap) => setPendingGymRequests(snap.size),
      () => setPendingGymRequests(0)
    );

    const reportQ = query(
      collection(db, 'reports'),
      where('status', '==', 'pending')
    );
    const unsubReports = onSnapshot(
      reportQ,
      (snap) => setPendingReports(snap.size),
      () => setPendingReports(0)
    );

    // Currently suspended: isSuspended === true AND suspensionEndsAt still
    // in the future (or missing, meaning permanent). Client-side filter
    // because Firestore can't express "endsAt > now OR endsAt is null".
    const suspendedQ = query(
      collection(db, 'users'),
      where('isSuspended', '==', true)
    );
    const unsubSuspended = onSnapshot(
      suspendedQ,
      (snap) => {
        const now = new Date();
        const activeCount = snap.docs.filter((d) => {
          const endsAt = d.data().suspensionEndsAt?.toDate?.();
          return !endsAt || endsAt > now;
        }).length;
        setSuspendedUsers(activeCount);
      },
      () => setSuspendedUsers(0)
    );

    // Resolved reports today (since midnight local)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const resolvedQ = query(
      collection(db, 'reports'),
      where('status', '==', 'resolved'),
      where('reviewedAt', '>=', todayStart)
    );
    const unsubResolved = onSnapshot(
      resolvedQ,
      (snap) => setResolvedToday(snap.size),
      () => setResolvedToday(0)
    );

    const hiddenClipsQ = query(
      collection(db, 'gymClips'),
      where('isHidden', '==', true)
    );
    const unsubHiddenClips = onSnapshot(
      hiddenClipsQ,
      (snap) => setHiddenClips(snap.size),
      () => setHiddenClips(0)
    );

    const featuredClipsQ = query(
      collection(db, 'gymClips'),
      where('isDailyHighlight', '==', true)
    );
    const unsubFeaturedClips = onSnapshot(
      featuredClipsQ,
      (snap) => setFeaturedClips(snap.size),
      () => setFeaturedClips(0)
    );

    return () => { unsubGym(); unsubReports(); unsubSuspended(); unsubResolved(); unsubHiddenClips(); unsubFeaturedClips(); };
  }, [isAdmin]);

  // Map tool id → pending count
  const pendingCounts = {
    'gym-requests': pendingGymRequests,
    'reports-moderation': pendingReports,
    'suspended-users': suspendedUsers,
    'hidden-clips': hiddenClips,
    'featured-content': featuredClips,
  };

  const handlePress = (tool) => {
    if (!tool.active) return;
    if (tool.id === 'gym-requests') {
      navigation.navigate('AdminGymRequests');
    } else if (tool.id === 'reports-moderation') {
      navigation.navigate('AdminReports');
    } else if (tool.id === 'suspended-users') {
      navigation.navigate('AdminSuspendedUsers');
    } else if (tool.id === 'hidden-clips') {
      navigation.navigate('AdminHiddenClips');
    } else if (tool.id === 'featured-content') {
      navigation.navigate('AdminFeaturedClips');
    }
  };

  // ── Admin gate ────────────────────────────────────────────────────
  if (adminLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl }}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
          <Text style={{ fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary, marginTop: SPACING.md, marginBottom: SPACING.xs }}>Access Denied</Text>
          <Text style={{ fontSize: FONT_SIZES.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>You do not have permission to view this screen.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header blurb */}
        <View style={styles.headerSection}>
          <Ionicons name="construct-outline" size={28} color={colors.primary} />
          <Text style={styles.headerTitle}>Admin Tools</Text>
          <Text style={styles.headerSubtitle}>
            Manage gyms, requests, and community content.
          </Text>
        </View>

        {/* Overview stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pendingGymRequests}</Text>
            <Text style={styles.statLabel}>Gym Requests</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pendingReports}</Text>
            <Text style={styles.statLabel}>Pending Reports</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{suspendedUsers}</Text>
            <Text style={styles.statLabel}>Suspended</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{resolvedToday}</Text>
            <Text style={styles.statLabel}>Resolved Today</Text>
          </View>
        </View>

        {/* Tool rows */}
        {ADMIN_TOOLS.map((tool) => {
          const isActive = tool.active;

          return (
            <TouchableOpacity
              key={tool.id}
              style={[styles.toolRow, !isActive && styles.toolRowInactive]}
              activeOpacity={isActive ? 0.7 : 1}
              onPress={() => handlePress(tool)}
            >
              <View style={styles.toolLeft}>
                <View style={[styles.iconCircle, !isActive && styles.iconCircleInactive]}>
                  <Ionicons
                    name={tool.icon}
                    size={20}
                    color={isActive ? colors.primary : colors.textMuted}
                  />
                </View>
                <View style={styles.toolTextBlock}>
                  <Text style={[styles.toolLabel, !isActive && styles.toolLabelInactive]}>
                    {tool.label}
                  </Text>
                  <Text style={styles.toolSubtitle}>{tool.subtitle}</Text>
                </View>
              </View>

              <View style={styles.toolRight}>
                {!isActive && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Soon</Text>
                  </View>
                )}
                {isActive && pendingCounts[tool.id] > 0 && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>
                      {pendingCounts[tool.id]}
                    </Text>
                  </View>
                )}
                {isActive && (
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                )}
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
    scroll: {
      padding: SPACING.md,
      paddingBottom: SPACING.lg * 2,
    },

    // Header
    headerSection: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    headerTitle: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.xs,
    },
    headerSubtitle: {
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
      marginTop: SPACING.xxs,
    },

    // Overview stats row
    statsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xs,
      alignItems: 'center',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    statValue: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primary,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textMuted,
      marginTop: 2,
      textAlign: 'center',
    },

    // Tool row (card-style, matches gymRequestsRow pattern)
    toolRow: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    toolRowInactive: {
      opacity: 0.5,
    },

    toolLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,107,53,0.12)' : '#FFF3ED',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleInactive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
    },
    toolTextBlock: {
      flex: 1,
    },
    toolLabel: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    toolLabelInactive: {
      color: colors.textMuted,
    },
    toolSubtitle: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      marginTop: 2,
    },

    toolRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginLeft: SPACING.xs,
    },

    // Coming soon badge
    comingSoonBadge: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
      borderRadius: RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    comingSoonText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textMuted,
    },

    // Pending count badge
    pendingBadge: {
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderRadius: RADIUS.full,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingBadgeText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? '#FBBF24' : '#92400E',
    },
  });
