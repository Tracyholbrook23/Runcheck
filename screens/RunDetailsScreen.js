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
  FlatList,
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
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { PresenceList, Logo } from '../components';
import { openDirections } from '../utils/openMapsDirections';

const courtImage = require('../assets/basketball-court.png');
import { useTheme } from '../contexts';
import { useGym, useGymPresences, useGymSchedules, useProfile } from '../hooks';
import { auth, db } from '../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, onSnapshot, serverTimestamp, query, orderBy,
  getDocs, deleteDoc, where, limit, setDoc, runTransaction, deleteField,
  Timestamp,
} from 'firebase/firestore';
import { handleFollowPoints, awardPoints } from '../services/pointsService';
import { formatSkillLevel } from '../services/models';

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
 * tileTimeAgo — Compact timestamp for clip tiles ("now", "2m", "1h", "3d").
 * Same input as timeAgo but omits the "ago" suffix so it fits in a small tile.
 *
 * @param {import('firebase/firestore').Timestamp|Date|null} timestamp
 * @returns {string}
 */
const tileTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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

  // Clip posting — tracks in-flight createClipSession calls
  const [postingClip, setPostingClip] = useState(false);

  // Gym Clips feed
  const [gymClips, setGymClips] = useState([]);
  const [clipsLoading, setClipsLoading] = useState(true);
  // Resolved Firebase Storage download URLs, keyed by clip.id.
  // Populated lazily on first render of each clip; never refetched once cached.
  const [clipVideoUrls, setClipVideoUrls] = useState({});
  // Thumbnail URIs generated by expo-video-thumbnails, keyed by clip.id.
  const [clipThumbnails, setClipThumbnails] = useState({});
  // Tracks which clipIds have already been fully resolved (URL + thumbnail)
  // so snapshot re-fires don't re-fetch Storage or re-generate thumbnails.
  const resolvedClipIdsRef = useRef(new Set());
  // Uploader profile cache — { [uid]: { name, photoURL } }, populated lazily.
  const [clipUserMap, setClipUserMap] = useState({});
  // Prevents duplicate in-flight user fetches across effect re-fires.
  const resolvedUploaderUidsRef = useRef(new Set());
  // Map-model like state derived directly from the gymClips doc fields:
  //   likedByMe[clipId]   — true if item.likedBy[uid] === true on the live doc
  //   (no separate listeners needed — the gymClips onSnapshot covers this)
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
      console.error('[reviews] error:', err.code, err.message);
    });
    return unsub;
  }, [gymId]);

  // Gym Clips — daily highlight + 24-hour feed, both live via onSnapshot
  useEffect(() => {
    const authedUid = auth.currentUser?.uid;
    console.log('[clips effect] uid (from component scope):', uid);
    console.log('[clips effect] auth.currentUser?.uid (live):', authedUid);
    console.log('[clips effect] db.app.options.projectId:', db.app.options.projectId, '| auth.app.options.projectId:', auth.app.options.projectId);
    if (!authedUid || !gymId) return;
    setClipsLoading(true);
    /**
     * resolveClipUrls — For each clip that has a storagePath and hasn't been
     * fully resolved yet, fetches the Firebase Storage download URL then
     * generates a thumbnail via expo-video-thumbnails. Both results are cached
     * in state keyed by clip.id so snapshot re-fires are no-ops.
     *
     * resolvedClipIdsRef prevents duplicate in-flight work when the same clip
     * appears in multiple consecutive snapshots before the async work finishes.
     */
    const resolveClipUrls = (clips) => {
      const storage = getStorage();
      clips
        .filter((c) => c.storagePath && !resolvedClipIdsRef.current.has(c.id))
        .forEach(async (c) => {
          // Mark immediately so parallel snapshot fires don't start a second run.
          resolvedClipIdsRef.current.add(c.id);

          // ── Step 1: download URL ──────────────────────────────────────────
          let url;
          try {
            url = await getDownloadURL(ref(storage, c.storagePath));
            setClipVideoUrls((prev) => {
              if (prev[c.id]) return prev;
              return { ...prev, [c.id]: url };
            });
          } catch (err) {
            console.warn('[clips] getDownloadURL failed for', c.id, err.message);
            // Remove from the set so a future retry is possible.
            resolvedClipIdsRef.current.delete(c.id);
            return;
          }

          // ── Step 2: thumbnail ─────────────────────────────────────────────
          // Only attempt backend thumbnail when the clip is fully processed
          // AND thumbnailPath is present. In fallback mode (status === "ready"
          // but processor hasn't run), skip straight to client-side generation
          // to avoid storage/object-not-found spam in the console.
          if (c.status === 'ready_processed' && c.thumbnailPath) {
            try {
              const thumbUrl = await getDownloadURL(ref(storage, c.thumbnailPath));
              setClipThumbnails((prev) => {
                if (prev[c.id]) return prev;
                return { ...prev, [c.id]: thumbUrl };
              });
              return; // backend thumbnail resolved — done
            } catch {
              // Silently fall through to client-side generation.
            }
          }
          // Client-side thumbnail via expo-video-thumbnails (fallback path)
          try {
            const thumb = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
            setClipThumbnails((prev) => {
              if (prev[c.id]) return prev;
              return { ...prev, [c.id]: thumb.uri };
            });
          } catch {
            // Non-fatal — tile shows dark placeholder + play icon.
          }
        });
    };

    // NOTE: Requires a Firestore composite index on gymClips:
    //   gymId ASC + expiresAt ASC
    // If the app logs "index required", create the index in the Firebase console
    // (or firestore.indexes.json) with fields: gymId (ASC), expiresAt (ASC).
    const clipsQuery = query(
      collection(db, 'gymClips'),
      where('gymId', '==', gymId),
      where('expiresAt', '>', Timestamp.now()),
      orderBy('expiresAt', 'desc'),
      limit(20)
    );

    // Client-side guard: only show clips that are fully finalized AND have a
    // valid expiresAt field (belt-and-suspenders for any doc that bypassed the
    // query filter, e.g. older docs written before expiresAt was added).
    const isReadyClip = (c) => c.status === 'ready' && !!c.storagePath && !!c.expiresAt;

    const unsubClips = onSnapshot(clipsQuery, (snap) => {
      // Exclude any clip that hasn't been finalized yet.
      const readyList = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(isReadyClip);
      setGymClips(readyList);
      setClipsLoading(false);
      resolveClipUrls(readyList);
    }, (err) => {
      console.error('[gymClips feed] error:', err.code, err.message);
      setClipsLoading(false);
    });

    return () => {
      unsubClips();
    };
  }, [uid, gymId, auth.currentUser]);

  // Resolve uploader name + avatar for every visible clip.
  // Uses resolvedUploaderUidsRef so rapid snapshot re-fires don't launch
  // duplicate getDoc calls for the same uid.
  useEffect(() => {
    gymClips.forEach(async (c) => {
      const uid = c.uploaderUid;
      if (!uid || resolvedUploaderUidsRef.current.has(uid)) return;
      resolvedUploaderUidsRef.current.add(uid);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const data = snap.exists() ? snap.data() : {};
        setClipUserMap((prev) => ({
          ...prev,
          [uid]: { name: data.name || 'Player', photoURL: data.photoURL || null },
        }));
      } catch {
        setClipUserMap((prev) => ({ ...prev, [uid]: { name: 'Player', photoURL: null } }));
      }
    });
  }, [gymClips]);

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
   * handlePostClip — Reserves a clip session, then lets the user choose
   * between recording in-app (→ RecordClipScreen) or picking from their
   * library (→ TrimClipScreen directly after picker).
   *
   * Steps:
   *   1. Call `createClipSession` so we hold a reserved clipId before the
   *      user even touches the camera or picker.
   *   2. Show an Alert: "Record Clip" | "Upload from Phone" | "Cancel".
   *   3a. Record Clip  → navigate to RecordClipScreen with { clipSession, gymId }.
   *       RecordClipScreen handles camera/mic permissions, 10 s auto-stop, and
   *       ultimately navigates itself to TrimClipScreen.
   *   3b. Upload       → open library picker here; enforce ≤10 s, then go to
   *       TrimClipScreen.
   *   4.  Cancel       → reset postingClip; the reserved session is silently
   *       abandoned (TTL-based cleanup handled by the backend).
   */
  const handlePostClip = async () => {
    if (!gymId) {
      Alert.alert('Error', 'No gym selected. Please try again.');
      return;
    }

    // ── 1. Reserve a clip session before showing the choice dialog ────────
    setPostingClip(true);
    let clipSession;
    try {
      const fn = httpsCallable(getFunctions(), 'createClipSession');
      const res = await fn({ gymId });
      clipSession = res.data;
    } catch (err) {
      Alert.alert(
        'Could not start clip',
        err?.message || 'Something went wrong. Please try again.'
      );
      setPostingClip(false);
      return;
    }

    // Maximum clip length enforced on the upload path (recording is capped
    // natively inside RecordClipScreen).
    const MAX_CLIP_DURATION_SEC = 10;

    // ── Path A: in-app recording ──────────────────────────────────────────
    // RecordClipScreen owns camera/mic permissions and the 10 s auto-stop.
    const goToRecorder = () => {
      setPostingClip(false);
      navigation.navigate('RecordClipScreen', { clipSession, gymId });
    };

    // ── Path B: upload an existing video from the photo library ──────────
    const uploadFromLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      // 'limited' = iOS 14+ partial access — the picker still works, so allow it.
      if (status !== 'granted' && status !== 'limited') {
        Alert.alert(
          'Permission required',
          'Please allow access to your photo library in Settings to post a clip.'
        );
        setPostingClip(false);
        return;
      }
      let pickerResult;
      try {
        pickerResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'], // expo-image-picker v15+: string array replaces deprecated MediaTypeOptions
          allowsEditing: false,
          quality: 1,
        });
      } catch (err) {
        console.log('Video picker error:', err);
        Alert.alert('Error', 'Could not open the video picker. Please try again.');
        setPostingClip(false);
        return;
      }
      if (pickerResult.canceled) { setPostingClip(false); return; }
      const asset = pickerResult.assets?.[0];
      if (!asset?.uri) { setPostingClip(false); return; }

      // expo-image-picker returns duration in milliseconds.
      // If present and exceeds the limit, block before navigating.
      if (asset.duration != null && asset.duration / 1000 > MAX_CLIP_DURATION_SEC) {
        Alert.alert(
          'Clip too long',
          `Please choose a video that is ${MAX_CLIP_DURATION_SEC} seconds or shorter.`
        );
        setPostingClip(false);
        return;
      }

      setPostingClip(false);
      navigation.navigate('TrimClipScreen', {
        clipSession,
        sourceVideoUri: asset.uri,
        gymId,
      });
    };

    // ── 2. Present the choice ─────────────────────────────────────────────
    Alert.alert(
      'Post a Clip',
      'How would you like to add your clip?',
      [
        { text: 'Record Clip',      onPress: goToRecorder      },
        { text: 'Upload from Phone', onPress: uploadFromLibrary },
        { text: 'Cancel', style: 'cancel', onPress: () => setPostingClip(false) },
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

  /**
   * toggleLike — Atomically likes or unlikes a clip via runTransaction.
   *
   * Firestore model (on the gymClips doc itself):
   *   likedBy: { [uid]: true }  — map of uids who have liked
   *   likesCount: number        — total like count
   *
   * Validated by isValidClipLikeUpdate() in security rules:
   *   only likesCount and likedBy may change, count moves by exactly ±1,
   *   and only the calling uid's key may be affected inside likedBy.
   *
   * The live gymClips onSnapshot propagates the updated fields back to the
   * tile automatically — no separate local state needed.
   */
  const toggleLike = async (clipId) => {
    if (!uid) return;
    const clipRef = doc(db, 'gymClips', clipId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(clipRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const likedBy = (data.likedBy instanceof Object && !Array.isArray(data.likedBy))
          ? data.likedBy : {};
        const currentCount = typeof data.likesCount === 'number' ? data.likesCount : 0;
        if (likedBy[uid] === true) {
          // Unlike: remove uid key, decrement (floor 0)
          tx.update(clipRef, {
            [`likedBy.${uid}`]: deleteField(),
            likesCount: Math.max(0, currentCount - 1),
          });
        } else {
          // Like: set uid key to true, increment
          tx.update(clipRef, {
            [`likedBy.${uid}`]: true,
            likesCount: currentCount + 1,
          });
        }
      });
    } catch (err) {
      console.error('[toggleLike] error:', err.message);
    }
  };

  // Pad gymClips to an even count so the last tile never stretches full width.
  const gridData = React.useMemo(() => {
    const data = [...gymClips];
    if (data.length % 2 === 1) {
      data.push({ id: '__spacer__', spacer: true });
    }
    return data;
  }, [gymClips]);

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
                        {formatSkillLevel(player.skillLevel)}
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
                        {formatSkillLevel(player.skillLevel)}
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
                        {formatSkillLevel(player.skillLevel)}
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

        {/* Clips — Stories-style horizontal row */}
        <View style={styles.section}>
          {/* Section header */}
          <View style={clipPlayerStyles.storiesHeaderRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Clips</Text>
            <Text style={clipPlayerStyles.storiesSubtitle}>Live moments from this gym</Text>
          </View>

          {clipsLoading ? (
            // Skeleton: Post tile + 3 grey placeholder tiles while data loads
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={clipPlayerStyles.storiesRow}
            >
              <TouchableOpacity
                style={[clipPlayerStyles.storiesPostTile, postingClip && { opacity: 0.6 }]}
                onPress={handlePostClip}
                disabled={postingClip || !gymId}
              >
                {postingClip ? (
                  <ActivityIndicator color="#FF7A45" size="small" />
                ) : (
                  <Ionicons name="add-circle-outline" size={30} color="#FF7A45" />
                )}
                <Text style={clipPlayerStyles.storiesPostLabel}>
                  {postingClip ? 'Starting…' : 'Post'}
                </Text>
              </TouchableOpacity>
              {[1, 2, 3].map((i) => (
                <View key={i} style={clipPlayerStyles.storiesSkeletonTile} />
              ))}
            </ScrollView>
          ) : (
            <FlatList
              data={gymClips}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={clipPlayerStyles.storiesRow}
              ListHeaderComponent={
                <TouchableOpacity
                  style={[clipPlayerStyles.storiesPostTile, postingClip && { opacity: 0.6 }]}
                  onPress={handlePostClip}
                  disabled={postingClip || !gymId}
                >
                  {postingClip ? (
                    <ActivityIndicator color="#FF7A45" size="small" />
                  ) : (
                    <Ionicons name="add-circle-outline" size={30} color="#FF7A45" />
                  )}
                  <Text style={clipPlayerStyles.storiesPostLabel}>
                    {postingClip ? 'Starting…' : 'Post'}
                  </Text>
                </TouchableOpacity>
              }
              ListEmptyComponent={
                <View style={clipPlayerStyles.storiesEmptyWrap}>
                  <Text style={clipPlayerStyles.storiesEmptyText}>
                    No clips yet — be the first.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <ClipTile
                  clip={item}
                  videoUrl={clipVideoUrls[item.id]}
                  thumbnailUri={clipThumbnails[item.id]}
                  liked={!!(item.likedBy?.[uid])}
                  likesCount={item.likesCount ?? 0}
                  navigation={navigation}
                  onLike={toggleLike}
                  style={clipPlayerStyles.storiesTile}
                  uploaderInfo={clipUserMap[item.uploaderUid]}
                />
              )}
            />
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

// ─── Clip card ────────────────────────────────────────────────────────────────
/**
 * ClipCard — Renders a single clip entry.
 *
 * Priority:
 *   1. thumbnailUri available  → show thumbnail image with a play-icon overlay.
 *   2. videoUrl available, no thumbnail → show a plain play-icon button
 *      (thumbnail generation failed or is still in-flight).
 *   3. Neither available yet   → show a small ActivityIndicator (URL resolving).
 *
 * Tapping anywhere on the thumbnail / play button calls onPlay().
 */
function ClipCard({ clip, videoUrl, thumbnailUri, onPlay, uploaderInfo, liked, displayCount, onLike }) {
  // Derive initials for the avatar fallback (up to 2 chars).
  const initials = uploaderInfo?.name
    ? uploaderInfo.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View style={clipPlayerStyles.card}>
      {/* ── Uploader metadata row ─────────────────────────────────────────── */}
      <View style={clipPlayerStyles.metaRow}>
        {uploaderInfo?.photoURL ? (
          <Image
            source={{ uri: uploaderInfo.photoURL }}
            style={clipPlayerStyles.uploaderAvatar}
          />
        ) : (
          <View style={clipPlayerStyles.uploaderAvatarFallback}>
            <Text style={clipPlayerStyles.uploaderInitial}>{initials}</Text>
          </View>
        )}
        <View style={clipPlayerStyles.metaText}>
          <Text style={clipPlayerStyles.uploaderName} numberOfLines={1}>
            {uploaderInfo?.name || 'Player'}
          </Text>
          <Text style={clipPlayerStyles.clipTimeAgo}>{timeAgo(clip.createdAt)}</Text>
        </View>
      </View>

      {/* ── Thumbnail / player ────────────────────────────────────────────── */}
      {videoUrl ? (
        <TouchableOpacity
          style={clipPlayerStyles.thumbnailContainer}
          onPress={onPlay}
          activeOpacity={0.85}
        >
          {thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={clipPlayerStyles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            // Thumbnail not yet ready — dark placeholder keeps the card shape.
            <View style={clipPlayerStyles.thumbnailPlaceholder} />
          )}
          {/* Play-icon overlay — always shown over thumbnail or placeholder */}
          <View style={clipPlayerStyles.playOverlay}>
            <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.92)" />
          </View>
        </TouchableOpacity>
      ) : (
        // Download URL still resolving.
        <View style={clipPlayerStyles.thumbnailContainer}>
          <View style={clipPlayerStyles.thumbnailPlaceholder} />
          <View style={clipPlayerStyles.playOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        </View>
      )}
      {/* ── Like row ──────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={clipPlayerStyles.likeRow}
        onPress={() => onLike && onLike(clip.id)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={20}
          color={liked ? '#FF6B35' : '#888'}
        />
        <Text style={[clipPlayerStyles.likeCount, liked && clipPlayerStyles.likeCountActive]}>
          {displayCount}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Clip tile (stories horizontal row) ──────────────────────────────────────
/**
 * ClipTile — Portrait card used in the horizontal stories FlatList.
 *
 * All overlays sit inside the clipped thumbnail:
 *   ┌────────────────┐
 *   │            ♥ 3 │  ← tileLikesPill    (top-right, tappable)
 *   │     ▶          │  ← gridPlayOverlay  (centered)
 *   │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← tileScrim        (bottom 55%, readability)
 *   │ 👤 name   2h   │  ← tileIdentityOverlay (bottom-left, over scrim)
 *   └────────────────┘
 */
function ClipTile({ clip, videoUrl, thumbnailUri, liked, likesCount, navigation, onLike, style, uploaderInfo }) {
  const initials = uploaderInfo?.name
    ? uploaderInfo.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <TouchableOpacity
      style={[clipPlayerStyles.gridTile, style]}
      onPress={() => { if (videoUrl) navigation.navigate('ClipPlayer', { videoUrl, clipId: clip.id, gymId: clip.gymId }); }}
      activeOpacity={0.85}
    >
      {/* Background: thumbnail or dark placeholder */}
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={clipPlayerStyles.gridThumbnail} resizeMode="cover" />
      ) : (
        <View style={clipPlayerStyles.gridThumbnailPlaceholder} />
      )}

      {/* Bottom scrim — improves text readability without a gradient library */}
      <View style={clipPlayerStyles.tileScrim} />

      {/* Centered play icon */}
      <View style={clipPlayerStyles.gridPlayOverlay}>
        <Ionicons
          name={videoUrl ? 'play-circle' : 'hourglass-outline'}
          size={28}
          color="rgba(255,255,255,0.88)"
        />
      </View>

      {/* Bottom-left identity: avatar + name + time — tappable, opens profile */}
      <TouchableOpacity
        style={clipPlayerStyles.tileIdentityOverlay}
        onPress={() => navigation.navigate('Home', { screen: 'UserProfile', params: { userId: clip.uploaderUid } })}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.75}
      >
        {uploaderInfo?.photoURL ? (
          <Image source={{ uri: uploaderInfo.photoURL }} style={clipPlayerStyles.tileAvatar} />
        ) : (
          <View style={clipPlayerStyles.tileAvatarFallback}>
            <Text style={clipPlayerStyles.tileInitial}>{initials}</Text>
          </View>
        )}
        <View style={clipPlayerStyles.tileNameTimeCol}>
          <Text style={clipPlayerStyles.tileName} numberOfLines={1}>
            {uploaderInfo?.name || '…'}
          </Text>
          <Text style={clipPlayerStyles.tileTimeAgo}>{tileTimeAgo(clip.createdAt)}</Text>
        </View>
      </TouchableOpacity>

      {/* Top-right likes pill */}
      <TouchableOpacity
        style={[clipPlayerStyles.tileLikesPill, liked && clipPlayerStyles.tileLikesPillActive]}
        onPress={(e) => { e?.stopPropagation?.(); onLike && onLike(clip.id); }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={10} color={liked ? '#FF6B35' : '#ccc'} />
        <Text style={[clipPlayerStyles.tileLikesPillText, liked && clipPlayerStyles.tileLikesPillTextActive]}>
          {likesCount}
        </Text>
      </TouchableOpacity>

    </TouchableOpacity>
  );
}

const clipPlayerStyles = StyleSheet.create({
  // ── ClipCard ──────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#2a2a2a',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMeta: {
    color: '#aaa',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // ── Uploader metadata row ──────────────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  uploaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
  },
  uploaderAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploaderInitial: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  metaText: {
    flex: 1,
    marginLeft: 9,
  },
  uploaderName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  clipTimeAgo: {
    color: '#888',
    fontSize: 11,
    marginTop: 1,
  },
  // ── Like row ────────────────────────────────────────────────────────────────
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  likeCount: {
    color: '#888',
    fontSize: 13,
    marginLeft: 5,
  },
  likeCountActive: {
    color: '#FF6B35',
  },

  // ── 2-column grid (ClipTile) ───────────────────────────────────────────────
  gridContent: {
    gap: 12,
  },
  gridRow: {
    gap: 12,
    justifyContent: 'flex-start',
  },
  gridTile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
  },
  gridThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
  },
  gridPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLikesBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 3,
  },
  gridLikesText: {
    color: '#ccc',
    fontSize: 10,
    fontWeight: '600',
  },
  gridLikesTextActive: {
    color: '#FF6B35',
  },

  // ── Stories-style horizontal clips row ────────────────────────────────────
  storiesHeaderRow: {
    marginBottom: SPACING.sm,
  },
  storiesSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: '#888',
    marginTop: 2,
  },
  // Shared horizontal scroll container for both loaded and skeleton states.
  storiesRow: {
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: SPACING.xs,
  },
  // "+ Post" tile — same shape as clip tiles, more subtle styling.
  storiesPostTile: {
    width: 120,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.4)',
    backgroundColor: 'rgba(255,107,53,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  storiesPostLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FF7A45',
  },
  // Override applied on top of gridTile for the horizontal stories row.
  // Fixed height — all content (thumbnail + overlays) lives inside the clip.
  storiesTile: {
    width: 120,
    height: 160,
    flex: 0,
    borderRadius: 12,
    // overflow:'hidden' is inherited from gridTile — all overlays stay inside
  },
  // ── Tile overlay internals ─────────────────────────────────────────────────
  // Dark scrim covering the bottom portion of the thumbnail for text legibility.
  tileScrim: {
    ...StyleSheet.absoluteFillObject,
    top: '45%',
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  // Bottom-left identity row (avatar + name + time), rendered over the scrim.
  tileIdentityOverlay: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    right: 36,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  tileAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#333',
    flexShrink: 0,
  },
  tileAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tileInitial: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  tileNameTimeCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  tileName: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  tileTimeAgo: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
  },
  // Top-right likes pill
  tileLikesPill: {
    position: 'absolute',
    top: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tileLikesPillActive: {
    backgroundColor: 'rgba(255,107,53,0.25)',
  },
  tileLikesPillText: {
    color: '#ccc',
    fontSize: 10,
    fontWeight: '600',
  },
  tileLikesPillTextActive: {
    color: '#FF6B35',
  },
  // Grey placeholder shown while clips are loading.
  storiesSkeletonTile: {
    width: 120,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
  },
  // Empty state wrapper — same height as tiles so text centers in the row.
  storiesEmptyWrap: {
    height: 160,
    justifyContent: 'center',
    paddingLeft: SPACING.sm,
  },
  storiesEmptyText: {
    fontSize: FONT_SIZES.small,
    color: '#888',
  },
});

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

  // ─── Gym Clips feed ──────────────────────────────────────────────────────
  clipCard: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  clipMeta: {
    color: '#aaa',
    fontSize: 13,
  },

  // ─── Clips section subtitle ───────────────────────────────────────────────
  clipsSubtitle: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
  },

  // ─── Post Clip button ────────────────────────────────────────────────────
  postClipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  postClipButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
