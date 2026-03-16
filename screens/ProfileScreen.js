/**
 * ProfileScreen.js — User Profile Dashboard
 *
 * A comprehensive profile view showing the signed-in user's identity,
 * performance metrics, court history, social connections, and settings.
 *
 * Sections:
 *   1. Avatar & User Info — Profile photo (tappable to pick a new one from
 *      the device library via `expo-image-picker`), display name, and
 *      skill-level badge.
 *   2. Reliability Score — Numeric score (0–100) with a colored tier badge
 *      (Elite / Trusted / Reliable / Developing), a descriptive hint, and
 *      a progress bar.
 *   3. Session Stats Grid — Scheduled / Attended / No-Shows / Cancelled counts
 *      with an Attendance Rate percentage.
 *   4. My Courts — The user's most-visited gyms with live player counts.
 *   5. Friend Requests — Incoming pending requests with Accept / Decline.
 *   6. My Crew — Horizontal scroll of friends, tappable to view their profile.
 *   7. Current Status — Real-time check-in status from `usePresence`, plus
 *      upcoming session count from `useSchedules`.
 *   8. Settings — Dark mode toggle wired to `toggleTheme` from ThemeContext.
 *   9. Sign Out — Calls `firebase/auth.signOut` and resets the navigation
 *      stack to the Login screen so the user can't navigate back.
 *
 * Data:
 *   - Firestore user profile (name, skillLevel) fetched once on mount via
 *     `getDoc` — not a real-time subscription since profile data rarely changes.
 *   - Reliability, schedules, and presence data come from their respective hooks.
 *   - Friends list comes from `liveProfile?.friends` (array of uid strings);
 *     friend profiles are fetched via Promise.all(getDoc).
 *   - Incoming friend requests queried from the `friendRequests` collection
 *     where toUid == currentUid and status == "pending".
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  Animated,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo } from '../components';
import { useAuth, useReliability, useSchedules, usePresence, useGyms, useProfile, useLivePresenceMap, useMyGymRequests } from '../hooks';
import { auth, db, storage } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  arrayUnion,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { registerPushToken } from '../utils/notifications';
import { RANKS } from '../config/ranks';
import { getUserRank, getProgressToNextRank } from '../utils/rankHelpers';
import { awardPoints } from '../services/pointsService';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * AnimatedCourtBadge — Pulsing green dot + player count for a My Courts row.
 *
 * Renders nothing when `count` is zero so the row stays clean.
 * When players are present the dot opacity loops 1.0 → 0.3 → 1.0 every ~700 ms,
 * giving a subtle "live" heartbeat without being distracting.
 *
 * @param {{ count: number, colors: object }} props
 */
function AnimatedCourtBadge({ count, colors }) {
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const isActive = count > 0;

  useEffect(() => {
    if (isActive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      dotOpacity.setValue(1);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Animated.View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: colors.success,
          opacity: dotOpacity,
        }}
      />
      <Text style={{ fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.bold, color: colors.success }}>
        {count}
      </Text>
    </View>
  );
}

/**
 * GymThumbnail — Renders a gym's image as a small rounded thumbnail,
 * falling back to the given icon if no image is available.
 *
 * Resolution order: GYM_LOCAL_IMAGES[gym.id] → gym.imageUrl → fallback icon.
 * Keeps the same 36×36 footprint as the old icon tile so rows don't shift.
 *
 * @param {{ gym: object, fallbackIcon: string, iconColor: string, style: object }} props
 */
