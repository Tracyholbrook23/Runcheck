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

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  FlatList,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useFocusEffect } from '@react-navigation/native';
import { Logo } from '../components';
import { useAuth, useReliability, useSchedules, usePresence, useGyms, useProfile, useLivePresenceMap, useMyGymRequests, useUserClips, useTaggedClips } from '../hooks';
import { useConversations } from '../hooks/useConversations';
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
import { BlurView } from 'expo-blur';

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
  const { isDark, colors, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const { user } = useAuth();
  const { score, tier, displayScore: hookDisplayScore, displayTier: hookDisplayTier, stats, loading: reliabilityLoading } = useReliability();
  const { count: upcomingCount } = useSchedules();
  const { isCheckedIn, presence } = usePresence();
  const { gyms } = useGyms();
  const { followedGyms, profile: liveProfile } = useProfile();
  // Real-time player counts — same canonical source used by HomeScreen and ViewRunsScreen.
  const { countMap: liveCountMap } = useLivePresenceMap();
  const { pendingCount: gymRequestCount } = useMyGymRequests();
  const { unreadCount: dmUnreadCount } = useConversations();
  const { clips: userClips, videoUrls: clipVideoUrls, thumbnails: clipThumbnails, loading: clipsLoading } = useUserClips(user?.uid);
  const { allTagged: taggedClips, featuredIn: featuredInClips, videoUrls: taggedVideoUrls, thumbnails: taggedThumbnails, loading: taggedClipsLoading, refetch: refetchTaggedClips } = useTaggedClips(user?.uid);

  // Re-fetch tagged clips when the screen regains focus (e.g. after
  // tapping "Add to my profile" on ClipPlayerScreen and navigating back).
  useFocusEffect(useCallback(() => { refetchTaggedClips(); }, [refetchTaggedClips]));

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
  const [showReliabilityInfo, setShowReliabilityInfo] = useState(false);

  // ── Admin workload badge (all 4 categories visible in Admin Tools) ───────
  const [adminPendingTotal, setAdminPendingTotal] = useState(0);

  useEffect(() => {
    if (liveProfile?.isAdmin !== true) return;

    let pendingGymReqs = 0;
    let pendingReports = 0;
    let activeSuspended = 0;
    let hiddenClipsCount = 0;
    const update = () => setAdminPendingTotal(pendingGymReqs + pendingReports + activeSuspended + hiddenClipsCount);

    const gymQ = query(
      collection(db, 'gymRequests'),
      where('status', '==', 'pending')
    );
    const unsubGym = onSnapshot(gymQ, (snap) => { pendingGymReqs = snap.size; update(); }, () => {});

    const reportQ = query(
      collection(db, 'reports'),
      where('status', '==', 'pending')
    );
    const unsubReports = onSnapshot(reportQ, (snap) => { pendingReports = snap.size; update(); }, () => {});

    const suspendedQ = query(
      collection(db, 'users'),
      where('isSuspended', '==', true)
    );
    const unsubSuspended = onSnapshot(suspendedQ, (snap) => {
      const now = new Date();
      activeSuspended = snap.docs.filter((d) => {
        const endsAt = d.data().suspensionEndsAt?.toDate?.();
        return !endsAt || endsAt > now;
      }).length;
      update();
    }, () => {});

    const hiddenQ = query(
      collection(db, 'gymClips'),
      where('isHidden', '==', true)
    );
    const unsubHidden = onSnapshot(hiddenQ, (snap) => { hiddenClipsCount = snap.size; update(); }, () => {});

    return () => { unsubGym(); unsubReports(); unsubSuspended(); unsubHidden(); };
  }, [liveProfile?.isAdmin]);

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

    // Rejects after ms milliseconds — guards against stalled connections that
    // never error, which would leave the upload spinner running indefinitely.
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Upload timed out')), ms)
        ),
      ]);

    setUploading(true);
    try {
      // Convert local URI → Blob (required by the Firebase Storage web SDK)
      const response = await withTimeout(fetch(localUri), 30000);
      const blob = await response.blob();

      // Upload to Storage — one file per user, overwrites on each update
      const storageRef = ref(storage, `profilePhotos/${uid}.jpg`);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      // Wait for the upload to complete (30s timeout guards against stalled connections)
      await withTimeout(
        new Promise((resolve, reject) => {
          uploadTask.on('state_changed', null, reject, resolve);
        }),
        30000
      );

      // Retrieve the permanent, publicly-readable download URL
      const downloadURL = await withTimeout(getDownloadURL(storageRef), 15000);

      // Persist the URL so it survives app restarts and device changes
      await withTimeout(updateDoc(doc(db, 'users', uid), { photoURL: downloadURL }), 15000);

      // Update the local avatar immediately without waiting for a Firestore read
      setPhotoUri(downloadURL);

      // Award profile-completion bonus once if the user also has a skill level set
      if (liveProfile?.skillLevel) {
        awardPoints(uid, 'completeProfile');
      }
    } catch (err) {
      if (__DEV__) console.error('handlePickImage upload error:', err);
      const isTimeout = err?.message === 'Upload timed out';
      Alert.alert(
        'Upload Failed',
        isTimeout
          ? 'Upload timed out. Please check your connection and try again.'
          : 'Could not save your photo. Please try again.'
      );
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
        if (__DEV__) console.error('Failed to load profile:', err);
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
      if (__DEV__) console.log('[ProfileScreen] syncing photoUri from liveProfile.photoURL');
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
        if (__DEV__) console.error('Failed to fetch friends profiles:', err);
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
          if (__DEV__) console.error('Failed to fetch pending request profiles:', err);
        }
      },
      (err) => {
        if (__DEV__) console.error('onSnapshot error (pending requests):', err);
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
      if (__DEV__) console.error('Failed to accept friend request:', err);
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
      if (__DEV__) console.error('Failed to decline friend request:', err);
      Alert.alert('Error', 'Could not decline request. Please try again.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Guard against stale skill values from the old 4-tier system (Pro, Beginner,
  // Intermediate, Advanced). Only the three current values are valid.
  const VALID_SKILL_LEVELS = ['Casual', 'Competitive', 'Either'];
  // Prefer liveProfile (real-time subscription) so edits from EditProfileScreen
  // reflect immediately. Fall back to the one-time `profile` snapshot if needed.
  const rawSkillLevel = liveProfile?.skillLevel ?? profile?.skillLevel;
  const displaySkillLevel = VALID_SKILL_LEVELS.includes(rawSkillLevel)
    ? rawSkillLevel
    : 'Casual';

  // Look up skill badge colors for the validated level
  const profileSkillColors = skillColors[displaySkillLevel] ?? null;

  // Human-readable label — avoids showing "Either" raw
  const playStyleLabelMap = { Casual: 'Casual', Competitive: 'Competitive', Either: 'Casual / Competitive' };
  const displayPlayStyle = playStyleLabelMap[displaySkillLevel] ?? displaySkillLevel;

  // Display score/tier come from the hook with the visibility threshold applied:
  // pinned to 100 until the user has 3 processed runs, then shows the real value.
  const displayScore = hookDisplayScore ?? 0;
  const displayTier = hookDisplayTier || { label: 'New', color: colors.textMuted };

  // Session stats from the same useReliability hook that provides score/tier.
  // Previously read from a separate inline onSnapshot `reliability` state, which
  // could resolve after reliabilityLoading cleared — causing a flash of zeroes. RC-004.
  const displayScheduled  = stats?.totalScheduled  ?? 0;
  const displayAttended   = stats?.totalAttended   ?? 0;
  const displayNoShows    = stats?.totalNoShow     ?? 0;
  const displayCancelled  = stats?.totalCancelled  ?? 0;
  const displayRunsStarted = liveProfile?.runsStarted ?? 0;
  const _completionDenom  = displayAttended + displayCancelled + displayNoShows;
  const displayAttendance = _completionDenom > 0
    ? `${Math.round(((displayAttended + displayCancelled) / _completionDenom) * 100)}%`
    : '—';

  const loading = profileLoading || reliabilityLoading;

  // ── Loading state — skeleton screen ──────────────────────────────────────
  // Mirrors the gradient header → stats → sections layout for instant feel.
  const skelBase  = 'rgba(255,255,255,0.10)';  // always on dark gradient
  const skelLight = 'rgba(255,255,255,0.06)';

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false}>

          {/* Header placeholder */}
          <View style={[styles.headerGradient, { alignItems: 'center', paddingBottom: 32 }]}>
            {/* Avatar circle */}
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: skelBase, marginBottom: 12 }} />
            {/* Name */}
            <View style={{ width: 140, height: 18, borderRadius: 9, backgroundColor: skelBase, marginBottom: 8 }} />
            {/* Username */}
            <View style={{ width: 90, height: 12, borderRadius: 6, backgroundColor: skelLight, marginBottom: 16 }} />
            {/* Rank card placeholder */}
            <View style={{ width: 200, height: 56, borderRadius: RADIUS.lg, backgroundColor: skelBase }} />
          </View>

          {/* Stats row placeholder */}
          <View style={{ flexDirection: 'row', marginHorizontal: SPACING.md, marginTop: SPACING.lg, gap: SPACING.sm }}>
            {[1, 2, 3].map(i => (
              <View key={i} style={{ flex: 1, height: 72, borderRadius: RADIUS.md, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }} />
            ))}
          </View>

          {/* Section placeholder rows */}
          <View style={{ padding: SPACING.lg, gap: SPACING.md, marginTop: SPACING.sm }}>
            {[1, 2, 3, 4, 5].map(i => (
              <View key={i} style={{ height: 14, borderRadius: 7, width: i % 2 === 0 ? '60%' : '85%', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
            ))}
          </View>

        </ScrollView>
      </SafeAreaView>
    );
  }

  // Friend count label with correct singular/plural
  const friendCountLabel = (() => {
    const n = liveProfile?.friends?.length || 0;
    return n === 1 ? '1 friend' : `${n} friends`;
  })();

  return (
    <ImageBackground source={require('../assets/images/profllepg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
      <View style={styles.overlay} />
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Avatar & User Info ─────────────────────────────────────────── */}
        <View style={styles.headerGradient}>
        <View style={styles.header}>
          {/* Tappable avatar: shows picked photo, live profile photo, or initials fallback */}
          <TouchableOpacity onPress={handlePickImage} disabled={uploading}>
            {/* Gradient ring — orange → deep red → near-black → orange */}
            <LinearGradient
              colors={['#FF4500', '#CC1100', '#1A0000', '#FF6B00']}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                {(photoUri || liveProfile?.photoURL) ? (
                  <Image source={{ uri: photoUri || liveProfile?.photoURL }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>
                      {(liveProfile?.name || profile?.name || user?.displayName || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
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
          <Text style={styles.name}>{liveProfile?.name || profile?.name || user?.displayName || 'Player'}</Text>
          {(profile?.username || liveProfile?.username) ? (
            <Text style={styles.usernameText}>@{profile?.username || liveProfile?.username}</Text>
          ) : null}
          {/* ── Rank + Skill unified card ────────────────────────────────── */}
          <Animated.View
            style={[
              styles.rankCard,
              {
                backgroundColor: userRank.color + '14',
                borderColor: userRank.color + '44',
                shadowColor: userRank.glowColor,
                shadowRadius: hasHighGlow ? 18 : 8,
                shadowOpacity: hasHighGlow ? 0.8 : 0.3,
              },
              { transform: [{ scale: platinumPulse }] },
            ]}
          >
            {/* Top row: rank on left, skill badge on right */}
            <View style={styles.rankCardHeader}>
              <View style={styles.rankCardLeft}>
                <Text style={styles.rankIcon}>{userRank.icon}</Text>
                <Text style={[styles.rankName, { color: userRank.color }]}>{userRank.name}</Text>
              </View>
              {profileSkillColors && (
                <View style={[styles.skillBadge, { backgroundColor: profileSkillColors.bg }]}>
                  <Text style={[styles.skillText, { color: profileSkillColors.text }]}>
                    {displayPlayStyle}
                  </Text>
                </View>
              )}
            </View>

            {/* Points */}
            <Text style={[styles.rankPoints, { color: userRank.color + 'CC' }]}>{totalPoints} pts</Text>

            {/* Progress bar */}
            <View style={styles.rankProgressTrack}>
              <View
                style={[
                  styles.rankProgressFill,
                  { width: `${Math.round(rankProgress * 100)}%`, backgroundColor: userRank.color },
                ]}
              />
            </View>

            {/* Label */}
            {userRank.nextRankAt ? (
              <Text style={styles.rankProgressLabel}>
                {pointsToNext} pts to {RANKS[RANKS.indexOf(userRank) + 1]?.name ?? ''}
              </Text>
            ) : (
              <Text style={styles.rankProgressLabel}>Max rank achieved 👑</Text>
            )}
          </Animated.View>

          {/* Leaderboard button */}
          <TouchableOpacity
            style={[styles.leaderboardBtn, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '18' }]}
            onPress={() => navigation.navigate('Leaderboard')}
          >
            <Ionicons name="trophy" size={14} color={colors.primary} />
            <Text style={[styles.leaderboardBtnText, { color: colors.primary }]}>View Leaderboard</Text>
          </TouchableOpacity>
        </View>
        </View>

        {/* ── Reliability Score ──────────────────────────────────────────── */}
        <View style={[styles.card, { borderWidth: 1, borderColor: displayTier.color + '40' }]}>
          {/* Header: tier badge left, info icon right */}
          <View style={styles.reliabilityHeaderRow}>
            <View style={[styles.tierBadge, { backgroundColor: displayTier.color + '20' }]}>
              <View style={[styles.tierDot, { backgroundColor: displayTier.color }]} />
              <Text style={[styles.tierLabel, { color: displayTier.color }]}>{displayTier.label}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowReliabilityInfo(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {/* Score number */}
          <Text style={styles.reliabilityScoreLabel}>Reliability Score</Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreNumber, { color: displayTier.color }]}>{displayScore}</Text>
            <Text style={[styles.scoreMax, { color: displayTier.color + '70' }]}>/100</Text>
          </View>
          {/* Progress bar */}
          <View style={styles.scoreBarTrack}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${displayScore}%`, backgroundColor: displayTier.color },
              ]}
            />
          </View>
          {/* Hint text */}
          <Text style={styles.tierHint}>
            {displayScore >= 90
              ? 'Players trust you to show up!'
              : displayScore >= 75
              ? 'Solid track record. Keep it up.'
              : displayScore >= 50
              ? 'Room for improvement.'
              : 'Attend more sessions to rebuild trust.'}
          </Text>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <Text style={styles.cardTitle}>My Crew</Text>
              <Text style={styles.crewCount}>{friendCountLabel}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('SearchUsers')}
              style={styles.crewSearchButton}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
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

        {/* ── My Clips ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.clipsSectionHeader}>
            <Text style={styles.cardTitle}>My Clips</Text>
            {userClips.length > 0 && (
              <View style={styles.clipsCountBadge}>
                <Text style={styles.clipsCountText}>{userClips.length}</Text>
              </View>
            )}
          </View>
          {clipsLoading ? (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[1, 2, 3]}
              keyExtractor={(item) => String(item)}
              contentContainerStyle={styles.clipsRow}
              renderItem={() => <View style={styles.clipSkeletonTile} />}
            />
          ) : userClips.length > 0 ? (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={userClips}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.clipsRow}
              renderItem={({ item: clip }) => {
                const videoUrl = clipVideoUrls[clip.id];
                const thumbUri = clipThumbnails[clip.id];
                return (
                  <TouchableOpacity
                    style={styles.clipTile}
                    onPress={() => {
                      if (videoUrl) navigation.navigate('ClipPlayer', { videoUrl, clipId: clip.id, gymId: clip.gymId });
                    }}
                    activeOpacity={0.85}
                  >
                    {thumbUri ? (
                      <Image source={{ uri: thumbUri }} style={styles.clipTileThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.clipTilePlaceholder} />
                    )}
                    {/* Bottom scrim */}
                    <View style={styles.clipTileScrim} />
                    {/* Center play icon */}
                    <View style={styles.clipTilePlayOverlay}>
                      <Ionicons
                        name={videoUrl ? 'play-circle' : 'hourglass-outline'}
                        size={28}
                        color="rgba(255,255,255,0.9)"
                      />
                    </View>
                    {/* Bottom time label */}
                    <View style={styles.clipTileBottomRow}>
                      <Text style={styles.clipTileTime}>
                        {clip.createdAt
                          ? (() => {
                              const d = clip.createdAt.toDate ? clip.createdAt.toDate() : new Date(clip.createdAt);
                              const s = Math.floor((Date.now() - d.getTime()) / 1000);
                              if (s < 60) return 'now';
                              const m = Math.floor(s / 60);
                              if (m < 60) return `${m}m`;
                              const h = Math.floor(m / 60);
                              if (h < 24) return `${h}h`;
                              return `${Math.floor(h / 24)}d`;
                            })()
                          : ''}
                      </Text>
                    </View>
                    {/* Processing badge */}
                    {clip.status === 'ready_raw' && (
                      <View style={styles.clipTileProcessing}>
                        <Text style={styles.clipTileProcessingText}>Processing…</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          ) : (
            <View style={styles.clipsEmpty}>
              <Ionicons name="videocam-outline" size={24} color={colors.textMuted} />
              <Text style={styles.clipsEmptyText}>No clips yet</Text>
              <Text style={styles.clipsEmptySubtext}>
                Record clips at a gym to see them here
              </Text>
            </View>
          )}
        </View>

        {/* ── Tagged In (own profile only — private review surface) ─────── */}
        {taggedClips.length > 0 && (
          <View style={styles.card}>
            <View style={styles.clipsSectionHeader}>
              <Text style={styles.cardTitle}>Tagged In</Text>
              <View style={styles.clipsCountBadge}>
                <Text style={styles.clipsCountText}>{taggedClips.length}</Text>
              </View>
            </View>
            {taggedClipsLoading ? (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[1, 2, 3]}
                keyExtractor={(item) => String(item)}
                contentContainerStyle={styles.clipsRow}
                renderItem={() => <View style={styles.clipSkeletonTile} />}
              />
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={taggedClips}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.clipsRow}
                renderItem={({ item: clip }) => {
                  const videoUrl = taggedVideoUrls[clip.id];
                  const thumbUri = taggedThumbnails[clip.id];
                  return (
                    <TouchableOpacity
                      style={styles.clipTile}
                      onPress={() => {
                        if (videoUrl) navigation.navigate('ClipPlayer', { videoUrl, clipId: clip.id, gymId: clip.gymId });
                      }}
                      activeOpacity={0.85}
                    >
                      {thumbUri ? (
                        <Image source={{ uri: thumbUri }} style={styles.clipTileThumb} resizeMode="cover" />
                      ) : (
                        <View style={styles.clipTilePlaceholder} />
                      )}
                      <View style={styles.clipTileScrim} />
                      <View style={styles.clipTilePlayOverlay}>
                        <Ionicons
                          name={videoUrl ? 'play-circle' : 'hourglass-outline'}
                          size={28}
                          color="rgba(255,255,255,0.9)"
                        />
                      </View>
                      <View style={styles.clipTileBottomRow}>
                        <Text style={styles.clipTileTime}>
                          {clip.createdAt
                            ? (() => {
                                const d = clip.createdAt.toDate ? clip.createdAt.toDate() : new Date(clip.createdAt);
                                const s = Math.floor((Date.now() - d.getTime()) / 1000);
                                if (s < 60) return 'now';
                                const m = Math.floor(s / 60);
                                if (m < 60) return `${m}m`;
                                const h = Math.floor(m / 60);
                                if (h < 24) return `${h}h`;
                                return `${Math.floor(h / 24)}d`;
                              })()
                            : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}

        {/* ── Featured In (public — clips where addedToProfile === true) ── */}
        {featuredInClips.length > 0 && (
          <View style={styles.card}>
            <View style={styles.clipsSectionHeader}>
              <Text style={styles.cardTitle}>Featured In</Text>
              <View style={styles.clipsCountBadge}>
                <Text style={styles.clipsCountText}>{featuredInClips.length}</Text>
              </View>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={featuredInClips}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.clipsRow}
              renderItem={({ item: clip }) => {
                const videoUrl = taggedVideoUrls[clip.id];
                const thumbUri = taggedThumbnails[clip.id];
                return (
                  <TouchableOpacity
                    style={styles.clipTile}
                    onPress={() => {
                      if (videoUrl) navigation.navigate('ClipPlayer', { videoUrl, clipId: clip.id, gymId: clip.gymId });
                    }}
                    activeOpacity={0.85}
                  >
                    {thumbUri ? (
                      <Image source={{ uri: thumbUri }} style={styles.clipTileThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.clipTilePlaceholder} />
                    )}
                    <View style={styles.clipTileScrim} />
                    <View style={styles.clipTilePlayOverlay}>
                      <Ionicons
                        name={videoUrl ? 'play-circle' : 'hourglass-outline'}
                        size={28}
                        color="rgba(255,255,255,0.9)"
                      />
                    </View>
                    <View style={styles.clipTileBottomRow}>
                      <Text style={styles.clipTileTime}>
                        {clip.createdAt
                          ? (() => {
                              const d = clip.createdAt.toDate ? clip.createdAt.toDate() : new Date(clip.createdAt);
                              const s = Math.floor((Date.now() - d.getTime()) / 1000);
                              if (s < 60) return 'now';
                              const m = Math.floor(s / 60);
                              if (m < 60) return `${m}m`;
                              const h = Math.floor(m / 60);
                              if (h < 24) return `${h}h`;
                              return `${Math.floor(h / 24)}d`;
                            })()
                          : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

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

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.gymRequestsRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Messages')}
        >
          <View style={styles.gymRequestsLeft}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
            <Text style={styles.gymRequestsLabel}>Messages</Text>
          </View>
          <View style={styles.gymRequestsRight}>
            {dmUnreadCount > 0 && (
              <View style={styles.gymRequestsBadge}>
                <Text style={styles.gymRequestsBadgeText}>{dmUnreadCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
              {adminPendingTotal > 0 && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>{adminPendingTotal}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Settings ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.gymRequestsRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Settings')}
        >
          <View style={styles.gymRequestsLeft}>
            <Ionicons name="settings-outline" size={20} color={colors.primary} />
            <Text style={styles.gymRequestsLabel}>Settings</Text>
          </View>
          <View style={styles.gymRequestsRight}>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        {/* ── Branding Footer ───────────────────────────────────────────── */}
        <View style={styles.brandingFooter}>
          <Logo size="small" />
        </View>

        {/* ── Quick Sign Out ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.quickSignOut}
          onPress={() => {
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
          }}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
          <Text style={styles.quickSignOutText}>Sign Out</Text>
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
              Your score starts at 100 and is locked in until you've attended 3 runs. After that, it reflects how consistently you show up when you commit.
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• Showing up keeps your score intact'}
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• Cancelling 1+ hour before start has no penalty'}
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• Cancelling within 1 hour of start counts as a late cancel (\u22128)'}
            </Text>
            <Text style={[styles.reliabilityModalBullet, { color: colors.textSecondary }]}>
              {'• No-shows lower your score the most (\u221220)'}
            </Text>
            <Text style={[styles.reliabilityModalBody, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
              The more you show up, the more players will want to run with you.
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
    </ImageBackground>
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
    bgImage: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.80)',
    },
    safe: {
      flex: 1,
      backgroundColor: 'transparent',
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
    usernameText: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
      marginTop: 2,
      marginBottom: SPACING.xs,
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
    // Cards — solid dark with depth
    card: {
      backgroundColor: isDark ? 'rgba(20,20,20,0.85)' : colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8,
    },
    cardTitle: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? 'rgba(255,255,255,0.70)' : colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },
    // Premium teaser card
    premiumCard: {
      backgroundColor: isDark ? 'rgba(20,20,20,0.90)' : '#FFF3ED',
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,120,0,0.40)' : '#FF6B3566',
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8,
    },
    premiumTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    premiumIconWrap: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.sm,
      backgroundColor: 'rgba(255,107,53,0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255,107,53,0.35)',
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
      backgroundColor: 'rgba(255,107,53,0.15)',
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: 'rgba(255,107,53,0.55)',
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
      color: isDark ? 'rgba(255,255,255,0.85)' : '#C4501A',
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
    // Reliability score card
    reliabilityHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    reliabilityScoreLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
      color: 'rgba(255,255,255,0.70)',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: SPACING.sm,
    },
    scoreNumber: {
      fontSize: 52,
      fontWeight: FONT_WEIGHTS.extraBold,
      marginRight: 3,
    },
    scoreMax: {
      fontSize: 20,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    tierBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: RADIUS.md,
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
      fontSize: FONT_SIZES.small,
      color: 'rgba(255,255,255,0.60)',
      marginTop: SPACING.sm,
    },
    scoreBarTrack: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
    },
    scoreBarFill: {
      height: 8,
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
      color: '#FFFFFF',
      marginTop: 4,
    },
    statLabel: {
      fontSize: FONT_SIZES.xs,
      color: 'rgba(255,255,255,0.85)',
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
      color: 'rgba(255,255,255,0.85)',
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
      backgroundColor: isDark ? 'rgba(20,20,20,0.85)' : colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8,
    },
    gymRequestsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    gymRequestsLabel: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.medium,
      color: 'rgba(255,255,255,0.85)',
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
    // Admin Tools badge (pending items needing action)
    adminBadge: {
      backgroundColor: isDark ? '#7F1D1D' : '#DC2626',
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    adminBadgeText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
    },
    // Admin Tools link
    adminToolsRow: {
      backgroundColor: isDark ? 'rgba(20,20,20,0.85)' : colors.surface,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8,
    },
    brandingFooter: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
      opacity: 0.6,
    },
    quickSignOut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    quickSignOutText: {
      fontSize: FONT_SIZES.small,
      color: colors.textMuted,
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
    crewSearchButton: {
      padding: SPACING.xs,
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
    avatarRing: {
      width: 96,
      height: 96,
      borderRadius: 48,
      padding: 3,
      marginBottom: SPACING.sm,
    },
    avatarInner: {
      flex: 1,
      borderRadius: 45,
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
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
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Rank card (unified rank + skill + progress) ──────────────────────────
    rankCard: {
      width: '90%',
      alignSelf: 'center',
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      marginTop: SPACING.sm,
      gap: 6,
      shadowOffset: { width: 0, height: 0 },
      elevation: 6,
    },
    rankCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rankCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    rankIcon: {
      fontSize: 18,
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
    rankProgressTrack: {
      width: '100%',
      height: 8,
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
      color: 'rgba(255,255,255,0.70)',
    },
    leaderboardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: RADIUS.full,
      borderWidth: 1.5,
    },
    leaderboardBtnText: {
      fontSize: FONT_SIZES.small,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.3,
    },
    // (reliabilityInfoLink removed — info icon now lives in reliabilityHeaderRow)
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
    // ── My Clips section ───────────────────────────────────────────────────────
    clipsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: SPACING.sm,
    },
    clipsCountBadge: {
      backgroundColor: 'rgba(255,122,69,0.18)',
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: 'rgba(255,122,69,0.35)',
    },
    clipsCountText: {
      color: '#FF7A45',
      fontSize: FONT_SIZES.xs,
      fontWeight: FONT_WEIGHTS.bold,
    },
    clipsRow: {
      gap: 10,
      alignItems: 'flex-start',
      paddingVertical: SPACING.xs,
    },
    clipTile: {
      width: 110,
      height: 148,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: '#1a1a1a',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    clipTileThumb: {
      width: '100%',
      height: '100%',
    },
    clipTilePlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: '#2a2a2a',
    },
    clipTileScrim: {
      ...StyleSheet.absoluteFillObject,
      top: '60%',
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
    },
    clipTilePlayOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    clipTileBottomRow: {
      position: 'absolute',
      left: 8,
      bottom: 7,
      right: 8,
    },
    clipTileTime: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 10,
      fontWeight: '600',
    },
    clipTileProcessing: {
      position: 'absolute',
      bottom: 28,
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.62)',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    clipTileProcessingText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
    },
    clipSkeletonTile: {
      width: 110,
      height: 148,
      borderRadius: 12,
      backgroundColor: '#2a2a2a',
    },
    clipsEmpty: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      gap: 6,
    },
    clipsEmptyText: {
      color: colors.textMuted,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    clipsEmptySubtext: {
      color: colors.textMuted,
      fontSize: FONT_SIZES.small,
      textAlign: 'center',
    },
  });
