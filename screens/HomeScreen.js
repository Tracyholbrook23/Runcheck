import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, SHADOWS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence } from '../hooks';
import { Logo } from '../components';
import Button from '../components/Button';

const HomeScreen = ({ navigation }) => {
  const { colors, isDark, themeStyles } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const {
    presence,
    loading,
    isCheckedIn,
    checkOut,
    checkingOut,
    getTimeRemaining,
  } = usePresence();

  const handleCheckOut = async () => {
    Alert.alert(
      'Check Out',
      `Are you sure you want to check out from ${presence?.gymName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await checkOut();
              Alert.alert('Checked Out', "You've successfully checked out.");
            } catch (error) {
              console.error('Check-out error:', error);
              Alert.alert('Error', error.message || 'Failed to check out.');
            }
          },
        },
      ]
    );
  };

  const goToTab = (tabName) => {
    navigation.getParent()?.navigate(tabName);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* NRC-style minimal header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Logo size="small" />
          <Text style={styles.headerTitle}>RunCheck</Text>
        </View>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => goToTab('Profile')}
        >
          <Ionicons name="person-circle-outline" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome — NRC big bold headline */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Find Your{'\n'}Next Run</Text>
          <Text style={styles.welcomeSubtitle}>
            Join a pickup run near you
          </Text>
        </View>

        {/* Presence Card */}
        {loading ? (
          <View style={styles.presenceCard}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : isCheckedIn ? (
          <View style={styles.presenceCard}>
            <View style={styles.presenceHeader}>
              <View style={styles.liveIndicator} />
              <Text style={styles.presenceLabel}>YOU'RE CHECKED IN</Text>
            </View>
            <Text style={styles.presenceGym}>{presence.gymName}</Text>
            <Text style={styles.presenceTime}>
              Expires in {getTimeRemaining()}
            </Text>
            <TouchableOpacity
              style={styles.checkOutButton}
              onPress={handleCheckOut}
              disabled={checkingOut}
            >
              {checkingOut ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.checkOutText}>Check Out</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => goToTab('CheckIn')}
            disabled={isCheckedIn}
            activeOpacity={0.8}
          >
            <Ionicons name="location" size={26} color="#FFFFFF" />
            <Text style={styles.actionCardTitle}>
              {isCheckedIn ? 'Already Checked In' : 'Check Into a Run'}
            </Text>
            <Text style={styles.actionCardSub}>Find courts near you</Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionCardSmall}
              onPress={() => goToTab('Runs')}
              activeOpacity={0.8}
            >
              <Ionicons name="basketball-outline" size={24} color={colors.primary} />
              <Text style={styles.actionSmallTitle}>Find Runs</Text>
              <Text style={styles.actionSmallSub}>Open games</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCardSmall}
              onPress={() => goToTab('Plan')}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={24} color={colors.secondary} />
              <Text style={styles.actionSmallTitle}>Plan a Visit</Text>
              <Text style={styles.actionSmallSub}>Schedule ahead</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerIcon: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  welcomeSection: {
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  welcomeTitle: {
    fontSize: FONT_SIZES.hero,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
    lineHeight: 46,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  presenceCard: {
    backgroundColor: colors.presenceBackground,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    alignItems: 'center',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  presenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: SPACING.xs,
  },
  presenceLabel: {
    fontSize: FONT_SIZES.xs,
    color: colors.presenceText,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 1,
  },
  presenceGym: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.presenceTextBright,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  presenceTime: {
    fontSize: FONT_SIZES.small,
    color: colors.presenceText,
    marginBottom: SPACING.md,
  },
  checkOutButton: {
    backgroundColor: colors.danger,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  checkOutText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  actionsSection: {
    gap: SPACING.sm,
  },
  actionCard: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.xxs,
    ...(isDark ? SHADOWS.glow : SHADOWS.card),
  },
  actionCardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginTop: SPACING.xs,
    letterSpacing: -0.2,
  },
  actionCardSub: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionCardSmall: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xxs,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  actionSmallTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginTop: SPACING.xxs,
  },
  actionSmallSub: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  footer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
});

export default HomeScreen;
