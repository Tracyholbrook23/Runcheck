/**
 * screens/UsersScreen.js — Emulator Debug: Users List
 *
 * Fetches every document from the `users` Firestore collection on the local
 * emulator and renders them as a list.  Useful for verifying that seed data
 * is present and that the emulator connection is working correctly.
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────────
 *   1. firebase emulators:start --only auth,firestore,functions
 *   2. cd RunCheckBackend/functions && npm run build && node lib/seedTestData.js
 *   3. EXPO_PUBLIC_USE_EMULATORS=true in .env (already set)
 *
 * ─── Verifying emulator data ───────────────────────────────────────────────────
 * Open http://127.0.0.1:4000 → Firestore → users collection.
 * The documents shown there must match what appears in this screen.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ─── Helper: format a Firestore Timestamp for display ────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Sub-component: single user row ──────────────────────────────────────────
function UserRow({ user, colors, styles }) {
  const initials = (user.displayName ?? '??')
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.card}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Details */}
      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: colors.text }]}>
          {user.displayName ?? 'No name'}
        </Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>
          {user.email}
        </Text>
        <View style={styles.metaRow}>
          {/* Rating */}
          <View style={styles.badge}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {' '}{user.averageRating?.toFixed(1) ?? '—'}
              {user.ratingCount ? ` (${user.ratingCount})` : ''}
            </Text>
          </View>
          {/* Friends */}
          <View style={styles.badge}>
            <Ionicons name="people-outline" size={11} color={colors.textSecondary} />
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {' '}{user.friends?.length ?? 0} friends
            </Text>
          </View>
        </View>
        {/* Doc ID — useful for copy-pasting into function calls */}
        <Text style={[styles.docId, { color: colors.textSecondary }]} numberOfLines={1}>
          uid: {user.id}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function UsersScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError(null);
    } catch (err) {
      console.error('[UsersScreen]', err);
      setError(err.message ?? 'Failed to load users');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUsers().finally(() => setRefreshing(false));
  }, [fetchUsers]);

  // ── States ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Loading users from emulator…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={40} color={colors.error ?? '#DC2626'} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load users</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={fetchUsers}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (users.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>No users found</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Seed the emulator:{'\n'}
          cd RunCheckBackend/functions{'\n'}
          npm run build && node lib/seedTestData.js
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserRow user={item} colors={colors} styles={styles} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.listHeaderText, { color: colors.text }]}>
              {users.length} Users
            </Text>
            <Text style={[styles.emulatorTag, { color: colors.primary }]}>
              🔧 emulator
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles factory (recomputed only on theme change) ────────────────────────
function getStyles(colors, isDark) {
  return StyleSheet.create({
    root: { flex: 1 },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
      backgroundColor: colors.background,
    },
    list: { padding: SPACING.md },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    listHeaderText: {
      fontSize: FONT_SIZES.h2,
      fontWeight: FONT_WEIGHTS.bold,
    },
    emulatorTag: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.semibold,
    },

    // Card
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface ?? (isDark ? '#1C1C1E' : '#FFFFFF'),
      borderRadius: RADIUS.md ?? 12,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    avatarText: {
      color: '#FFFFFF',
      fontWeight: FONT_WEIGHTS.bold,
      fontSize: FONT_SIZES.body,
    },
    cardBody: { flex: 1 },
    name: { fontWeight: FONT_WEIGHTS.semibold, fontSize: FONT_SIZES.body },
    email: { fontSize: FONT_SIZES.small, marginTop: 2 },
    metaRow: { flexDirection: 'row', marginTop: 4, gap: 10 },
    badge: { flexDirection: 'row', alignItems: 'center' },
    badgeText: { fontSize: FONT_SIZES.xs },
    docId: {
      fontSize: 10,
      fontFamily: 'monospace',
      marginTop: 4,
    },

    // Error / empty
    errorTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.semibold,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs ?? 4,
    },
    hint: {
      fontSize: FONT_SIZES.small,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryBtn: {
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.md ?? 12,
    },
    retryBtnText: {
      color: '#FFFFFF',
      fontWeight: FONT_WEIGHTS.semibold,
      fontSize: FONT_SIZES.body,
    },
  });
}
