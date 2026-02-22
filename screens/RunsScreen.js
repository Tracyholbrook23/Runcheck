/**
 * screens/RunsScreen.js — Emulator Debug: Runs List (via getRuns function)
 *
 * Demonstrates the full auth → HTTP function → Firestore path:
 *   1. Signs in anonymously (emulator Auth supports this with zero config).
 *   2. Gets the user's ID token.
 *   3. Calls the `getRuns` onRequest Cloud Function with the token + gymId.
 *   4. Renders the returned run documents, including attendees.
 *
 * The gym picker at the top lets you switch between gyms loaded directly from
 * Firestore, so you can browse runs across the entire emulator dataset.
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────────
 *   1. firebase emulators:start --only auth,firestore,functions
 *   2. cd RunCheckBackend/functions && npm run build && node lib/seedTestData.js
 *   3. EXPO_PUBLIC_USE_EMULATORS=true in .env
 *
 * ─── Verifying emulator (not production) ───────────────────────────────────────
 * • Emulator UI → http://127.0.0.1:4000 → Firestore → runs collection.
 * • Functions emulator logs stream in the terminal where you ran
 *   `firebase emulators:start`.  You should see GET /getRuns entries there.
 * • The purple "🔧 emulator" tag appears next to the gym name when the flag is on.
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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInAnonymously } from 'firebase/auth';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { auth, db, callHttpFunction } from '../config/firebase';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(val) {
  if (!val) return '—';
  // getRuns serialises Timestamps as ISO strings via JSON
  const d = typeof val === 'string' ? new Date(val) : (val.toDate ? val.toDate() : new Date(val));
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(val) {
  if (!val) return '—';
  const d = typeof val === 'string' ? new Date(val) : (val.toDate ? val.toDate() : new Date(val));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusColors(status, colors) {
  switch (status) {
    case 'active':    return { bg: '#D1FAE5', text: '#065F46' };
    case 'scheduled': return { bg: '#DBEAFE', text: '#1E40AF' };
    case 'completed': return { bg: colors.surface ?? '#F3F4F6', text: colors.textSecondary };
    case 'cancelled': return { bg: '#FEE2E2', text: '#991B1B' };
    default:          return { bg: colors.surface ?? '#F3F4F6', text: colors.textSecondary };
  }
}

// ─── Sub-component: run card ──────────────────────────────────────────────────
function RunCard({ run, colors, styles }) {
  const { bg, text } = statusColors(run.status, colors);
  const attendees = run.attendees ?? [];
  const checkedIn = attendees.filter((a) => a.status === 'checked_in').length;

  return (
    <View style={styles.card}>
      {/* Header: run ID + status pill */}
      <View style={styles.cardHeader}>
        <Text style={[styles.runId, { color: colors.textSecondary }]} numberOfLines={1}>
          id: {run.id?.slice(0, 12)}…
        </Text>
        <View style={[styles.statusPill, { backgroundColor: bg }]}>
          <Text style={[styles.statusText, { color: text }]}>{run.status}</Text>
        </View>
      </View>

      {/* Time range */}
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
        <Text style={[styles.metaText, { color: colors.text }]}>
          {' '}{fmtDate(run.startTime)}  {fmtTime(run.startTime)} → {fmtTime(run.endTime)}
        </Text>
      </View>

      {/* Privacy + attendees */}
      <View style={styles.metaRow}>
        <Ionicons
          name={run.isPrivate ? 'lock-closed-outline' : 'globe-outline'}
          size={13}
          color={colors.textSecondary}
        />
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {' '}{run.isPrivate ? 'Private' : 'Public'}
          {'   '}
        </Text>
        <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {' '}{attendees.length} attendees ({checkedIn} checked in)
        </Text>
      </View>

      {/* Attendee list */}
      {attendees.length > 0 && (
        <View style={styles.attendeeList}>
          {attendees.slice(0, 4).map((a) => (
            <Text key={a.uid} style={[styles.attendeeItem, { color: colors.textSecondary }]}>
              • {a.displayName ?? a.uid?.slice(0, 8)} —{' '}
              <Text style={{ color: a.status === 'checked_in' ? '#059669' : colors.textSecondary }}>
                {a.status}
              </Text>
            </Text>
          ))}
          {attendees.length > 4 && (
            <Text style={[styles.attendeeItem, { color: colors.textSecondary }]}>
              …and {attendees.length - 4} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RunsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [gyms, setGyms] = useState([]);
  const [selectedGymId, setSelectedGymId] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // ── Step 1: Sign in anonymously to get a Bearer token ───────────────────
  useEffect(() => {
    (async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
          console.log('[RunsScreen] Anonymous sign-in OK  uid=', auth.currentUser?.uid);
        }
        setAuthReady(true);
      } catch (err) {
        console.error('[RunsScreen] Auth error:', err);
        setError('Auth failed: ' + err.message);
      }
    })();
  }, []);

  // ── Step 2: Load gym list so user can pick one ───────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'gyms'), orderBy('name', 'asc'), limit(20));
    getDocs(q)
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name }));
        setGyms(list);
        if (list.length > 0) setSelectedGymId(list[0].id);
      })
      .catch((err) => console.error('[RunsScreen] Gyms load error:', err));
  }, []);

  // ── Step 3: Fetch runs via the getRuns Cloud Function ────────────────────
  const fetchRuns = useCallback(async () => {
    if (!authReady || !selectedGymId) return;
    try {
      const data = await callHttpFunction('getRuns', { gymId: selectedGymId });
      setRuns(data.runs ?? []);
      setError(null);
    } catch (err) {
      console.error('[RunsScreen] getRuns error:', err);
      setError(err.message ?? 'Failed to load runs');
    }
  }, [authReady, selectedGymId]);

  useEffect(() => {
    if (!authReady || !selectedGymId) return;
    setLoading(true);
    fetchRuns().finally(() => setLoading(false));
  }, [fetchRuns, authReady, selectedGymId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRuns().finally(() => setRefreshing(false));
  }, [fetchRuns]);

  // ── Render ───────────────────────────────────────────────────────────────
  const selectedGymName = gyms.find((g) => g.id === selectedGymId)?.name ?? '—';

  const renderContent = () => {
    if (!authReady) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Signing in to emulator Auth…
          </Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Calling getRuns via Functions emulator…
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={40} color={colors.error ?? '#DC2626'} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>getRuns failed</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={fetchRuns}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (runs.length === 0) {
      return (
        <View style={styles.centered}>
          <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>No runs for this gym</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Seed the emulator or create a run via the createRun function.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RunCard run={item} colors={colors} styles={styles} />}
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
              {runs.length} Runs
            </Text>
            <Text style={[styles.emulatorTag, { color: colors.primary }]}>
              🔧 emulator
            </Text>
          </View>
        }
      />
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Gym picker */}
      {gyms.length > 0 && (
        <View style={[styles.pickerContainer, { borderBottomColor: colors.border ?? '#E5E7EB' }]}>
          <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Gym:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {gyms.map((gym) => {
              const active = gym.id === selectedGymId;
              return (
                <TouchableOpacity
                  key={gym.id}
                  style={[
                    styles.gymChip,
                    {
                      backgroundColor: active ? colors.primary : (colors.surface ?? '#F3F4F6'),
                      borderColor: active ? colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedGymId(gym.id)}
                >
                  <Text
                    style={[
                      styles.gymChipText,
                      { color: active ? '#FFFFFF' : colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {gym.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {renderContent()}
    </SafeAreaView>
  );
}

// ─── Styles factory ───────────────────────────────────────────────────────────
function getStyles(colors, isDark) {
  return StyleSheet.create({
    root: { flex: 1 },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
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

    // Gym picker
    pickerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      backgroundColor: colors.surface ?? (isDark ? '#1C1C1E' : '#FFFFFF'),
    },
    pickerLabel: {
      fontSize: FONT_SIZES.small,
      marginRight: SPACING.sm,
      flexShrink: 0,
    },
    gymChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: 20,
      marginRight: 8,
      maxWidth: 160,
      borderWidth: 1,
    },
    gymChipText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
    },

    // Run card
    card: {
      backgroundColor: colors.surface ?? (isDark ? '#1C1C1E' : '#FFFFFF'),
      borderRadius: RADIUS.md ?? 12,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    runId: {
      fontSize: 10,
      fontFamily: 'monospace',
      flex: 1,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
      marginLeft: 8,
    },
    statusText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    metaText: { fontSize: FONT_SIZES.small },
    attendeeList: {
      marginTop: SPACING.sm,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border ?? '#E5E7EB',
    },
    attendeeItem: { fontSize: FONT_SIZES.small, marginBottom: 2 },

    // Error / empty
    errorTitle: {
      fontSize: FONT_SIZES.h3,
      fontWeight: FONT_WEIGHTS.semibold,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs ?? 4,
      textAlign: 'center',
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
