/**
 * RunDetailsScreen.js — Individual Gym Detail View
 *
 * Shows a comprehensive breakdown of a single gym: live player count,
 * today/tomorrow scheduled visit counts, player lists, reviews preview,
 * and action buttons to check in or plan a visit.
 *
 * Data sources:
 *   - `useGym(gymId)`           — live gym document (name, address, type, notes)
 *   - `useGymPresences(gymId)`  — real-time "Now Playing" list
 *   - `useGymSchedules(gymId)`  — real-time scheduled visits, filtered by date
 *
 * When Firestore data is available it takes priority; placeholder arrays
 * (`fakePlayers`, `fakeScheduledToday`, etc.) are sliced to fill in the
 * count if real data hasn't loaded yet, giving the screen a populated feel.
 *
 * Animations:
 *   - Pulsing live indicator dot on the "Players Here" stat — a looping
 *     opacity animation (1 ↔ 0.3) starts when playerCount > 0 and stops
 *     when the gym becomes empty.
 *   - A 60-second interval timer forces re-renders so "X minutes ago"
 *     timestamps stay fresh while the screen is open.
 *
 * Navigation:
 *   - Receives `gymId`, `gymName`, `imageUrl`, `plannedToday`,
 *     `plannedTomorrow`, and `players` as route params.
 *   - Falls back to param values if Firestore data hasn't arrived yet.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { PresenceList, Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';

const courtImage = require('../assets/basketball-court.png');
import { useTheme } from '../contexts';
import { useGym, useGymPresences, useGymSchedules, useProfile } from '../hooks';
import { auth, db } from '../config/firebase';
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, onSnapshot, serverTimestamp, query, orderBy,
  getDocs, deleteDoc, where, limit,
} from 'firebase/firestore';
import { handleFollowPoints, awardPoints } from '../services/pointsService';

/**
 * isToday — Checks whether a given Date falls on the current calendar day.
 *
 * @param {Date} date — The date to check.
 * @returns {boolean}
 */
