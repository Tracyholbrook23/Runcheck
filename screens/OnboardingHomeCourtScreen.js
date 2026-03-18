/**
 * OnboardingHomeCourtScreen.js — Step 2 of first-time onboarding
 *
 * Lets the user pick a home court from the existing gym list.
 * Saves homeCourtId to users/{uid} and navigates to the finish step.
 * User can skip if they don't want to pick now.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Button } from '../components';
import { useGyms } from '../hooks';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function OnboardingHomeCourtScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { gyms, loading: gymsLoading } = useGyms();
  const [selectedGymId, setSelectedGymId] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selectedGymId) {
      // Skip — no home court selected
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

  const renderGym = ({ item }) => {
    const selected = selectedGymId === item.id;
    return (
      <TouchableOpacity
        style={[styles.gymRow, selected && styles.gymRowSelected]}
        activeOpacity={0.7}
        onPress={() => setSelectedGymId(selected ? null : item.id)}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.gymThumb} />
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
        </View>
        {selected && (
          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pick Your Home Court</Text>
        <Text style={styles.subtitle}>
          This is the gym you play at most. You can change it anytime.
        </Text>
      </View>

      {gymsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          renderItem={renderGym}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

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

const getStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.md,
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
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
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
