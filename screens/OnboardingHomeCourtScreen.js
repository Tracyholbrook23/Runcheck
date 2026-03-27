/**
 * OnboardingHomeCourtScreen.js — Step 2 of first-time onboarding
 *
 * Lets the user pick a home court from the existing gym list.
 * Saves homeCourtId to users/{uid} and navigates to the finish step.
 * User can skip if they don't want to pick now.
 *
 * Location:
 *   Only requested when the user explicitly taps "Use My Location".
 *   Never auto-requested on mount.
 *   When granted, gyms are sorted by distance (closest first) and a
 *   "Nearby gyms" label appears above the list.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Button } from '../components';
import { useGyms } from '../hooks';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getCurrentLocation, calculateDistanceMeters } from '../utils/locationUtils';

// ── Distance helper ────────────────────────────────────────────────────────────

/**
 * Formats a distance in meters as a human-readable miles string.
 * Returns null for non-finite values (gyms with no location set).
 */
function formatDistance(meters) {
  if (!isFinite(meters)) return null;
  const miles = meters / 1609.34;
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function OnboardingHomeCourtScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { gyms, loading: gymsLoading } = useGyms();

  const [selectedGymId, setSelectedGymId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Location state — not populated until user explicitly taps "Use My Location"
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleUseLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      // getCurrentLocation handles the permission prompt internally.
      // It throws a user-readable Error if permission is denied.
      const coords = await getCurrentLocation();
      setUserLocation(coords);
    } catch (err) {
      setLocationError(err.message || 'Could not get your location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedGymId) {
      navigation.replace('OnboardingFinish');
      return;
    }
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await updateDoc(doc(db, 'users', uid), { homeCourtId: selectedGymId });
      }
    } catch (err) {
      if (__DEV__) console.warn('[Onboarding] Failed to save home court:', err);
      // Non-fatal — continue anyway
    }
    setSaving(false);
    navigation.replace('OnboardingFinish');
  };

  // ── Derived gym list ─────────────────────────────────────────────────────────
  // 1. If userLocation is set, attach distance to each gym and sort closest-first.
  // 2. Apply search filter on top.

  const filteredGyms = useMemo(() => {
    let list = [...gyms];

    if (userLocation) {
      list = list
        .map((gym) => ({
          ...gym,
          _distanceM: gym.location
            ? calculateDistanceMeters(userLocation, gym.location)
            : Infinity,
        }))
        .sort((a, b) => a._distanceM - b._distanceM);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((g) => g.name?.toLowerCase().includes(q));
    }

    return list;
  }, [gyms, userLocation, searchQuery]);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderGym = ({ item }) => {
    const selected = selectedGymId === item.id;
    const distLabel = userLocation ? formatDistance(item._distanceM) : null;

    return (
      <TouchableOpacity
        style={[styles.gymRow, selected && styles.gymRowSelected]}
        activeOpacity={0.7}
        onPress={() => setSelectedGymId(selected ? null : item.id)}
      >
        {GYM_LOCAL_IMAGES[item.id] || item.imageUrl ? (
          <Image
            source={
              GYM_LOCAL_IMAGES[item.id]
                ? GYM_LOCAL_IMAGES[item.id]
                : { uri: item.imageUrl }
            }
            style={styles.gymThumb}
          />
        ) : (
          <View style={[styles.gymThumb, styles.gymThumbFallback]}>
            <Ionicons name="basketball-outline" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.gymInfo}>
          <Text style={styles.gymName} numberOfLines={1}>{item.name}</Text>
          {item.address ? (
            <Text style={styles.gymAddress} numberOfLines={1}>{item.address}</Text>
          ) : null}
          {distLabel ? (
            <Text style={styles.gymDistance}>{distLabel}</Text>
          ) : null}
        </View>
        {selected && (
          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Pick Your Home Court</Text>
        <Text style={styles.subtitle}>
          Pick the gym you play at most. We'll show runs near you.
        </Text>
      </View>

      {/* Location + Search controls — always visible, above the list */}
      <View style={styles.controls}>

        {/* Use My Location button */}
        <TouchableOpacity
          style={[styles.locationBtn, userLocation && styles.locationBtnActive]}
          activeOpacity={0.7}
          onPress={handleUseLocation}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={userLocation ? 'location' : 'location-outline'}
              size={16}
              color={userLocation ? colors.primary : colors.textSecondary}
            />
          )}
          <Text style={[styles.locationBtnText, userLocation && styles.locationBtnTextActive]}>
            {locationLoading
              ? 'Getting location…'
              : userLocation
                ? 'Location active'
                : 'Use My Location'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.locationHelper}>Find courts and runs near you</Text>
        {locationError ? (
          <Text style={styles.locationError}>{locationError}</Text>
        ) : null}

        {/* Search bar */}
        <View style={[styles.searchBar, { borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search gyms"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>

        {/* Request gym — visible above the list, low-pressure option */}
        <TouchableOpacity
          style={styles.requestGymRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('RequestGym')}
        >
          <View style={styles.requestGymIcon}>
            <Ionicons name="add" size={16} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.requestGymText}>
              Your gym not listed?{' '}
              <Text style={styles.requestGymLink}>You can request it anytime.</Text>
            </Text>
            <Text style={styles.requestGymHint}>No need to do this now.</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>

      </View>

      {/* Gym list */}
      {gymsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredGyms}
          keyExtractor={(item) => item.id}
          renderItem={renderGym}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            userLocation ? (
              <View style={styles.nearbyHeader}>
                <Ionicons name="location" size={12} color={colors.primary} />
                <Text style={styles.nearbyHeaderText}>Nearby gyms</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            searchQuery.trim() ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No gyms match "{searchQuery.trim()}"
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={<View style={styles.listFooter} />}
        />
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title={selectedGymId ? 'Continue' : 'Skip for Now'}
          variant="primary"
          size="lg"
          onPress={handleContinue}
          loading={saving}
        />
      </View>

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const getStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },

  // ── Location + Search controls ───────────────────────────────────────────────
  controls: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 4,
  },
  locationBtnActive: {
    borderColor: colors.primary,
    backgroundColor: isDark ? 'rgba(255,107,0,0.08)' : 'rgba(255,107,0,0.06)',
  },
  locationBtnText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
  },
  locationBtnTextActive: {
    color: colors.primary,
  },
  locationHelper: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    marginBottom: SPACING.sm,
    marginLeft: 2,
  },
  locationError: {
    fontSize: FONT_SIZES.small,
    color: colors.error || '#EF4444',
    marginBottom: SPACING.sm,
    marginLeft: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: isDark ? 0 : 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    height: '100%',
  },

  // ── List ─────────────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  nearbyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  nearbyHeaderText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  gymRowSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  gymThumb: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
  },
  gymThumbFallback: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  gymName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  gymAddress: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  gymDistance: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    marginTop: 2,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  emptyState: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
  },
  // Request gym row — low visual weight so it doesn't compete with gym selection
  requestGymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
  },
  requestGymIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestGymText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    lineHeight: 18,
  },
  requestGymLink: {
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  requestGymHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  listFooter: {
    paddingVertical: SPACING.md,
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