function GymThumbnail({ gym, fallbackIcon, iconColor, style }) {
  const source = GYM_LOCAL_IMAGES[gym.id]
    ? GYM_LOCAL_IMAGES[gym.id]
    : gym.imageUrl
    ? { uri: gym.imageUrl }
    : null;

  if (source) {
    return (
      <Image
        source={source}
        style={[{ width: 36, height: 36, borderRadius: RADIUS.sm }, style]}
        resizeMode="cover"
      />
    );
  }

  // Fallback — same icon tile as before
  return (
    <View style={[{ width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Ionicons name={fallbackIcon} size={18} color={iconColor} />
    </View>
  );
}

/**
 * ProfileScreen — Authenticated user profile dashboard.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop used to reset the stack to Login on sign-out.
 * @returns {JSX.Element}
 */
export default function ProfileScreen({ navigation }) {
  const { isDark, colors, toggleTheme, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const { user } = useAuth();
  const { score, tier, stats, loading: reliabilityLoading } = useReliability();
  const { count: upcomingCount } = useSchedules();
  const { isCheckedIn, presence } = usePresence();
  const { gyms } = useGyms();
  const { followedGyms, profile: liveProfile } = useProfile();
  // Real-time player counts — same canonical source used by HomeScreen and ViewRunsScreen.
  const { countMap: liveCountMap } = useLivePresenceMap();
  const { count: gymRequestCount } = useMyGymRequests();
  const [profile, setProfile] = useState(null);

  // Derive the list of followed gym objects from the full gyms array.
  // Preserves the user's follow order and limits display to 3.
  const followedGymsList = followedGyms
    .map((id) => gyms.find((g) => g.id === id))
    .filter(Boolean)
    .slice(0, 3);
  const [profileLoading, setProfileLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState(null);
  const [uploading, setUploading] = useState(false);

  // ── Friends / Crew ────────────────────────────────────────────────────────
  // Resolved profile objects for each uid in liveProfile.friends
  const [friendsProfiles, setFriendsProfiles] = useState([]);

  // ── Incoming Friend Requests ──────────────────────────────────────────────
  // Shape: [{ id, fromUid, toUid, senderName, senderPhotoURL }]
  const [pendingRequests, setPendingRequests] = useState([]);

  // ID of the request row currently being accepted/declined — disables that
  // row's buttons while the Firestore writes are in-flight.
  const [processingRequestId, setProcessingRequestId] = useState(null);
  const [reliability, setReliability] = useState(null);
  const [showReliabilityInfo, setShowReliabilityInfo] = useState(false);

  // ── Rank / badge data — derived from live Firestore totalPoints ──────────
  const totalPoints = liveProfile?.totalPoints || 0;
  const userRank = getUserRank(totalPoints);
  const rankProgress = getProgressToNextRank(totalPoints);
  const pointsToNext = userRank.nextRankAt ? userRank.nextRankAt - totalPoints : 0;

  // High-tier pulsing glow — scale between 1.0 and 1.05 on loop
  // Applies to Platinum, Diamond, and Legend tiers
  const HIGH_GLOW_TIERS = ['Platinum', 'Diamond', 'Legend'];
  const hasHighGlow = HIGH_GLOW_TIERS.includes(userRank.name);
  const platinumPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (hasHighGlow) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(platinumPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(platinumPulse, { toValue: 1.0,  duration: 1500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      platinumPulse.setValue(1);
    }
  }, [userRank.name]);

  /**
   * handlePickImage — Opens the device photo library, uploads the selected
   * image to Firebase Storage, and persists the download URL to Firestore.
   *
   * Flow:
   *   1. Request MediaLibrary permission via Expo ImagePicker.
   *   2. Launch the image picker with a square crop.
   *   3. Convert the local URI to a Blob via fetch().blob().
   *   4. Upload the Blob to Storage at `profilePhotos/{uid}.jpg` using
   *      uploadBytesResumable (which supports progress tracking if needed).
   *   5. Retrieve the permanent download URL via getDownloadURL.
   *   6. Write `photoURL` to the user's Firestore document.
   *   7. Update local state with the download URL so the avatar refreshes.
   *
   * An `uploading` flag drives an ActivityIndicator overlay on the avatar
   * so the user gets visual feedback during the upload.
   */
  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],   // Force square crop for the circular avatar
      quality: 0.8,
    });

    if (result.canceled) return;

    const localUri = result.assets[0].uri;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setUploading(true);
    try {
      // Convert local URI → Blob (required by the Firebase Storage web SDK)
      const response = await fetch(localUri);
      const blob = await response.blob();

      // Upload to Storage — one file per user, overwrites on each update
      const storageRef = ref(storage, `profilePhotos/${uid}.jpg`);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      // Wait for the upload to complete
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, resolve);
      });

      // Retrieve the permanent, publicly-readable download URL
      const downloadURL = await getDownloadURL(storageRef);

      // Persist the URL so it survives app restarts and device changes
      await updateDoc(doc(db, 'users', uid), { photoURL: downloadURL });

      // Update the local avatar immediately without waiting for a Firestore read
      setPhotoUri(downloadURL);

      // Award profile-completion bonus once if the user also has a skill level set
      if (liveProfile?.skillLevel) {
        awardPoints(uid, 'completeProfile');
      }
    } catch (err) {
      console.error('handlePickImage upload error:', err);
      Alert.alert('Upload Failed', 'Could not save your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Fetch the Firestore user profile (name, skillLevel, age) once on mount.
  // This is a one-time read rather than a real-time subscription since
  // profile data changes infrequently and we don't need live updates here.
  // Also registers the device's Expo push token on first load.
  useEffect(() => {
    if (!user?.uid) {
      setProfileLoading(false);
      return;
    }
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          // Restore the saved profile photo so it appears on every login
          if (data.photoURL) setPhotoUri(data.photoURL);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();

    // Register push token once per session — non-critical, errors are swallowed
    registerPushToken();
  }, [user?.uid]);

  // Keep photoUri in sync with the real-time liveProfile.
  // Covers: first load before getDoc resolves, and cross-device photo updates.
  useEffect(() => {
    if (liveProfile?.photoURL) {
      console.log('[ProfileScreen] syncing photoUri from liveProfile.photoURL');
      setPhotoUri(liveProfile.photoURL);
    }
  }, [liveProfile?.photoURL]);

  // Fetch full profile objects for every uid in liveProfile.friends.
  // Re-runs whenever the friends array reference changes (i.e. when a new
  // friend is accepted and liveProfile updates from the real-time hook).
  useEffect(() => {
    if (!liveProfile?.friends?.length) {
      setFriendsProfiles([]);
      return;
    }
    const fetchFriends = async () => {
      try {
        const snaps = await Promise.all(
          liveProfile.friends.map((uid) => getDoc(doc(db, 'users', uid)))
        );
        const profiles = snaps
          .filter((s) => s.exists())
          .map((s) => ({ uid: s.id, ...s.data() }));
        setFriendsProfiles(profiles);
      } catch (err) {
        console.error('Failed to fetch friends profiles:', err);
      }
    };
    fetchFriends();
  }, [liveProfile?.friends]);

  // Real-time listener on the current user's document.
  // Whenever receivedRequests changes in Firestore, fetch those profiles
  // and rebuild the pendingRequests state — no polling needed.
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      async (snap) => {
        setReliability(snap.exists() ? (snap.data()?.reliability ?? null) : null);
        if (!snap.exists()) {
          setPendingRequests([]);
          return;
        }

        const receivedRequests = snap.data()?.receivedRequests ?? [];

        // Nothing pending — clear and bail early to avoid unnecessary reads.
        if (receivedRequests.length === 0) {
          setPendingRequests([]);
          return;
        }

        // Individual getDoc calls via Promise.all — sidesteps the Firestore
        // "in" query 10-item limit entirely, and is just as fast in practice
        // since all reads are dispatched in parallel.
        try {
          const profileSnaps = await Promise.all(
            receivedRequests.map((uid) => getDoc(doc(db, 'users', uid)))
          );

          const requests = profileSnaps
            .filter((s) => s.exists())
            .map((s) => ({
              id: s.id,                          // requester uid — used as row key and processingRequestId
              fromUid: s.id,
              toUid: user.uid,
              senderName: s.data().name || 'Player',
              senderPhotoURL: s.data().photoURL || null,
            }));

          setPendingRequests(requests);
        } catch (err) {
          console.error('Failed to fetch pending request profiles:', err);
        }
      },
      (err) => {
        console.error('onSnapshot error (pending requests):', err);
      }
    );

    // Unsubscribe when the component unmounts or uid changes — prevents
    // state updates on an unmounted component.
    return () => unsubscribe();
  }, [user?.uid]);

  /**
   * handleAcceptRequest — Accepts an incoming request via Cloud Function,
   * which atomically adds each user to the other's friends array and clears
   * the request from both sentRequests / receivedRequests.
   */
  const handleAcceptRequest = async (request) => {
    setProcessingRequestId(request.fromUid);
    try {
      const addFriendFn = httpsCallable(getFunctions(), 'addFriend');
      await addFriendFn({ friendUserId: request.fromUid });
      // Optimistic removal — onSnapshot will also sync shortly after
      setPendingRequests((prev) => prev.filter((r) => r.fromUid !== request.fromUid));
    } catch (err) {
      console.error('Failed to accept friend request:', err);
      Alert.alert('Error', 'Could not accept request. Please try again.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  /**
   * handleDeclineRequest — Declines an incoming request via Cloud Function,
   * which atomically removes the uid from both sentRequests / receivedRequests.
   */
  const handleDeclineRequest = async (request) => {
    setProcessingRequestId(request.fromUid);
    try {
      const declineFn = httpsCallable(getFunctions(), 'declineFriendRequest');
      await declineFn({ fromUid: request.fromUid });
      // Optimistic removal — onSnapshot will also sync shortly after
      setPendingRequests((prev) => prev.filter((r) => r.fromUid !== request.fromUid));
    } catch (err) {
      console.error('Failed to decline friend request:', err);
      Alert.alert('Error', 'Could not decline request. Please try again.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  /**
   * handleSignOut — Signs the user out of Firebase Auth and resets navigation.
   *
   * Uses `navigation.getParent()?.getParent()?.reset()` to navigate two levels
   * up (Profile → MainTabs → RootStack) and replace the entire stack with Login,
   * preventing the user from pressing Back to return to the authenticated screens.
   */
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
            // Reset two stack levels up to land on the Login route
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

  // Guard against stale skill values from the old 4-tier system (Pro, Beginner,
  // Intermediate, Advanced). Only the three current values are valid.
  const VALID_SKILL_LEVELS = ['Casual', 'Competitive', 'Either'];
  const displaySkillLevel = VALID_SKILL_LEVELS.includes(profile?.skillLevel)
    ? profile.skillLevel
    : 'Casual';

  // Look up skill badge colors for the validated level
  const profileSkillColors = skillColors[displaySkillLevel] ?? null;

  // Human-readable label — avoids showing "Either" raw
  const playStyleLabelMap = { Casual: 'Casual', Competitive: 'Competitive', Either: 'Casual / Competitive' };
  const displayPlayStyle = playStyleLabelMap[displaySkillLevel] ?? displaySkillLevel;

  // Real reliability data from the hook — zero-state for brand new users
  const displayScore = score || 0;
  const displayTier = tier || { label: 'New', color: colors.textMuted };

  // Real session stats from Firestore users/{uid}.reliability
  const displayScheduled  = reliability?.totalScheduled  ?? 0;
  const displayAttended   = reliability?.totalAttended   ?? 0;
  const displayNoShows    = reliability?.totalNoShow     ?? 0;
  const displayCancelled  = reliability?.totalCancelled  ?? 0;
  const displayRunsStarted = liveProfile?.runsStarted ?? 0;
  const _completionDenom  = displayAttended + displayCancelled + displayNoShows;
  const displayAttendance = _completionDenom > 0
    ? `${Math.round(((displayAttended + displayCancelled) / _completionDenom) * 100)}%`
    : '—';

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

  // Friend count label with correct singular/plural
  const friendCountLabel = (() => {
    const n = liveProfile?.friends?.length || 0;
    return n === 1 ? '1 friend' : `${n} friends`;
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Avatar & User Info ─────────────────────────────────────────── */}
        <LinearGradient
          colors={['#3D1E00', '#1A0A00', '#000000']}
          locations={[0, 0.55, 1]}
          style={styles.headerGradient}
        >
        <View style={styles.header}>
          {/* Tappable avatar: shows picked photo, live profile photo, or initials fallback */}
          <TouchableOpacity onPress={handlePickImage} disabled={uploading}>
            {(photoUri || liveProfile?.photoURL) ? (
              <Image source={{ uri: photoUri || liveProfile?.photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(profile?.name || liveProfile?.name || user?.displayName || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            {/* Upload spinner — overlays the avatar while the photo is uploading */}
            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
            {/* Camera badge overlay on the bottom-right of the avatar */}
            {!uploading && (
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.name}>{profile?.name || user?.displayName || 'Player'}</Text>
          {profileSkillColors && (
            <View style={[styles.skillBadge, { backgroundColor: profileSkillColors.bg }]}>
              <Text style={[styles.skillText, { color: profileSkillColors.text }]}>
                {displayPlayStyle}
              </Text>
            </View>
          )}

          {/* ── Rank Badge ──────────────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.rankBadge,
              {
                backgroundColor: userRank.color + '22',
                borderColor: userRank.color + '66',
                shadowColor: userRank.glowColor,
                // High tiers (Platinum+) get an extra-strong glow shadow
                shadowRadius: hasHighGlow ? 18 : 8,
                shadowOpacity: hasHighGlow ? 0.9 : 0.5,
              },
              { transform: [{ scale: platinumPulse }] },
            ]}
          >
            <Text style={styles.rankIcon}>{userRank.icon}</Text>
            <Text style={[styles.rankName, { color: userRank.color }]}>{userRank.name}</Text>
            <Text style={[styles.rankPoints, { color: userRank.color + 'CC' }]}>{totalPoints} pts</Text>
          </Animated.View>

          {/* Progress bar toward next rank */}
          <View style={styles.rankProgressWrap}>
            <View style={styles.rankProgressTrack}>
              <View
                style={[
                  styles.rankProgressFill,
                  { width: `${Math.round(rankProgress * 100)}%`, backgroundColor: userRank.color },
                ]}
              />
            </View>
            {userRank.nextRankAt ? (
              <Text style={styles.rankProgressLabel}>
                {pointsToNext} pts to {RANKS[RANKS.indexOf(userRank) + 1]?.name ?? ''}
              </Text>
            ) : (
              <Text style={styles.rankProgressLabel}>Max rank achieved 👑</Text>
            )}
          </View>

          {/* Leaderboard shortcut */}
          <TouchableOpacity
            style={styles.leaderboardLink}
            onPress={() => navigation.navigate('Leaderboard')}
          >
            <Ionicons name="trophy-outline" size={13} color={colors.primary} />
            <Text style={styles.leaderboardLinkText}>View Leaderboard</Text>
          </TouchableOpacity>
        </View>
        </LinearGradient>

        {/* ── Reliability Score ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reliability Score</Text>
          <View style={styles.scoreRow}>
            {/* Large numeric score on the left */}
            <View style={styles.scoreCircle}>
              <Text style={[styles.scoreNumber, { color: displayTier.color }]}>{displayScore}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            {/* Tier badge + contextual hint on the right */}
            <View style={styles.tierInfo}>
              <View style={[styles.tierBadge, { backgroundColor: displayTier.color + '20' }]}>
                <View style={[styles.tierDot, { backgroundColor: displayTier.color }]} />
                <Text style={[styles.tierLabel, { color: displayTier.color }]}>{displayTier.label}</Text>
              </View>
              {/* Hint text changes based on score range */}
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
          {/* Progress bar — width is percentage of score out of 100 */}
          <View style={styles.scoreBarTrack}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${displayScore}%`, backgroundColor: displayTier.color },
              ]}
            />
          </View>
          {/* Info link */}
          <TouchableOpacity
            onPress={() => setShowReliabilityInfo(true)}
            style={styles.reliabilityInfoLink}
          >
            <Ionicons name="information-circle-outline" size={13} color={colors.primary} />
            <Text style={styles.reliabilityInfoLinkText}>How reliability works</Text>
          </TouchableOpacity>
        </View>

        {/* ── Session Stats Grid ─────────────────────────────────────────── */}
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
          {/* Attendance rate — calculated as attended / scheduled */}
          <View style={styles.attendanceRow}>
            <Text style={styles.attendanceLabel}>Attendance Rate</Text>
            <Text style={[styles.attendanceValue, { color: colors.success }]}>
              {displayAttendance}
            </Text>
          </View>
          {/* Runs Started — total runs the user has created */}
          <View style={styles.attendanceRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flag-outline" size={14} color="#6366F1" />
              <Text style={styles.attendanceLabel}>Runs Started</Text>
            </View>
            <Text style={[styles.attendanceValue, { color: '#6366F1' }]}>
              {displayRunsStarted}
            </Text>
          </View>
        </View>

        {/* ── Home Court ────────────────────────────────────────────────── */}
        {/* Resolved from gyms list — no cached name stored on user doc */}
        {(() => {
          if (!liveProfile?.homeCourtId) return null;
          const homeGym = gyms.find((g) => g.id === liveProfile.homeCourtId);
          if (!homeGym) return null;
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Home Court</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('Runs', {
                    screen: 'RunDetails',
                    params: { gymId: homeGym.id, gymName: homeGym.name },
                  })
                }
                style={styles.courtRow}
              >
                <GymThumbnail
                  gym={homeGym}
                  fallbackIcon="home"
                  iconColor="#6366F1"
                  style={!homeGym.imageUrl && !GYM_LOCAL_IMAGES[homeGym.id] ? { backgroundColor: '#6366F118' } : null}
                />
                <View style={styles.courtInfo}>
                  <Text style={styles.courtName} numberOfLines={1}>{homeGym.name}</Text>
                  <Text style={styles.courtMeta}>{homeGym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}</Text>
                </View>
                <AnimatedCourtBadge count={liveCountMap[homeGym.id] ?? 0} colors={colors} />
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── My Courts ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Courts</Text>
          {followedGymsList.length > 0 ? (
            followedGymsList.map((gym, index) => (
              <TouchableOpacity
                key={gym.id}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('Runs', {
                    screen: 'RunDetails',
                    params: { gymId: gym.id, gymName: gym.name },
                  })
                }
                style={[
                  styles.courtRow,
                  // Bottom border between items, but not after the last one
                  index < followedGymsList.length - 1 && styles.courtRowBorder,
                ]}
              >
                <GymThumbnail
                  gym={gym}
                  fallbackIcon="basketball-outline"
                  iconColor={colors.primary}
                  style={!gym.imageUrl && !GYM_LOCAL_IMAGES[gym.id] ? styles.courtIcon : null}
                />
                <View style={styles.courtInfo}>
                  <Text style={styles.courtName} numberOfLines={1}>{gym.name}</Text>
                  <Text style={styles.courtMeta}>{gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}</Text>
                </View>
                {/* Live player count badge — only rendered when players are present */}
                <AnimatedCourtBadge count={liveCountMap[gym.id] ?? 0} colors={colors} />
              </TouchableOpacity>
            ))
          ) : (
            /* Empty state — shown until the user follows at least one gym */
            <View style={styles.courtsEmpty}>
              <Ionicons name="heart-outline" size={24} color={colors.textMuted} />
              <Text style={styles.courtsEmptyText}>No courts followed yet</Text>
              <Text style={styles.courtsEmptySubtext}>
                Follow a gym to see it here
              </Text>
            </View>
          )}
        </View>

        {/* ── Friend Requests ───────────────────────────────────────────── */}
        {/* Only rendered when there is at least one pending incoming request */}
        {pendingRequests.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Friend Requests</Text>
            {pendingRequests.map((request) => (
              <View key={request.id} style={styles.requestItem}>
                {/* Sender avatar or placeholder */}
                {request.senderPhotoURL ? (
                  <Image
                    source={{ uri: request.senderPhotoURL }}
                    style={styles.requestAvatar}
                  />
                ) : (
                  <View style={[styles.requestAvatar, styles.requestAvatarPlaceholder]}>
                    <Ionicons name="person" size={18} color={colors.textMuted} />
                  </View>
                )}
                <Text style={styles.requestName} numberOfLines={1}>
                  {request.senderName}
                </Text>
                <View style={styles.requestActions}>
                  {/* Accept — disabled while any row is processing */}
                  <TouchableOpacity
                    style={styles.requestAcceptBtn}
                    onPress={() => handleAcceptRequest(request)}
                    disabled={processingRequestId === request.id}
                  >
                    {processingRequestId === request.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.requestBtnText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                  {/* Decline */}
                  <TouchableOpacity
                    style={styles.requestDeclineBtn}
                    onPress={() => handleDeclineRequest(request)}
                    disabled={processingRequestId === request.id}
                  >
                    <Text style={[styles.requestBtnText, styles.requestDeclineBtnText]}>
                      Decline
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── My Crew ───────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.crewHeaderRow}>
            <Text style={styles.cardTitle}>My Crew</Text>
            <Text style={styles.crewCount}>{friendCountLabel}</Text>
          </View>
          {friendsProfiles.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.crewScroll}
            >
              {friendsProfiles.map((friend) => (
                <TouchableOpacity
                  key={friend.uid}
                  style={styles.friendItem}
                  onPress={() => navigation.navigate('Home', { screen: 'UserProfile', params: { userId: friend.uid } })}
                >
                  <View style={styles.friendAvatarWrapper}>
                    {friend.photoURL ? (
                      <Image
                        source={{ uri: friend.photoURL }}
                        style={styles.friendAvatar}
                      />
                    ) : (
                      <View style={[styles.friendAvatar, styles.friendAvatarPlaceholder]}>
                        <Ionicons name="person" size={20} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.friendName} numberOfLines={1}>
                    {friend.name || 'Player'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            /* Empty state — shown until the user has at least one friend */
            <View style={styles.crewEmpty}>
              <Ionicons name="people-outline" size={24} color={colors.textMuted} />
              <Text style={styles.crewEmptyText}>No crew yet</Text>
              <Text style={styles.crewEmptySubtext}>
                Send friend requests to build your crew
              </Text>
            </View>
          )}
        </View>

        {/* ── Current Status ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={isCheckedIn ? 0.7 : 1}
          disabled={!isCheckedIn}
          onPress={() => {
            if (isCheckedIn && presence?.gymId) {
              navigation.navigate('Runs', {
                screen: 'RunDetails',
                params: { gymId: presence.gymId, gymName: presence.gymName },
              });
            }
          }}
        >
          <Text style={styles.cardTitle}>Current Status</Text>
          {/* Live check-in status from usePresence — real-time Firestore data */}
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
          {/* Upcoming scheduled sessions count from useSchedules */}
          {upcomingCount > 0 && (
            <View style={[styles.statusRow, { marginTop: SPACING.xs }]}>
              <Ionicons name="calendar" size={14} color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.primary }]}>
                {upcomingCount} upcoming {upcomingCount === 1 ? 'session' : 'sessions'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Premium Teaser ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.premiumCard}
          activeOpacity={0.82}
          onPress={() => navigation.navigate('Premium')}
        >
          {/* Icon + title row */}
          <View style={styles.premiumTopRow}>
            <View style={styles.premiumIconWrap}>
              <Ionicons name="flash" size={22} color="#FF6B35" />
            </View>
            <View style={styles.premiumText}>
              <View style={styles.premiumTitleRow}>
                <Text style={styles.premiumTitle}>RunCheck Premium</Text>
                <View style={styles.premiumPill}>
                  <Text style={styles.premiumPillText}>Coming Soon</Text>
                </View>
              </View>
              <Text style={styles.premiumSubtitle}>
                Unlock private runs, skill filters, smart alerts, unlimited clips, and more.
              </Text>
            </View>
          </View>
          {/* CTA link row */}
          <View style={styles.premiumCtaRow}>
            <Text style={styles.premiumCtaText}>See What's Included</Text>
            <Ionicons name="chevron-forward" size={14} color="#FF6B35" />
          </View>
        </TouchableOpacity>

        {/* ── My Gym Requests ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.gymRequestsRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MyGymRequests')}
        >
          <View style={styles.gymRequestsLeft}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <Text style={styles.gymRequestsLabel}>My Gym Requests</Text>
          </View>
          <View style={styles.gymRequestsRight}>
            {gymRequestCount > 0 && (
              <View style={styles.gymRequestsBadge}>
                <Text style={styles.gymRequestsBadgeText}>{gymRequestCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* ── My Reports ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.gymRequestsRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MyReports')}
        >
          <View style={styles.gymRequestsLeft}>
            <Ionicons name="flag-outline" size={20} color={colors.primary} />
            <Text style={styles.gymRequestsLabel}>My Reports</Text>
          </View>
          <View style={styles.gymRequestsRight}>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* ── Admin Tools (visible only to admins) ──────────────────── */}
        {liveProfile?.isAdmin === true && (
          <TouchableOpacity
            style={styles.adminToolsRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('AdminTools')}
          >
            <View style={styles.gymRequestsLeft}>
              <Ionicons name="construct-outline" size={20} color={colors.primary} />
              <Text style={styles.gymRequestsLabel}>Admin Tools</Text>
            </View>
            <View style={styles.gymRequestsRight}>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Settings ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLabel}>
              {/* Icon switches between moon (dark) and sun (light) based on current mode */}
              <Ionicons
                name={isDark ? 'moon' : 'sunny-outline'}
                size={22}
                color={colors.textPrimary}
              />
              <Text style={styles.settingText}>Dark Mode</Text>
            </View>
            {/* Switch disabled — dark mode is forced for this development phase */}
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              disabled
              testID="dark-mode-toggle"
            />
          </View>
        </View>

        {/* ── Branding Footer ───────────────────────────────────────────── */}
        <View style={styles.brandingFooter}>
          <Logo size="small" />
        </View>

        {/* ── Sign Out ──────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Reliability Info Modal ─────────────────────────────────────── */}
      <Modal
        visible={showReliabilityInfo}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReliabilityInfo(false)}
      >
        <TouchableOpacity
          style={styles.reliabilityModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowReliabilityInfo(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.reliabilityModalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.reliabilityModalTitle, { color: colors.textPrimary }]}>
              How Reliability Works
            </Text>
            <Text style={[styles.reliabilityModalBody, { color: colors.textSecondary }]}>
              Your reliability score reflects how consistently you show up to runs you commit to.
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• Attending a run protects your score'}
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• Cancelling 2+ hours before start has no penalty'}
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• Cancelling within 2 hours of start counts as a late cancel (\u22128)'}
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• No-shows lower your score the most (\u221220)'}
            </Text>
            <Text style={[styles.reliabilityModalBody, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
              The more you play and show up, the more stable your score becomes.
            </Text>
            <TouchableOpacity
              style={[styles.reliabilityModalClose, { backgroundColor: colors.primary }]}
              onPress={() => setShowReliabilityInfo(false)}
            >
              <Text style={styles.reliabilityModalCloseText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for ProfileScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
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
    headerGradient: {
      marginHorizontal: -SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingTop: 40,
      paddingBottom: 28,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.lg,
    },
    header: {
      alignItems: 'center',
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
    // Cards — no border in dark mode (surface bg provides enough separation)
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      ...(isDark
        ? { borderWidth: 0 }
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
    // Premium teaser card
    premiumCard: {
      backgroundColor: isDark ? '#1F1510' : '#FFF3ED',
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: '#FF6B3544',
    },
    premiumTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    premiumIconWrap: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.sm,
      backgroundColor: '#FF6B3520',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.sm,
      flexShrink: 0,
    },
    premiumText: {
      flex: 1,
    },
    premiumTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: 3,
    },
    premiumTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FF6B35',
      marginRight: SPACING.xs,
    },
    premiumPill: {
      backgroundColor: '#FF6B3520',
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: '#FF6B3555',
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    premiumPillText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FF6B35',
      letterSpacing: 0.5,
    },
    premiumSubtitle: {
      fontSize: FONT_SIZES.small,
      color: isDark ? '#FF8F60' : '#C4501A',
      lineHeight: 18,
    },
    premiumCtaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.sm,
      paddingTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: '#FF6B3530',
    },
    premiumCtaText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: '#FF6B35',
      marginRight: 3,
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
    // Gym Requests link
    gymRequestsRow: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
    },
    gymRequestsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    gymRequestsLabel: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.textPrimary,
    },
    gymRequestsRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    gymRequestsBadge: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    gymRequestsBadgeText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
    },
    // Admin Tools link
    adminToolsRow: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...(isDark
        ? { borderWidth: 0 }
        : { borderWidth: 1, borderColor: colors.border }),
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
    // courtBadge / courtDot / courtCount styles removed — badge is now rendered
    // by the AnimatedCourtBadge component with inline styles so it can own its
    // own animated Animated.View opacity.
    courtsEmpty: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      gap: SPACING.xs,
    },
    courtsEmptyText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textSecondary,
      marginTop: SPACING.xs,
    },
    courtsEmptySubtext: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
    },
    // ── Friend Requests card ─────────────────────────────────────────────────
    requestItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    requestAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    requestAvatarPlaceholder: {
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    requestName: {
      flex: 1,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    requestActions: {
      flexDirection: 'row',
      gap: SPACING.xs,
    },
    requestAcceptBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: RADIUS.sm,
      minWidth: 64,
      alignItems: 'center',
    },
    requestDeclineBtn: {
      backgroundColor: colors.surface,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 64,
      alignItems: 'center',
    },
    requestBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.semibold,
      color: '#fff',
    },
    requestDeclineBtnText: {
      color: colors.textSecondary,
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
    crewEmpty: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      gap: SPACING.xs,
    },
    crewEmptyText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textSecondary,
      marginTop: SPACING.xs,
    },
    crewEmptySubtext: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      textAlign: 'center',
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
    friendAvatarPlaceholder: {
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Green dot positioned at the bottom-right of the friend's avatar
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
    avatarPlaceholder: {
  backgroundColor: colors.surface,
  justifyContent: 'center',
  alignItems: 'center',
},
    avatarInitial: {
  fontSize: 32,
  fontWeight: '700',
  color: colors.primary,
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
    uploadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Rank badge ──────────────────────────────────────────────────────────
    rankBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: RADIUS.full,
      borderWidth: 1.5,
      marginTop: SPACING.xs,
      marginBottom: 2,
      gap: SPACING.xs,
      // iOS shadow
      shadowOffset: { width: 0, height: 0 },
      elevation: 6, // Android glow approximation
    },
    rankIcon: {
      fontSize: 16,
    },
    rankName: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.4,
    },
    rankPoints: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.medium,
    },
    rankProgressWrap: {
      width: '80%',
      alignSelf: 'center',
      alignItems: 'center',
      marginTop: 4,
    },
    rankProgressTrack: {
      width: '100%',
      height: 5,
      backgroundColor: colors.border,
      borderRadius: RADIUS.full,
      overflow: 'hidden',
    },
    rankProgressFill: {
      height: '100%',
      borderRadius: RADIUS.full,
    },
    rankProgressLabel: {
      fontSize: FONT_SIZES.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    leaderboardLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: SPACING.sm,
    },
    leaderboardLinkText: {
      fontSize: FONT_SIZES.small,
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    // Reliability info link
    reliabilityInfoLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: SPACING.sm,
      alignSelf: 'flex-start',
    },
    reliabilityInfoLinkText: {
      fontSize: FONT_SIZES.xs,
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.medium,
    },
    // Reliability info modal
    reliabilityModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    reliabilityModalSheet: {
      borderTopLeftRadius: RADIUS.lg,
      borderTopRightRadius: RADIUS.lg,
      padding: SPACING.lg,
      paddingBottom: SPACING.xl,
    },
    reliabilityModalTitle: {
      fontSize: FONT_SIZES.subtitle,
      fontWeight: FONT_WEIGHTS.extraBold,
      marginBottom: SPACING.md,
    },
    reliabilityModalBody: {
      fontSize: FONT_SIZES.body,
      lineHeight: 22,
    },
    reliabilityModalBullet: {
      fontSize: FONT_SIZES.body,
      lineHeight: 26,
      marginTop: 2,
    },
    reliabilityModalClose: {
      marginTop: SPACING.lg,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.sm + 2,
      alignItems: 'center',
    },
    reliabilityModalCloseText: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#fff',
    },
  });