const isToday = (date) => {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

/**
 * isTomorrow — Checks whether a given Date falls on the next calendar day.
 *
 * @param {Date} date — The date to check.
 * @returns {boolean}
 */
const isTomorrow = (date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
};

/**
 * timeAgo — Returns a human-readable relative time string for a Firestore
 * Timestamp or Date (e.g. "just now", "5m ago", "2h ago", "3d ago").
 *
 * @param {import('firebase/firestore').Timestamp|Date|null} timestamp
 * @returns {string}
 */
const timeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * RunDetailsScreen — Full gym detail screen.
 *
 * @param {object} props
 * @param {object} props.route — React Navigation route object carrying gym params.
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function RunDetailsScreen({ route, navigation }) {
  const { gymId, gymName, imageUrl: paramImageUrl, plannedToday: paramPlannedToday, plannedTomorrow: paramPlannedTomorrow, players: paramPlayers } = route.params;
  const { colors, isDark, skillColors } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Subscribe to live Firestore data for this gym
  const { gym, loading: gymLoading } = useGym(gymId);
  const { presences, loading: presencesLoading } = useGymPresences(gymId);
  const { schedules, loading: schedulesLoading } = useGymSchedules(gymId);

  // Live user profile — provides followedGyms and profile data
  const { followedGyms, profile } = useProfile();
  const isFollowed = followedGyms.includes(gymId);
  const [followLoading, setFollowLoading] = useState(false);

  // Current user UID — stable for the lifetime of the screen
  const uid = auth.currentUser?.uid;

  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Derived — true if the current user already has a review for this gym.
  // Recomputed whenever the live reviews snapshot updates.
  const hasReviewed = !!uid && reviews.some((r) => r.userId === uid);

  // Check-in gate — true once we confirm the user has ever checked in here.
  // A one-time query is sufficient; presence records are never deleted.
  const [hasCheckedIn, setHasCheckedIn] = useState(false);

  // Who's Going — enriched user lists for today's and tomorrow's schedules.
  // Populated asynchronously so photo URLs load without blocking the screen.
  const [todayGoingUsers, setTodayGoingUsers] = useState([]);
  const [tomorrowGoingUsers, setTomorrowGoingUsers] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'presence'),
      where('userId', '==', uid),
      where('gymId', '==', gymId),
      limit(1)
    );
    getDocs(q)
      .then((snap) => setHasCheckedIn(!snap.empty))
      .catch((err) => console.error('checkIn history query error:', err));
  }, [uid, gymId]);

  /**
   * hydrateGoingUsers — Takes a raw schedule array and enriches each entry with
   * the user's `name` and `photoURL` from their Firestore profile document.
   * Falls back to the denormalized `userName` already on the schedule doc and
   * `null` for the avatar when the profile fetch fails.
   *
   * @param {object[]} scheduleList - Array from useGymSchedules
   * @param {Function} setFn - State setter to call with the enriched array
   */
  const hydrateGoingUsers = async (scheduleList, setFn) => {
    try {
      const users = await Promise.all(
        scheduleList.map(async (s) => {
          // scheduleService writes the userId under `odId`
          const userId = s.odId || s.userId;
          try {
            const snap = await getDoc(doc(db, 'users', userId));
            const data = snap.data();
            return {
              userId,
              userName: data?.name || s.userName || 'User',
              userAvatar: data?.photoURL || null,
            };
          } catch {
            return { userId, userName: s.userName || 'User', userAvatar: null };
          }
        })
      );
      setFn(users);
    } catch (err) {
      console.error('hydrateGoingUsers error:', err);
    }
  };

  // Re-hydrate the "Who's Going" lists whenever the live schedule arrays change
  useEffect(() => {
    if (todaySchedules.length === 0) { setTodayGoingUsers([]); return; }
    hydrateGoingUsers(todaySchedules, setTodayGoingUsers);
  }, [todaySchedules]);

  useEffect(() => {
    if (tomorrowSchedules.length === 0) { setTomorrowGoingUsers([]); return; }
    hydrateGoingUsers(tomorrowSchedules, setTomorrowGoingUsers);
  }, [tomorrowSchedules]);

  // Subscribe to this gym's reviews subcollection, newest first
  useEffect(() => {
    const q = query(
      collection(db, 'gyms', gymId, 'reviews'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('reviews snapshot error:', err);
    });
    return unsub;
  }, [gymId]);

  /**
   * toggleFollow — Adds or removes this gym from the user's `followedGyms` array
   * in Firestore using arrayUnion / arrayRemove so the update is atomic.
   *
   * The button optimistically shows the new state immediately via the live
   * useProfile subscription — no extra local state needed.
   */
  const toggleFollow = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setFollowLoading(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        followedGyms: isFollowed ? arrayRemove(gymId) : arrayUnion(gymId),
      });
      // Award or deduct points based on new follow state (exploit-safe)
      handleFollowPoints(uid, gymId, !isFollowed);
    } catch (err) {
      console.error('toggleFollow error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  /**
   * handleDeleteReview — Prompts for confirmation then deletes the user's own
   * review document from `gyms/{gymId}/reviews/{reviewId}`.
   *
   * The live onSnapshot subscription automatically removes the card from the
   * list once the delete completes, so no local state update is needed.
   *
   * @param {string} reviewId — Firestore document ID of the review to delete.
   */
  const handleDeleteReview = (reviewId) => {
    Alert.alert(
      'Delete Your Review',
      'Are you sure you want to delete your review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'gyms', gymId, 'reviews', reviewId));
            } catch (err) {
              console.error('deleteReview error:', err);
              Alert.alert('Error', 'Could not delete your review. Please try again.');
            }
          },
        },
      ]
    );
  };

  /**
   * handleSubmitReview — Writes a review to `gyms/{gymId}/reviews`, awards 15
   * points, and dismisses the modal.
   *
   * Guards:
   *   - Requires a star rating.
   *   - Blocks submission if the user has already reviewed this gym (prevents
   *     duplicates even if the UI guard was somehow bypassed).
   */
  const handleSubmitReview = async () => {
    if (selectedRating === 0) {
      Alert.alert('Rating Required', 'Please tap a star to rate this gym.');
      return;
    }
    if (!uid) return;
    // Server-side duplicate guard (mirrors the UI check)
    if (hasReviewed) {
      Alert.alert('Already Reviewed', "You've already reviewed this gym.");
      setReviewModalVisible(false);
      return;
    }
    setSubmittingReview(true);
    try {
      await addDoc(collection(db, 'gyms', gymId, 'reviews'), {
        userId:     uid,
        userName:   profile?.name || 'Anonymous',
        userAvatar: profile?.photoURL || null,
        rating:     selectedRating,
        text:       reviewText.trim(),
        createdAt:  serverTimestamp(),
      });
      awardPoints(uid, 'review');
      setReviewModalVisible(false);
      setSelectedRating(0);
      setReviewText('');
      Alert.alert('Review submitted! +15 pts 🎉');
    } catch (err) {
      console.error('submitReview error:', err);
      Alert.alert('Error', 'Could not submit your review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  /**
   * renderAvatarRow — Renders a compact row of up to 5 overlapping avatar circles
   * for a given user list. Shows the user's photo if available; falls back to
   * a coloured circle with their first initial. If the list exceeds 5, a "+N"
   * overflow chip is appended. When the list is empty, an italic empty-state
   * message is shown instead.
   *
   * @param {{ userId: string, userName: string, userAvatar: string|null }[]} users
   * @param {string} emptyMessage - Text shown when `users` is empty
   * @returns {JSX.Element}
   */
  const renderAvatarRow = (users, emptyMessage) => {
    if (users.length === 0) {
      return <Text style={styles.whoGoingEmpty}>{emptyMessage}</Text>;
    }
    const visible = users.slice(0, 5);
    const extra = users.length - 5;
    return (
      <View style={styles.avatarRow}>
        {visible.map((user, idx) => (
          <View
            key={user.userId}
            style={[styles.avatarCircleWrap, idx > 0 && styles.avatarCircleOffset]}
          >
            {user.userAvatar ? (
              <Image source={{ uri: user.userAvatar }} style={styles.avatarCircleImg} />
            ) : (
              <View style={styles.avatarCircleFallback}>
                <Text style={styles.avatarCircleInitial}>
                  {(user.userName || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        ))}
        {extra > 0 && (
          <View style={[styles.avatarCircleWrap, styles.avatarCircleOffset, styles.avatarCircleMore]}>
            <Text style={styles.avatarCircleMoreText}>+{extra}</Text>
          </View>
        )}
      </View>
    );
  };

  const loading = gymLoading || presencesLoading || schedulesLoading;

  // Split the flat schedules array into today's and tomorrow's lists.
  // useMemo ensures this only recalculates when the schedules array changes.
  const { todaySchedules, tomorrowSchedules } = useMemo(() => {
    const today = [];
    const tomorrow = [];

    schedules.forEach((schedule) => {
      const scheduledTime = schedule.scheduledTime?.toDate();
      if (!scheduledTime) return;

      if (isToday(scheduledTime)) {
        today.push(schedule);
      } else if (isTomorrow(scheduledTime)) {
        tomorrow.push(schedule);
      }
    });

    return { todaySchedules: today, tomorrowSchedules: tomorrow };
  }, [schedules]);

  // Tick counter forces a re-render every 60 seconds so "X minutes ago"
  // timestamps on presence cards stay current without a full data refetch.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (presences.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [presences.length]);

  // Hide the default navigation header — this screen uses a custom hero image header
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Animated value for the pulsing live indicator dot next to the player count
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Prefer live Firestore counts; fall back to route params for instant display
  const playerCount = gym?.currentPresenceCount ?? paramPlayers ?? 0;
  const todayCount = todaySchedules.length || paramPlannedToday || 0;
  const tomorrowCount = tomorrowSchedules.length || paramPlannedTomorrow || 0;

  // Placeholder player data — displayed when Firestore data is empty
  const fakePlayers = [
    { id: 'fp1', name: 'Big Ray',      skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',   minutesAgo: 8  },
    { id: 'fp2', name: 'Marcus W.',    skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',   minutesAgo: 15 },
    { id: 'fp3', name: 'Lil TJ',       skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/4.jpg',    minutesAgo: 22 },
    { id: 'fp4', name: 'Aaliyah S.',   skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg', minutesAgo: 31 },
    { id: 'fp5', name: 'Coach D',      skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg',   minutesAgo: 40 },
    { id: 'fp6', name: 'Jordan T.',    skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/44.jpg',   minutesAgo: 52 },
    { id: 'fp7', name: 'Lil Kev',      skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/7.jpg',    minutesAgo: 58 },
    { id: 'fp8', name: 'Keisha L.',    skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/45.jpg', minutesAgo: 67 },
    { id: 'fp9', name: 'O.G. Andre',   skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/91.jpg',   minutesAgo: 75 },
    { id: 'fp10', name: 'DeShawn R.',  skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/men/67.jpg',   minutesAgo: 82 },
  ];

  const fakeScheduledToday = [
    { id: 'st1', name: 'Young Buck',   skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/10.jpg',   time: '6:00 PM' },
    { id: 'st2', name: 'Brianna C.',   skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/women/14.jpg', time: '6:30 PM' },
    { id: 'st3', name: 'Mr. Williams', skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/80.jpg',   time: '7:00 PM' },
    { id: 'st4', name: 'Devon W.',     skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/men/36.jpg',   time: '7:00 PM' },
    { id: 'st5', name: 'Simone R.',    skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/women/33.jpg', time: '7:30 PM' },
  ];

  const fakeScheduledTomorrow = [
    { id: 'sm1', name: 'Isaiah T.',    skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/17.jpg',   time: '5:30 PM' },
    { id: 'sm2', name: 'Kayla N.',     skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/52.jpg', time: '6:00 PM' },
    { id: 'sm3', name: 'Lil Chris',    skillLevel: 'Casual',      avatarUrl: 'https://randomuser.me/api/portraits/men/8.jpg',    time: '6:00 PM' },
    { id: 'sm4', name: 'Trina D.',     skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/women/61.jpg', time: '6:30 PM' },
    { id: 'sm5', name: 'Pop',          skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/88.jpg',   time: '6:30 PM' },
    { id: 'sm6', name: 'Nadia P.',     skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/women/19.jpg', time: '7:00 PM' },
    { id: 'sm7', name: 'Elijah F.',    skillLevel: 'Either',      avatarUrl: 'https://randomuser.me/api/portraits/men/29.jpg',   time: '7:00 PM' },
    { id: 'sm8', name: 'Rasheed V.',   skillLevel: 'Competitive', avatarUrl: 'https://randomuser.me/api/portraits/men/48.jpg',   time: '7:30 PM' },
  ];

  // Start or stop the pulse animation based on whether anyone is currently checked in.
  // Uses Animated.loop + Animated.sequence for a smooth, continuous opacity breath effect.
  useEffect(() => {
    if (playerCount > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      // Reset to full opacity when the gym is empty
      pulseAnim.setValue(1);
    }
  }, [playerCount]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Logo size="small" style={{ marginBottom: SPACING.sm }} />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container}>
        {/* Hero image header with an absolute-positioned back button */}
        <View style={styles.heroContainer}>
          <Image
            source={(gym?.imageUrl || paramImageUrl) ? { uri: gym?.imageUrl || paramImageUrl } : courtImage}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Gym name, address, directions button, and type badge */}
        <View style={styles.header}>
          {/* Gym name row — name on the left, Follow button on the right */}
          <View style={styles.gymNameRow}>
            <Text style={[styles.gymName, { flex: 1 }]}>{gym?.name || gymName}</Text>
            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowed && styles.followButtonActive,
              ]}
              onPress={toggleFollow}
              disabled={followLoading}
            >
              <Ionicons
                name={isFollowed ? 'heart' : 'heart-outline'}
                size={16}
                color={isFollowed ? '#EF4444' : colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.followButtonText,
                  isFollowed && styles.followButtonTextActive,
                ]}
              >
                {isFollowed ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Access type badge — shown immediately below the name */}
          {gym?.accessType && (
            <View style={[styles.accessBadge, { backgroundColor: gym.accessType === 'free' ? '#22C55E' : '#F59E0B' }]}>
              <Text style={styles.accessBadgeText}>
                {gym.accessType === 'free' ? 'Free' : 'Membership / Day Pass'}
              </Text>
            </View>
          )}

          {/* Primary CTA — Check In Here (stands alone between identity and location blocks) */}
          <TouchableOpacity
            style={styles.checkInButton}
            onPress={() => navigation.getParent()?.navigate('CheckIn')}
          >
            <Text style={styles.checkInButtonText}>Check In Here</Text>
          </TouchableOpacity>

          {/* Location block — address, directions, type, and notes grouped together */}
          <View style={styles.locationBlock}>
            <Text style={styles.gymAddress}>{gym?.address}</Text>
            {gym?.location && (
              <TouchableOpacity
                style={styles.directionsButton}
                onPress={() => openDirections(gym.location, gym.name)}
              >
                <Ionicons name="navigate-outline" size={16} color={colors.infoText} style={{ marginRight: 6 }} />
                <Text style={styles.directionsButtonText}>Get Directions</Text>
              </TouchableOpacity>
            )}
            {gym?.type && (
              <Text style={styles.gymType}>
                {gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}
              </Text>
            )}
            {gym?.notes ? (
              <Text style={styles.gymNotes}>{gym.notes}</Text>
            ) : null}
          </View>
        </View>

        {/* Stats card — Players Here (with pulse dot), Planning Today, Planning Tomorrow */}
        <View style={styles.statsCard}>
          {/* Live now stat */}
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              {playerCount > 0 && (
                // Pulsing dot only shown when at least one player is checked in
                <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
              )}
              <Text style={styles.statNumber}>{playerCount}</Text>
            </View>
            <Text style={styles.statLabel}>
              {playerCount === 1 ? 'Player' : 'Players'} Here
            </Text>
            {playerCount > 0 && (
              <Text style={styles.gameOnLabel}>Game On</Text>
            )}
          </View>

          <View style={styles.statDivider} />

          {/* Planning today stat */}
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{todayCount}</Text>
            <Text style={styles.statLabel}>Planning{'\n'}Today</Text>
          </View>

          <View style={styles.statDivider} />

          {/* Planning tomorrow stat */}
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{tomorrowCount}</Text>
            <Text style={styles.statLabel}>Planning{'\n'}Tomorrow</Text>
          </View>
        </View>

        {/* Who's Going — compact avatar rows for today and tomorrow's scheduled visits */}
        <View style={styles.whoGoingSection}>
          <Text style={styles.sectionTitle}>Who's Going</Text>
          <View style={styles.whoGoingRow}>
            <Text style={styles.whoGoingDayLabel}>Today</Text>
            {renderAvatarRow(todayGoingUsers, 'No one scheduled today')}
          </View>
          <View style={[styles.whoGoingRow, { marginTop: SPACING.sm }]}>
            <Text style={styles.whoGoingDayLabel}>Tomorrow</Text>
            {renderAvatarRow(tomorrowGoingUsers, 'No one scheduled tomorrow')}
          </View>
        </View>

        {/* Now Playing section — real presences first, fake data as fallback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Playing</Text>
          {presences.length > 0 ? (
            <PresenceList items={presences} type="presence" />
          ) : playerCount > 0 ? (
            // Slice placeholder players to match the reported count
            <View style={styles.playerList}>
              {fakePlayers.slice(0, playerCount).map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{player.minutesAgo}m ago</Text>
                  </View>
                  {skillColors?.[player.skillLevel] && (
                    <View style={[styles.skillBadge, { backgroundColor: skillColors[player.skillLevel].bg }]}>
                      <Text style={[styles.skillBadgeText, { color: skillColors[player.skillLevel].text }]}>
                        {player.skillLevel}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <PresenceList items={[]} type="presence" emptyMessage="No one here yet" emptySubtext="Be the first to check in!" />
          )}
        </View>

        {/* Scheduled Today — real Firestore schedules first, fake data as fallback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Today</Text>
          {todaySchedules.length > 0 ? (
            <PresenceList items={todaySchedules} type="schedule" />
          ) : todayCount > 0 ? (
            <View style={styles.playerList}>
              {fakeScheduledToday.slice(0, todayCount).map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{player.time}</Text>
                  </View>
                  {skillColors?.[player.skillLevel] && (
                    <View style={[styles.skillBadge, { backgroundColor: skillColors[player.skillLevel].bg }]}>
                      <Text style={[styles.skillBadgeText, { color: skillColors[player.skillLevel].text }]}>
                        {player.skillLevel}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <PresenceList items={[]} type="schedule" emptyMessage="No one scheduled today" />
          )}
        </View>

        {/* Scheduled Tomorrow — real Firestore schedules first, fake data as fallback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Tomorrow</Text>
          {tomorrowSchedules.length > 0 ? (
            <PresenceList items={tomorrowSchedules} type="schedule" />
          ) : tomorrowCount > 0 ? (
            <View style={styles.playerList}>
              {fakeScheduledTomorrow.slice(0, tomorrowCount).map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>{player.time}</Text>
                  </View>
                  {skillColors?.[player.skillLevel] && (
                    <View style={[styles.skillBadge, { backgroundColor: skillColors[player.skillLevel].bg }]}>
                      <Text style={[styles.skillBadgeText, { color: skillColors[player.skillLevel].text }]}>
                        {player.skillLevel}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <PresenceList items={[]} type="schedule" emptyMessage="No one scheduled tomorrow" />
          )}
        </View>

        {/* Reviews — live from Firestore with Leave a Review CTA */}
        <View style={styles.section}>
          <View style={styles.reviewsHeaderRow}>
            <Text style={styles.sectionTitle}>Player Reviews</Text>
          </View>

          {/*
           * Leave a Review CTA — gated behind two conditions:
           *   1. User must have a check-in record at this gym (hasCheckedIn)
           *   2. User must not have already reviewed this gym (hasReviewed)
           * If neither condition blocks, show the primary button.
           */}
          {!hasCheckedIn ? (
            <View style={styles.reviewGateNote}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.reviewGateText}>Attend a run here to leave a review</Text>
            </View>
          ) : hasReviewed ? (
            <View style={styles.reviewGateNote}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} style={{ marginRight: 5 }} />
              <Text style={[styles.reviewGateText, { color: colors.success }]}>You've reviewed this gym</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.leaveReviewButton}
              onPress={() => setReviewModalVisible(true)}
            >
              <Ionicons name="star" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.leaveReviewButtonText}>Leave a Review</Text>
            </TouchableOpacity>
          )}

          {/* Reviews list or empty state */}
          {reviews.length === 0 ? (
            <View style={styles.reviewsEmpty}>
              <Ionicons name="star-outline" size={28} color={colors.textMuted} />
              <Text style={styles.reviewsEmptyText}>No reviews yet</Text>
              <Text style={styles.reviewsEmptySubtext}>Be the first to leave one!</Text>
            </View>
          ) : (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  {review.userAvatar ? (
                    <Image source={{ uri: review.userAvatar }} style={styles.reviewAvatar} />
                  ) : (
                    <View style={styles.reviewAvatarPlaceholder}>
                      <Text style={styles.reviewAvatarInitial}>
                        {(review.userName || 'A')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewerName}>{review.userName || 'Anonymous'}</Text>
                    <View style={styles.reviewStarsRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= review.rating ? 'star' : 'star-outline'}
                          size={13}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                  </View>
                  {/* Timestamp on the right — replaced by trash icon for own reviews */}
                  {review.userId === uid ? (
                    <TouchableOpacity
                      style={styles.deleteReviewButton}
                      onPress={() => handleDeleteReview(review.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.danger} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.reviewDate}>{timeAgo(review.createdAt)}</Text>
                  )}
                </View>
                {/* For own review, show time below the content row */}
                {review.userId === uid && (
                  <Text style={[styles.reviewDate, { marginTop: 2, textAlign: 'right' }]}>
                    {timeAgo(review.createdAt)}
                  </Text>
                )}
                {!!review.text && (
                  <Text style={styles.reviewComment}>{review.text}</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Secondary CTA — Plan a Visit */}
        <TouchableOpacity
          style={styles.planButton}
          onPress={() => navigation.getParent()?.navigate('Plan')}
        >
          <Text style={styles.planButtonText}>Plan a Visit</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Leave a Review modal */}
      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        {/*
         * Outer TWBF dismisses the keyboard when the user taps the dark
         * overlay. KAV shifts the card up so the TextInput stays visible
         * above the keyboard on iOS. The inner TWBF stops taps on the card
         * from bubbling up to the outer TWBF.
         */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback accessible={false}>
              <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rate This Gym</Text>

            {/* Tappable star rating */}
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setSelectedRating(star)}>
                  <Ionicons
                    name={star <= selectedRating ? 'star' : 'star-outline'}
                    size={38}
                    color="#F59E0B"
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional comment */}
            <TextInput
              style={styles.reviewInput}
              placeholder="Share your experience (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={400}
              value={reviewText}
              onChangeText={setReviewText}
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, submittingReview && { opacity: 0.7 }]}
              onPress={handleSubmitReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Review</Text>
              )}
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setReviewModalVisible(false);
                setSelectedRating(0);
                setReviewText('');
              }}
              disabled={submittingReview}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for RunDetailsScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  heroContainer: {
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: 260,
  },
  backButton: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },
  header: {
    padding: SPACING.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gymNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  gymName: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginLeft: SPACING.sm,
    flexShrink: 0,
  },
  followButtonActive: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  followButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
  },
  followButtonTextActive: {
    color: '#EF4444',
  },
  accessBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.sm,
  },
  accessBadgeText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  gymAddress: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    backgroundColor: colors.infoBackground,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  directionsButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.infoText,
    letterSpacing: 0.2,
  },
  gymType: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: '500',
    marginTop: SPACING.xs,
  },
  gymNotes: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    margin: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    marginRight: SPACING.xs,
  },
  gameOnLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.success,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  statLabel: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  section: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
    marginBottom: SPACING.md,
    letterSpacing: 0.3,
  },
  checkInButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  locationBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: SPACING.md,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  planButton: {
    backgroundColor: 'transparent',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  planButtonText: {
    color: colors.primary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  bottomPadding: {
    height: SPACING.lg * 2,
  },
  playerList: {
    gap: SPACING.xs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  playerMeta: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  skillBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  skillBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Gate note shown when user hasn't attended or has already reviewed
  reviewGateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  reviewGateText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // Trash icon button on a user's own review card
  deleteReviewButton: {
    padding: SPACING.xs,
  },

  // Leave a Review button
  leaveReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  leaveReviewButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Review avatar placeholder (when no photo URL)
  reviewAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary + '28',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewAvatarInitial: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  reviewInput: {
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
  },

  // Reviews section
  reviewsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  // Styles below are ready for when real reviews are wired in
  seeAllLink: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  reviewsEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  reviewsEmptyText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
  },
  reviewsEmptySubtext: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  ratingBig: {
    fontSize: 42,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: colors.textPrimary,
  },
  ratingDetails: {
    gap: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewerName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  reviewDate: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  reviewComment: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: SPACING.xs,
  },
  seeAllButtonText: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // ─── Who's Going section ──────────────────────────────────────────────────
  whoGoingSection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  whoGoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  whoGoingDayLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
    width: 76,
  },
  whoGoingEmpty: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  // Outer wrapper — adds the white border that separates overlapping avatars
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircleWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.background,
    overflow: 'hidden',
  },
  // Negative margin creates the overlapping stack effect
  avatarCircleOffset: {
    marginLeft: -10,
  },
  avatarCircleImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  // Coloured fallback circle when no photoURL is available
  avatarCircleFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircleInitial: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  // "+N more" overflow chip
  avatarCircleMore: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: colors.border,
  },
  avatarCircleMoreText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
  },
});
