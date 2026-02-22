/**
 * screens/GymsScreen.js — Emulator Debug: Gyms List
 *
 * Fetches every document from the `gyms` Firestore collection on the local
 * emulator and renders them in a list.  Each card shows the gym name,
 * GPS coordinates, and the creator's UID.
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────────
 *   1. firebase emulators:start --only auth,firestore,functions
 *   2. cd RunCheckBackend/functions && npm run build && node lib/seedTestData.js
 *   3. EXPO_PUBLIC_USE_EMULATORS=true in .env
 *
 * ─── Verifying emulator data ───────────────────────────────────────────────────
 * Open http://127.0.0.1:4000 → Firestore → gyms collection.
 * The documents must match what appears in this screen.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCoord(val) {
  return val !== undefined && val !== null ? val.toFixed(5) : '—';
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Extract lat/lng from a Firestore GeoPoint (or plain object fallback)
function extractLatLng(location) {
  if (!location) return { lat: null, lng: null };
  return {
    lat: location.latitude ?? location._lat ?? location.lat ?? null,
    lng: location.longitude ?? location._long ?? location.lng ?? null,
  };
}

// ─── Sub-component: single gym card ──────────────────────────────────────────
function GymCard({ gym, colors, styles }) {
  const { lat, lng } = extractLatLng(gym.location);

  return (
    <View style={styles.card}>
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: colors.secondary + '20' }]}>
        <Ionicons name="barbell-outline" size={24} color={colors.secondary ?? colors.primary} />
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.gymName, { color: colors.text }]}>{gym.name}</Text>

        {/* Location */}
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {' '}{fmtCoord(lat)}°, {fmtCoord(lng)}°
          </Text>
        </View>

        {/* Created date */}
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {' '}Added {fmtDate(gym.createdAt)}
          </Text>
        </View>

        {/* Creator UID */}
        <Text style={[styles.docId, { color: colors.textSecondary }]} numberOfLines={1}>
          creator: {gym.creatorId ?? '—'}
        </Text>

        {/* Gym doc ID */}
        <Text style={[styles.docId, { color: colors.textSecondary }]} numberOfLines={1}>
          id: {gym.id}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function GymsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchGyms = useCallback(async () => {
    try {
      const q = query(collection(db, 'gyms'), orderBy('name', 'asc'));
      const snap = await getDocs(q);
      setGyms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError(null);
    } catch (err) {
      console.error('[GymsScreen]', err);
      setError(err.message ?? 'Failed to load gyms');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchGyms().finally(() => setLoading(false));
  }, [fetchGyms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGyms().finally(() => setRefreshing(false));
  }, [fetchGyms]);

  // ── States ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Loading gyms from emulator…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="warning-outline" size={40} color={colors.error ?? '#DC2626'} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load gyms</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={fetchGyms}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (gyms.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="barbell-outline" size={40} color={colors.textSecondary} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>No gyms found</Text>
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
        data={gyms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GymCard gym={item} colors={colors} styles={styles} />
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
              {gyms.length} Gyms
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

    // Card
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surface ?? (isDark ? '#1C1C1E' : '#FFFFFF'),
      borderRadius: RADIUS.md ?? 12,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    iconBox: {
      width: 46,
      height: 46,
      borderRadius: 23,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    cardBody: { flex: 1 },
    gymName: {
      fontWeight: FONT_WEIGHTS.semibold,
      fontSize: FONT_SIZES.body,
      marginBottom: 4,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    metaText: { fontSize: FONT_SIZES.small },
    docId: {
      fontSize: 10,
      fontFamily: 'monospace',
      marginTop: 3,
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
