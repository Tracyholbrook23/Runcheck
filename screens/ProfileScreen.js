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
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo } from '../components';
import { useAuth, useReliability, useSchedules, usePresence } from '../hooks';
import { auth, db } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

export default function ProfileScreen({ navigation }) {
  const { isDark, colors, toggleTheme, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const { user } = useAuth();
  const { score, tier, stats, loading: reliabilityLoading } = useReliability();
  const { count: upcomingCount } = useSchedules();
  const { isCheckedIn, presence } = usePresence();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState(null);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

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

  const profileSkillColors = profile?.skillLevel
    ? skillColors[profile.skillLevel]
    : null;

  const displayScore = score > 0 ? score : 82;
  const displayTier = score > 0 ? tier : { label: 'Trusted', color: '#22C55E' };

  // Keep stats consistent with whatever score is showing
  const displayScheduled    = 23;
  const displayAttended     = displayScore >= 95 ? 23 : 19;
  const displayNoShows      = displayScore >= 95 ? 0  : 2;
  const displayCancelled    = displayScore >= 95 ? 0  : 2;
  const displayAttendance   = displayScore >= 95 ? '100%' : '83%';

  const fakeMyCourts = [
    { id: 'fake1', name: 'Pan American Recreation Center', count: 10, type: 'Indoor' },
    { id: 'fake3', name: "Gold's Gym Hester's Crossing",   count: 12, type: 'Indoor' },
    { id: 'fake4', name: 'Clay Madsen Recreation Center',  count: 5,  type: 'Indoor' },
  ];

  const fakeFriends = [
    { id: 'f1', name: 'Big Ray',   avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',   active: true },
    { id: 'f2', name: 'Jordan T.', avatarUrl: 'https://randomuser.me/api/portraits/men/44.jpg',   active: true },
    { id: 'f3', name: 'Keisha L.', avatarUrl: 'https://randomuser.me/api/portraits/women/45.jpg', active: false },
    { id: 'f4', name: 'Coach D',   avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg',   active: true },
    { id: 'f5', name: 'Aaliyah S.', avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg', active: false },
  ];

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
          <TouchableOpacity onPress={handlePickImage}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <Image
                source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }}
                style={styles.avatarImage}
              />
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{profile?.name || 'Marcus W.'}</Text>
          {profileSkillColors && (
            <View style={[styles.skillBadge, { backgroundColor: profileSkillColors.bg }]}>
              <Text style={[styles.skillText, { color: profileSkillColors.text }]}>
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
              <Text style={[styles.scoreNumber, { color: displayTier.color }]}>{displayScore}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={styles.tierInfo}>
              <View style={[styles.tierBadge, { backgroundColor: displayTier.color + '20' }]}>
                <View style={[styles.tierDot, { backgroundColor: displayTier.color }]} />
                <Text style={[styles.tierLabel, { color: displayTier.color }]}>{displayTier.label}</Text>
              </View>
              <Text style={styles.tierHint}>
                {displayScore >= 90
                  ? 'Players trust you to show up!'
                  : displayScore >= 75
                  ? 'Solid track record. Keep it up!'
                  : displayScore >= 50
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
                { width: `${displayScore}%`, backgroundColor: displayTier.color },
              ]}
            />
          </View>
        </View>

       {/* Stats Grid */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.statNumber}>{displayScheduled}</Text>
              <Text style={styles.statLabel}>Scheduled</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={styles.statNumber}>{displayAttended}</Text>
              <Text style={styles.statLabel}>Attended</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
              <Text style={styles.statNumber}>{displayNoShows}</Text>
              <Text style={styles.statLabel}>No-Shows</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="remove-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.statNumber}>{displayCancelled}</Text>
              <Text style={styles.statLabel}>Cancelled</Text>
            </View>
          </View>
          <View style={styles.attendanceRow}>
            <Text style={styles.attendanceLabel}>Attendance Rate</Text>
            <Text style={[styles.attendanceValue, { color: colors.success }]}>
              {displayAttendance}
            </Text>
          </View>
        </View>

        {/* My Courts */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Courts</Text>
          {fakeMyCourts.map((court, index) => (
            <View
              key={court.id}
              style={[
                styles.courtRow,
                index < fakeMyCourts.length - 1 && styles.courtRowBorder,
              ]}
            >
              <View style={styles.courtIcon}>
                <Ionicons name="basketball-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.courtInfo}>
                <Text style={styles.courtName} numberOfLines={1}>{court.name}</Text>
                <Text style={styles.courtMeta}>{court.type}</Text>
              </View>
              <View style={styles.courtBadge}>
                <View style={styles.courtDot} />
                <Text style={styles.courtCount}>{court.count}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* My Crew */}
        <View style={styles.card}>
          <View style={styles.crewHeaderRow}>
            <Text style={styles.cardTitle}>My Crew</Text>
            <Text style={styles.crewCount}>{fakeFriends.length} friends</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crewScroll}>
            {fakeFriends.map((friend) => (
              <View key={friend.id} style={styles.friendItem}>
                <View style={styles.friendAvatarWrapper}>
                  <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatar} />
                  {friend.active && <View style={styles.friendActiveDot} />}
                </View>
                <Text style={styles.friendName} numberOfLines={1}>{friend.name}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.friendItem}
              onPress={() => Alert.alert('Coming Soon', 'Friend requests coming in a future update!')}
            >
              <View style={styles.addFriendCircle}>
                <Ionicons name="person-add-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.friendName}>Add</Text>
            </TouchableOpacity>
          </ScrollView>
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
              <Ionicons name="calendar" size={14} color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.primary }]}>
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

        {/* Branding */}
        <View style={styles.brandingFooter}>
          <Logo size="small" />
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

const getStyles = (colors, isDark) =>
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
      borderWidth: 3,
      borderColor: colors.primary,
    },
    name: {
      fontSize: FONT_SIZES.title,
      fontWeight: FONT_WEIGHTS.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
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
      borderRadius: RADIUS.sm,
    },
    skillText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    // Cards — NRC-inspired dark card style
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      ...(isDark
        ? { borderWidth: 0 }  // No borders in dark mode
        : { borderWidth: 1, borderColor: colors.border }),
    },
    cardTitle: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
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
      fontSize: 52,
      fontWeight: FONT_WEIGHTS.extraBold,
    },
    scoreMax: {
      fontSize: FONT_SIZES.body,
      color: colors.textMuted,
      fontWeight: FONT_WEIGHTS.medium,
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
      borderRadius: RADIUS.md,
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
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    tierHint: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    scoreBarTrack: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
    },
    scoreBarFill: {
      height: 6,
      borderRadius: RADIUS.sm,
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
      fontWeight: FONT_WEIGHTS.extraBold,
      color: colors.textPrimary,
      marginTop: 4,
    },
    statLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
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
      fontWeight: FONT_WEIGHTS.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    attendanceValue: {
      fontSize: FONT_SIZES.subtitle,
      fontWeight: FONT_WEIGHTS.extraBold,
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
      fontWeight: FONT_WEIGHTS.medium,
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
      fontWeight: FONT_WEIGHTS.medium,
    },
    brandingFooter: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
      opacity: 0.6,
    },
    // My Courts
    courtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    courtRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    courtIcon: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.sm,
      backgroundColor: colors.primary + '18',
      justifyContent: 'center',
      alignItems: 'center',
    },
    courtInfo: {
      flex: 1,
    },
    courtName: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    courtMeta: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    courtBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    courtDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    courtCount: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.success,
    },
    // My Crew
    crewHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    crewCount: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      fontWeight: FONT_WEIGHTS.medium,
    },
    crewScroll: {
      gap: SPACING.md,
      paddingBottom: SPACING.xs,
    },
    friendItem: {
      alignItems: 'center',
      width: 58,
    },
    friendAvatarWrapper: {
      position: 'relative',
      marginBottom: 5,
    },
    friendAvatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 2,
      borderColor: colors.border,
    },
    friendActiveDot: {
      position: 'absolute',
      bottom: 1,
      right: 1,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.success,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    friendName: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    addFriendCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 2,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 5,
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
      fontWeight: FONT_WEIGHTS.semibold,
    },
    avatarImage: {
  width: 88,
  height: 88,
  borderRadius: 44,
  marginBottom: SPACING.sm,
  borderWidth: 3,
  borderColor: colors.primary,
},
editBadge: {
  position: 'absolute',
  bottom: SPACING.sm,
  right: 0,
  backgroundColor: colors.primary,
  borderRadius: 12,
  width: 24,
  height: 24,
  justifyContent: 'center',
  alignItems: 'center',
},
  });
