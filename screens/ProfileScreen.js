import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, SKILL_LEVEL_COLORS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useAuth, useReliability, useSchedules, usePresence } from '../hooks';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function ProfileScreen({ navigation }) {
  const { isDark, colors, toggleTheme } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const { user } = useAuth();
  const { score, tier, stats, loading: reliabilityLoading } = useReliability();
  const { count: upcomingCount } = useSchedules();
  const { isCheckedIn, presence } = usePresence();

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Fetch Firestore user profile (name, skillLevel, age)
  useEffect(() => {
    if (!user?.uid) {
      setProfileLoading(false);
      return;
    }
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, [user?.uid]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
            navigation.getParent()?.getParent()?.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to sign out.');
          }
        },
      },
    ]);
  };

  const skillColors = profile?.skillLevel
    ? SKILL_LEVEL_COLORS[profile.skillLevel]
    : null;

  const loading = profileLoading || reliabilityLoading;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Avatar & User Info */}
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: tier.color + '20' }]}>
            <Ionicons name="person" size={48} color={tier.color} />
          </View>
          <Text style={styles.name}>{profile?.name || 'Player'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {skillColors && (
            <View style={[styles.skillBadge, { backgroundColor: skillColors.bg }]}>
              <Text style={[styles.skillText, { color: skillColors.text }]}>
                {profile.skillLevel}
              </Text>
            </View>
          )}
        </View>

        {/* Reliability Score */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reliability Score</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreCircle}>
              <Text style={[styles.scoreNumber, { color: tier.color }]}>{score}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={styles.tierInfo}>
              <View style={[styles.tierBadge, { backgroundColor: tier.color + '20' }]}>
                <View style={[styles.tierDot, { backgroundColor: tier.color }]} />
                <Text style={[styles.tierLabel, { color: tier.color }]}>{tier.label}</Text>
              </View>
              <Text style={styles.tierHint}>
                {score >= 90
                  ? 'Players trust you to show up!'
                  : score >= 75
                  ? 'Solid track record. Keep it up!'
                  : score >= 50
                  ? 'Room for improvement.'
                  : 'Attend more sessions to rebuild trust.'}
              </Text>
            </View>
          </View>
          {/* Score bar */}
          <View style={styles.scoreBarTrack}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${score}%`, backgroundColor: tier.color },
              ]}
            />
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="calendar-outline" size={20} color={colors.secondary} />
              <Text style={styles.statNumber}>{stats?.totalScheduled ?? 0}</Text>
              <Text style={styles.statLabel}>Scheduled</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={styles.statNumber}>{stats?.totalAttended ?? 0}</Text>
              <Text style={styles.statLabel}>Attended</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
              <Text style={styles.statNumber}>{stats?.totalNoShow ?? 0}</Text>
              <Text style={styles.statLabel}>No-Shows</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="remove-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.statNumber}>{stats?.totalCancelled ?? 0}</Text>
              <Text style={styles.statLabel}>Cancelled</Text>
            </View>
          </View>
          {stats && stats.totalScheduled > 0 && (
            <View style={styles.attendanceRow}>
              <Text style={styles.attendanceLabel}>Attendance Rate</Text>
              <Text style={[styles.attendanceValue, { color: colors.success }]}>
                {stats.attendanceRate}%
              </Text>
            </View>
          )}
        </View>

        {/* Current Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Status</Text>
          {isCheckedIn ? (
            <View style={styles.statusRow}>
              <View style={styles.liveIndicator} />
              <Text style={styles.statusText}>
                Checked in at <Text style={{ fontWeight: '700' }}>{presence?.gymName}</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Ionicons name="ellipse-outline" size={10} color={colors.textMuted} />
              <Text style={[styles.statusText, { color: colors.textMuted }]}>
                Not checked in
              </Text>
            </View>
          )}
          {upcomingCount > 0 && (
            <View style={[styles.statusRow, { marginTop: SPACING.xs }]}>
              <Ionicons name="calendar" size={14} color={colors.secondary} />
              <Text style={[styles.statusText, { color: colors.secondary }]}>
                {upcomingCount} upcoming {upcomingCount === 1 ? 'session' : 'sessions'}
              </Text>
            </View>
          )}
        </View>

        {/* Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLabel}>
              <Ionicons
                name={isDark ? 'moon' : 'sunny-outline'}
                size={22}
                color={colors.textPrimary}
              />
              <Text style={styles.settingText}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              testID="dark-mode-toggle"
            />
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scroll: {
      padding: SPACING.md,
      paddingBottom: SPACING.xl,
    },
    // Header
    header: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    name: {
      fontSize: FONT_SIZES.title,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    email: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
      marginTop: 2,
    },
    skillBadge: {
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: 12,
    },
    skillText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
    },
    // Cards
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    cardTitle: {
      fontSize: FONT_SIZES.small,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: SPACING.sm,
    },
    // Reliability score
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    scoreCircle: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginRight: SPACING.md,
    },
    scoreNumber: {
      fontSize: 44,
      fontWeight: '800',
    },
    scoreMax: {
      fontSize: FONT_SIZES.body,
      color: colors.textMuted,
      fontWeight: '500',
    },
    tierInfo: {
      flex: 1,
    },
    tierBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: 4,
    },
    tierDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    tierLabel: {
      fontSize: FONT_SIZES.small,
      fontWeight: '700',
    },
    tierHint: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    scoreBarTrack: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    scoreBarFill: {
      height: 6,
      borderRadius: 3,
    },
    // Stats grid
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.xs,
    },
    statNumber: {
      fontSize: FONT_SIZES.title,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 4,
    },
    statLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    attendanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.sm,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    attendanceLabel: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
    },
    attendanceValue: {
      fontSize: FONT_SIZES.subtitle,
      fontWeight: '800',
    },
    // Current status
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    liveIndicator: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
    },
    statusText: {
      fontSize: FONT_SIZES.body,
      color: colors.presenceTextBright,
      fontWeight: '500',
    },
    // Settings
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    settingLabel: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    settingText: {
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      marginLeft: SPACING.sm,
      fontWeight: '500',
    },
    // Sign out
    signOutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      marginTop: SPACING.xs,
    },
    signOutText: {
      fontSize: FONT_SIZES.body,
      color: colors.danger,
      fontWeight: '600',
    },
  });
