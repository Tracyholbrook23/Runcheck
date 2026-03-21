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
 * All player and schedule data comes exclusively from Firestore in real time.
 * No placeholder / fake data is used — empty states are shown when data is absent.
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

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { PresenceList, Logo, ReportModal } from '../components';
import { openDirections } from '../utils/openMapsDirections';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import * as Location from 'expo-location';
import { isLocationGranted } from '../utils/locationUtils';
import { hapticSuccess } from '../utils/haptics';
import { useTheme } from '../contexts';

const courtImage = require('../assets/images/court-bg.jpg');
import { useGym, useGymPresences, useGymSchedules, useProfile, usePresence, useProximityCheckIn } from '../hooks';
import { useGymRuns } from '../hooks/useGymRuns';
import { startOrJoinRun, joinExistingRun, leaveRun, subscribeToRunParticipants } from '../services/runService';
import { auth, db } from '../config/firebase';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, onSnapshot, query, orderBy,
  getDocs, deleteDoc, where, limit, setDoc, runTransaction, deleteField,
  Timestamp,
} from 'firebase/firestore';
import { handleFollowPoints } from '../services/pointsService';
import { formatSkillLevel } from '../services/models';
import { checkReviewEligibility, submitReview } from '../services/reviewService';

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

// ─── Run time-picker helpers ─────────────────────────────────────────────────
// Minimal versions of the helpers from PlanVisitScreen, scoped to runs:
// today + next 6 days, 30-minute slots 6 AM – 10 PM.

/**
 * getRunDays — Builds a 7-day array starting from today.
 * @returns {{ label: string, dateStr: string, dateObj: Date, key: string }[]}
 */
const getRunDays = () => {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    let label;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else label = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    days.push({ label, dateStr, dateObj: date, key: date.toDateString() });
  }
  return days;
};

/**
 * getRunSlots — Generates 30-minute time slots for a given day (6 AM – 10 PM).
 * Past slots are filtered out when the selected day is today.
 * @param {{ dateObj: Date }|null} dayObj
 * @returns {{ date: Date, label: string, timeSlot: string }[]}
 */
const getRunSlots = (dayObj) => {
  if (!dayObj) return [];
  const slots = [];
  const now = new Date();
  const isToday = dayObj.dateObj.toDateString() === now.toDateString();
  for (let hour = 6; hour <= 22; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const date = new Date(dayObj.dateObj);
      date.setHours(hour, min, 0, 0);
      if (isToday && date <= now) continue;
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const displayMin = min === 0 ? '00' : '30';
      const ampm = hour >= 12 ? 'PM' : 'AM';
      slots.push({
        date,
        label: `${displayHour}:${displayMin} ${ampm}`,
        timeSlot: date.toISOString(),
      });
    }
  }
  return slots;
};

/**
 * formatRunTime — Human-readable start time for a run card.
 * @param {import('firebase/firestore').Timestamp} timestamp
 * @returns {string}
 */
const formatRunTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${time}`;
};

// ─── Gym hours helpers ────────────────────────────────────────────────────────

/** Ordered days of the week, index-aligned with new Date().getDay() */
const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * formatHourStr — Converts a 24-hour "HH:MM" string to a friendly "h AM/PM".
 * e.g. "06:00" → "6 AM", "22:30" → "10:30 PM"
 * @param {string} str — "HH:MM" time string
 * @returns {string}
 */
const formatHourStr = (str) => {
  if (!str) return '';
  const [h, m] = str.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return m === 0 ? `${hour12} ${ampm}` : `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

/**
 * formatHoursRange — Returns a display string for a day's hours object.
 * Supports both { open: "HH:MM", close: "HH:MM" } objects and plain strings.
 * @param {object|string|null|undefined} dayHours
 * @returns {string}
 */
const formatHoursRange = (dayHours) => {
  if (!dayHours) return 'Closed';
  if (typeof dayHours === 'string') return dayHours;
  const { open, close } = dayHours;
  if (!open && !close) return 'Closed';
  return `${formatHourStr(open)} – ${formatHourStr(close)}`;
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
  const [refreshing, setRefreshing] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // Subscribe to live Firestore data for this gym
  const { gym, loading: gymLoading } = useGym(gymId);
  const { presences, loading: presencesLoading } = useGymPresences(gymId);
  const { schedules, loading: schedulesLoading } = useGymSchedules(gymId);

  // Live user profile — provides followedGyms and profile data
  const { followedGyms, profile } = useProfile();
  const isFollowed = followedGyms.includes(gymId);
  const [followLoading, setFollowLoading] = useState(false);

  // ── Home Court ─────────────────────────────────────────────────────────────
  // Derived from the live profile — separate from followedGyms / My Courts.
  const isHomeCourt = profile?.homeCourtId === gymId;
  const [homeCourtLoading, setHomeCourtLoading] = useState(false);

  // Current user UID — stable for the lifetime of the screen
  const uid = auth.currentUser?.uid;

  // Presence hook — provides checkIn(), checkingIn, and the live presence doc.
  // `presence` is used here to derive the presenceId (the compound session key
  // `{uid}_{gymId}`) which is passed to createClipSession so the Cloud Function
  // can enforce "one clip per user per session" rather than per-gym-per-window.
  // Business logic lives in presenceService; we never duplicate it here.
  const { checkIn, checkingIn, presence } = usePresence();

  // True when the current user has an active check-in specifically at this gym.
  // Compared by gymId so a user checked into a different gym still sees "Check In Here".
  const isCheckedInHere = !!presence && presence.gymId === gymId;

  // ── Smart proximity check-in ──────────────────────────────────────────────
  // Only monitors THIS gym (not the full list) — we're already on its page.
  const { nearbyGym, dismiss: dismissProximity } = useProximityCheckIn({
    gyms: gym ? [gym] : [],
    isCheckedIn: isCheckedInHere,
  });
  const [proximityCheckingIn, setProximityCheckingIn] = useState(false);

  const handleProximityCheckIn = async () => {
    if (!nearbyGym || proximityCheckingIn) return;
    setProximityCheckingIn(true);
    try {
      await checkIn(nearbyGym.id);
      hapticSuccess();
      Alert.alert(
        'Checked In! +10 pts',
        `You're now checked in at ${nearbyGym.name}. Keep showing up to earn more points.`,
        [{ text: 'OK' }],
      );
    } catch (err) {
      Alert.alert(
        'Check-In Failed',
        err?.message || 'Could not check you in. Please try again.',
      );
    } finally {
      setProximityCheckingIn(false);
    }
  };

  // ── Location permission state ─────────────────────────────────────────────
  const [locationEnabled, setLocationEnabled] = useState(true);

  const checkLocationStatus = useCallback(async () => {
    const granted = await isLocationGranted();
    setLocationEnabled(granted);
  }, []);

  // Re-check on every focus (e.g. after returning from Settings)
  useFocusEffect(useCallback(() => { checkLocationStatus(); }, [checkLocationStatus]));

  const handleEnableLocation = async () => {
    const { status: currentStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();

    if (currentStatus === 'granted') {
      setLocationEnabled(true);
      return;
    }

    if (canAskAgain) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationEnabled(true);
      }
      return;
    }

    Alert.alert(
      'Location Permission',
      'Location was previously denied. Please enable it in Settings for RunCheck.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  };

  // ── Runs ──────────────────────────────────────────────────────────────────
  // Real-time runs at this gym and the current user's participation state.
  const { runs, joinedRunIds } = useGymRuns(gymId);

  // Start-a-Run modal state
  const [runModalVisible, setRunModalVisible] = useState(false);
  // Run type picker sheet — lets users choose Open / Private / Paid before proceeding
  const [runTypeSheetVisible, setRunTypeSheetVisible] = useState(false);
  const [selectedRunDay, setSelectedRunDay] = useState(null);   // day chip object
  const [selectedRunSlot, setSelectedRunSlot] = useState(null); // time slot object
  const [startingRun, setStartingRun] = useState(false);
  const [leavingRunId, setLeavingRunId] = useState(null);       // runId being left

  // ── Report modal state ──────────────────────────────────────────────────
  const [reportVisible, setReportVisible] = useState(false);
  const [reportType, setReportType] = useState(null);   // 'gym' | 'run'
  const [reportTargetId, setReportTargetId] = useState(null);

  // ── Per-run participant subscriptions ───────────────────────────────────────
  // Maps runId → participant[] so each run card can show real-time avatars
  // and names. Subscriptions are created/torn-down when the visible run list
  // changes. The dependency key is a comma-joined string of run IDs so the
  // effect only re-fires when the actual set of runs changes.
  const [runParticipantsMap, setRunParticipantsMap] = useState({});
  // Run ID whose full participant list modal is open (null = closed)
  const [participantModalRunId, setParticipantModalRunId] = useState(null);

  useEffect(() => {
    if (runs.length === 0) {
      setRunParticipantsMap({});
      return;
    }

    const unsubscribers = runs.map((run) =>
      subscribeToRunParticipants(run.id, (participants) => {
        setRunParticipantsMap((prev) => ({ ...prev, [run.id]: participants }));
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      setRunParticipantsMap({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.map((r) => r.id).join(',')]);

  /**
   * handleStartOrJoinRun — Creates a new run or joins an existing one.
   * Called when the user confirms from the Start-a-Run modal.
   * Delegates to runService.startOrJoinRun() which implements the merge rule.
   */
  const handleStartOrJoinRun = async () => {
    if (!selectedRunSlot) return;
    const gymDisplayName = gym?.name || gymName;
    setStartingRun(true);
    try {
      const { created } = await startOrJoinRun(
        gymId,
        gymDisplayName,
        selectedRunSlot.date
      );
      setRunModalVisible(false);
      setSelectedRunDay(null);
      setSelectedRunSlot(null);
      if (created) {
        Alert.alert(
          'Run Started!',
          `Your run at ${gymDisplayName} is live. Others can now see it and join.`,
          [{ text: 'Nice!' }]
        );
      } else {
        Alert.alert(
          'You\'re In!',
          `A run is already happening around that time at ${gymDisplayName}. You\'ve been added to it.`,
          [{ text: 'Let\'s go!' }]
        );
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start run. Please try again.');
    } finally {
      setStartingRun(false);
    }
  };

  /**
   * handleJoinRun — Joins an existing run directly by its Firestore ID (one tap, no modal).
   * Uses joinExistingRun instead of startOrJoinRun so past/in-progress runs
   * (within the 30-minute grace window) are joinable without hitting the
   * "start time must be in the future" validation.
   */
  const handleJoinRun = async (run) => {
    const gymDisplayName = gym?.name || gymName;
    try {
      await joinExistingRun(run.id, gymId, gymDisplayName);
      hapticSuccess();
      Alert.alert(
        'You\'re In!',
        `You\'ve joined the run at ${gymDisplayName}.`,
        [{ text: 'Let\'s go!' }]
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not join run. Please try again.');
    }
  };

  /**
   * handleLeaveRun — Removes the current user from a run.
   */
  const handleLeaveRun = async (runId) => {
    setLeavingRunId(runId);
    try {
      await leaveRun(runId);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not leave run. Please try again.');
    } finally {
      setLeavingRunId(null);
    }
  };

  /**
   * handleCheckInHere — One-tap check-in directly into the gym being viewed.
   *
   * Delegates to presenceService.checkIn() which handles the full side-effect
   * chain: presence write, activity feed, points award, and attendance recording.
   * On success the user stays on this screen; the live useGymPresences subscription
   * surfaces the updated player list automatically.
   */
  const handleCheckInHere = async () => {
    try {
      const gymDisplayName = gym?.name || gymName;

      const checkinResult = await checkIn(gymId);

      // presenceService.checkIn() now handles points + attendance recording
      // directly (client-side, idempotent). No Cloud Function needed here.

      // checkinResult.scheduleId is non-null when the check-in fulfilled a
      // prior scheduled visit — presenceService already determined this.
      const hasMatchedSchedule = !!checkinResult?.scheduleId;
      const ptsLabel  = hasMatchedSchedule ? '+15 pts' : '+10 pts';
      const bonusNote = hasMatchedSchedule
        ? 'Nice follow-through! You earned a +5 bonus.'
        : 'Keep showing up to earn more points.';

      hapticSuccess();
      Alert.alert(
        `Checked In! ${ptsLabel}`,
        `You're now checked in at ${gymDisplayName}. ${bonusNote}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      // Expected check-in failures (too far, no permission) are normal UX —
      // log at warn level, not error, to avoid noisy dev output.
      if (__DEV__) console.warn('[RunDetails] Check-in:', error.message);

      const msg = error.message || '';

      if (msg.includes('must be at the gym') || msg.includes('away')) {
        // Distance failure — expected UX case
        Alert.alert(
          'Too Far Away',
          'You need to be at the gym to check in. Head over and try again when you arrive.',
        );
      } else if (msg.includes('permission denied') || msg.includes('Permission denied')) {
        Alert.alert(
          'Location Required',
          'RunCheck needs your location to verify you are at the gym.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enable Location', onPress: handleEnableLocation },
          ],
        );
      } else if (msg.includes('Unable to retrieve') || msg.includes('GPS')) {
        Alert.alert(
          'GPS Unavailable',
          'Could not get your location. Please check that GPS is enabled and try again.',
        );
      } else {
        Alert.alert('Check-in Failed', msg || 'Please try again.');
      }
    }
  };

  // Error banner — shown when reviews or clips snapshot fails
  const [fetchError, setFetchError] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  // Reviewer stats cache — { [userId]: { totalAttended: number } }.
  // Populated lazily when the reviews snapshot changes; skips UIDs already
  // resolved so snapshot re-fires don't trigger duplicate user doc reads.
  const [reviewerStatsMap, setReviewerStatsMap] = useState({});
  const resolvedReviewerUidsRef = useRef(new Set());

  // Derived — true if the current user already has a review for this gym.
  // Recomputed whenever the live reviews snapshot updates.
  const hasReviewed = !!uid && reviews.some((r) => r.userId === uid);

  // Derived — true if the current user already has a clip for their active
  // presence session.  A "session" is identified by presence.id, which is
  // the compound key `{uid}_{gymId}` written by presenceService.checkIn().
  //
  // Matching on both uploaderUid AND presenceId means:
  //   • A different user posting at the same gym is never blocked.
  //   • The same user checking back in for a NEW session gets a fresh slot,
  //     even if their earlier clip is still within its 48-hour expiry window.
  //
  // Note: presenceId is stored on gymClips docs by the createClipSession /
  // finalizeClipUpload Cloud Functions (see backend change spec below).
  // Until the backend is deployed this will always be false, which is safe —
  // the server-side check is the authoritative guard.
  const hasAlreadyPostedClip =
    !!uid &&
    !!presence?.id &&
    Array.isArray(gymClips) &&
    gymClips.some((c) => c.uploaderUid === uid && c.presenceId === presence.id);

  // Review eligibility gate — true if user can review (runGyms OR gymVisits).
  // Set from checkReviewEligibility on mount; single user doc read.
  const [hasRunAttended, setHasRunAttended] = useState(false);
  // Strict run-verification signal — true only if user completed a verified run
  // here (runGyms). Used exclusively for the verifiedAttendee badge on the review doc.
  const [hasVerifiedRun, setHasVerifiedRun] = useState(false);

  // ── ScrollView ref + clips section Y offset (for scrollToClips nav param) ──
  const scrollViewRef  = useRef(null);
  const clipsYRef      = useRef(0);

  // Listen for scrollToClips param (set by TrimClipScreen after a successful post)
  // and scroll the view to the clips section automatically.
  useEffect(() => {
    if (!route.params?.scrollToClips) return;
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: clipsYRef.current, animated: true });
    }, 350); // small delay so the screen has settled after navigation
    // Clear the param so it doesn't re-trigger on subsequent focus events
    navigation.setParams({ scrollToClips: undefined });
    return () => clearTimeout(timer);
  }, [route.params?.scrollToClips]);

  // Auto-open the run creation modal when arriving from the Open Run flow
  // (Home → Start a Group Run → Open Run → pick a gym).
  // The user already chose "Open Run" so we skip the type picker entirely
  // and go straight to the date/time picker.
  useEffect(() => {
    if (route.params?.openStartRun) {
      setRunModalVisible(true);
      navigation.setParams({ openStartRun: undefined });
    }
  }, []);

  // Clip posting — tracks in-flight createClipSession calls
  const [postingClip, setPostingClip] = useState(false);

  // Bottom sheet — clip source picker
  const [clipSheetVisible, setClipSheetVisible] = useState(false);
  const clipSheetAnim = useRef(new Animated.Value(0)).current;

  const openClipSheet = () => {
    setClipSheetVisible(true);
    Animated.spring(clipSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
    }).start();
  };

  const closeClipSheet = (callback) => {
    Animated.timing(clipSheetAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setClipSheetVisible(false);
      if (typeof callback === 'function') callback();
    });
  };

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

  useEffect(() => {
    if (!uid) return;
    checkReviewEligibility(uid, gymId)
      .then(({ canReview, hasVerifiedRun: runVerified }) => {
        setHasRunAttended(canReview);
        setHasVerifiedRun(runVerified);
      })
      .catch((err) => { if (__DEV__) console.error('checkReviewEligibility error:', err); });
  }, [uid, gymId]);


  // Subscribe to this gym's reviews subcollection, newest first
  useEffect(() => {
    const q = query(
      collection(db, 'gyms', gymId, 'reviews'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      if (__DEV__) console.error('[reviews] error:', err.code, err.message);
      setFetchError(true);
    });
    return unsub;
  }, [gymId]);

  // Fetch reliability.totalAttended for any reviewer UIDs not yet in the cache.
  // Fires after every reviews snapshot update; UIDs already resolved are skipped
  // via resolvedReviewerUidsRef so each user doc is read at most once per session.
  useEffect(() => {
    if (reviews.length === 0) return;
    const newUids = reviews
      .map((r) => r.userId)
      .filter((id) => id && !resolvedReviewerUidsRef.current.has(id));
    if (newUids.length === 0) return;

    // Mark as in-flight before the async work so concurrent effect calls
    // triggered by rapid snapshot updates don't issue duplicate fetches.
    newUids.forEach((id) => resolvedReviewerUidsRef.current.add(id));

    Promise.all(
      newUids.map((id) =>
        getDoc(doc(db, 'users', id))
          .then((snap) => ({
            id,
            totalAttended: snap.data()?.reliability?.totalAttended ?? 0,
          }))
          .catch(() => ({ id, totalAttended: 0 }))
      )
    ).then((results) => {
      setReviewerStatsMap((prev) => {
        const next = { ...prev };
        results.forEach(({ id, totalAttended }) => { next[id] = { totalAttended }; });
        return next;
      });
    });
  }, [reviews]);

  // Gym Clips — daily highlight + 24-hour feed, both live via onSnapshot
  useEffect(() => {
    const authedUid = auth.currentUser?.uid;
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
          // Always use c.storagePath — the backend sets this to whichever
          // Storage object actually exists and is playable right now:
          //   No processor → rawStoragePath   (raw upload, exists immediately)
          //   Processor ran → finalStoragePath (transcoded output)
          // Do NOT use finalStoragePath directly: it is reserved by name at
          // finalize time but no file exists there until the processor runs.
          let url;
          try {
            url = await getDownloadURL(ref(storage, c.storagePath));
            setClipVideoUrls((prev) => {
              if (prev[c.id]) return prev;
              return { ...prev, [c.id]: url };
            });
          } catch (err) {
            if (__DEV__) console.warn('[clips] getDownloadURL failed for', c.id, err.message);
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

    // Gym Highlights query: show the 4 most recent clips for this gym within
    // the last 7 days. Clips persist permanently; visibility is controlled by
    // this recency window, not expiresAt. Uses composite index: gymId ASC + createdAt DESC.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const clipsQuery = query(
      collection(db, 'gymClips'),
      where('gymId', '==', gymId),
      where('createdAt', '>', Timestamp.fromDate(sevenDaysAgo)),
      orderBy('createdAt', 'desc'),
      limit(4)
    );

    // Client-side guard: show clips that are either fully finalized ("ready")
    // OR freshly uploaded and awaiting backend processing ("ready_raw").
    // Both statuses have storagePath + createdAt set by finalizeClipUpload.
    // Hidden and user-deleted clips are excluded from the feed.
    const isReadyClip = (c) =>
      (c.status === 'ready' || c.status === 'ready_raw') &&
      !!c.storagePath &&
      !!c.createdAt &&
      !c.isHidden &&
      !c.isDeletedByUser;

    const unsubClips = onSnapshot(clipsQuery, (snap) => {
      // TEMP: log every returned doc so we can confirm status/field shape
      if (__DEV__) {
        snap.docs.forEach((d) => {
          const { status, createdAt, expiresAt, thumbnailPath, storagePath, finalStoragePath, uploaderUid } = d.data();
          console.log('[gymClips doc]', {
            id: d.id, status, createdAt, expiresAt,
            thumbnailPath, storagePath, finalStoragePath, uploaderUid,
          });
        });
      }
      const readyList = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(isReadyClip);
      if (__DEV__) {
        console.log('[gymClips] total returned:', snap.docs.length, '| visible after filter:', readyList.length);
      }
      setGymClips(readyList);
      setClipsLoading(false);
      resolveClipUrls(readyList);
    }, (err) => {
      if (__DEV__) console.error('[gymClips feed] error:', err.code, err.message);
      setClipsLoading(false);
      setFetchError(true);
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
      if (__DEV__) console.error('toggleFollow error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  /**
   * toggleHomeCourt — Sets or clears this gym as the user's Home Court.
   *
   * Writes only `homeCourtId` to `users/{uid}`. The gym name is resolved
   * at render time from the gyms list — no cached name stored.
   * Completely independent from followedGyms / My Courts and awards no points.
   */
  const toggleHomeCourt = async () => {
    if (!uid) return;
    setHomeCourtLoading(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        homeCourtId: isHomeCourt ? null : gymId,
      });
    } catch (err) {
      if (__DEV__) console.error('toggleHomeCourt error:', err);
    } finally {
      setHomeCourtLoading(false);
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
              if (__DEV__) console.error('deleteReview error:', err);
              Alert.alert('Error', 'Could not delete your review. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Maximum clip length enforced on the library-upload path (recording is
  // capped natively inside RecordClipScreen at the same value).
  const MAX_CLIP_DURATION_SEC = 30;

  /**
   * goToRecorder — Path A: in-app recording.
   * No session is reserved here. presenceId is passed through RecordClipScreen →
   * TrimClipScreen so that createClipSession is only called when the user taps
   * Post Clip. Backing out at any earlier point is always safe.
   * Called by the bottom sheet "Record Clip" option.
   */
  const goToRecorder = () => {
    // presenceId forwarded through the recording flow; session created only on Post Clip tap.
    // gymName passed so RecordClipScreen can display it in the header.
    const presenceId   = presence?.id ?? null;
    const displayName  = gym?.name || gymName;
    closeClipSheet(() => {
      navigation.navigate('RecordClipScreen', { gymId, presenceId, gymName: displayName });
    });
  };

  /**
   * uploadFromLibrary — Path B: upload an existing video from the photo library.
   * Validates duration locally, then navigates to TrimClipScreen.
   * Session creation (createClipSession) is deferred to TrimClipScreen.handlePostClip
   * so backing out of the preview never consumes a clip slot.
   * Called by the bottom sheet "Upload from Library" option.
   */
  const uploadFromLibrary = async () => {
    closeClipSheet(async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (__DEV__) console.log('[clips] photo library permission status:', status);
      // 'limited' = iOS 14+ partial access — the picker still works, so allow it.
      if (status !== 'granted' && status !== 'limited') {
        Alert.alert(
          'Permission required',
          'Please allow access to your photo library in Settings to post a clip.'
        );
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
        if (__DEV__) console.log('Video picker error:', err);
        Alert.alert('Error', 'Could not open the video picker. Please try again.');
        return;
      }
      if (pickerResult.canceled) { return; }
      const asset = pickerResult.assets?.[0];
      if (!asset?.uri) { return; }

      // expo-image-picker returns duration in milliseconds.
      // Block here — before reserving a session — if the video is too long.
      if (asset.duration != null && asset.duration / 1000 > MAX_CLIP_DURATION_SEC) {
        Alert.alert(
          'Clip too long',
          `Please choose a video that is ${MAX_CLIP_DURATION_SEC} seconds or shorter.`
        );
        return;
      }

      // ── Validation passed — navigate to preview; session reserved on Post Clip tap ──
      // No createClipSession here. TrimClipScreen.handlePostClip creates the session
      // only when the user explicitly taps Post Clip, so backing out here is always safe.
      const presenceId  = presence?.id ?? null;
      const displayName = gym?.name || gymName;
      navigation.navigate('TrimClipScreen', {
        sourceVideoUri: asset.uri,
        gymId,
        gymName: displayName,
        presenceId,
      });
    });
  };

  /**
   * handlePostClip — Opens the clip source picker bottom sheet.
   * Session creation and upload logic lives entirely in TrimClipScreen.handlePostClip.
   */
  const handlePostClip = () => {
    if (!gymId) {
      Alert.alert('Error', 'No gym selected. Please try again.');
      return;
    }
    openClipSheet();
  };

  /**
   * handleSubmitReview — Delegates to reviewService.submitReview, which writes
   * the review doc and awaits the one-per-gym points award atomically.
   *
   * Guards (UI + service-layer):
   *   - Requires a star rating.
   *   - Blocks if user has already reviewed (UI guard + service re-check).
   *   - Points awarded at most once per user per gym (pointsService transaction).
   */
  const handleSubmitReview = async () => {
    if (selectedRating === 0) {
      Alert.alert('Rating Required', 'Please tap a star to rate this gym.');
      return;
    }
    if (!uid) return;
    if (hasReviewed) {
      Alert.alert('Already Reviewed', "You've already reviewed this gym.");
      setReviewModalVisible(false);
      return;
    }
    setSubmittingReview(true);
    try {
      const { success, alreadyReviewed, pointsResult } = await submitReview(
        uid,
        gymId,
        profile?.name    || 'Anonymous',
        profile?.photoURL ?? null,
        selectedRating,
        reviewText.trim(),
        hasVerifiedRun,  // isVerified: true only for run-completion path (badge signal)
      );
      if (alreadyReviewed) {
        Alert.alert('Already Reviewed', "You've already reviewed this gym.");
        setReviewModalVisible(false);
        return;
      }
      if (!success) {
        Alert.alert('Error', 'Could not submit your review. Please try again.');
        return;
      }
      setReviewModalVisible(false);
      setSelectedRating(0);
      setReviewText('');
      const message = pointsResult?.rankChanged
        ? `Review submitted! You ranked up to ${pointsResult.newRank?.name}! 🎉`
        : 'Review submitted! +15 pts 🎉';
      Alert.alert(message);
    } catch (err) {
      if (__DEV__) console.error('handleSubmitReview error:', err);
      Alert.alert('Error', 'Could not submit your review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };


  /**
   * renderRunParticipantAvatars — Social avatar row for a run card.
   *
   * Shows up to 3 overlapping participant avatars (30 px), a "+X" overflow
   * chip when more than 3 are present, a first-name preview line, and a
   * player count. Falls back to a text placeholder while the subscription
   * is loading (empty array).
   *
   * @param {string} runId
   * @returns {JSX.Element}
   */
  const renderRunParticipantAvatars = (runId) => {
    const participants = runParticipantsMap[runId] || [];
    const count = participants.length;

    if (count === 0) {
      return <Text style={styles.runCardMeta}>No one yet — be the first!</Text>;
    }

    const visible = participants.slice(0, 3);
    const extra = count - 3;

    // First-name preview: up to 2 names when there's overflow, up to 3 otherwise
    const previewSlice = extra > 0 ? participants.slice(0, 2) : participants.slice(0, 3);
    const firstNames = previewSlice.map((p) => (p.userName || 'Player').split(' ')[0]);
    const namePreview = extra > 0 ? firstNames.join(', ') + '…' : firstNames.join(', ');

    return (
      <View style={{ marginTop: 6 }}>
        <View style={styles.runAvatarRow}>
          {visible.map((p, idx) => (
            <TouchableOpacity
              key={p.userId}
              style={[styles.runAvatarWrap, idx > 0 && styles.runAvatarOffset]}
              onPress={() => navigation.navigate('UserProfile', { userId: p.userId })}
              activeOpacity={0.75}
            >
              {p.userAvatar ? (
                <Image source={{ uri: p.userAvatar }} style={styles.runAvatarImg} />
              ) : (
                <View style={styles.runAvatarFallback}>
                  <Text style={styles.runAvatarInitial}>
                    {(p.userName || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          {extra > 0 && (
            <TouchableOpacity
              style={[styles.runAvatarWrap, styles.runAvatarOffset, styles.runAvatarMore]}
              onPress={() => setParticipantModalRunId(runId)}
              activeOpacity={0.7}
            >
              <Text style={styles.runAvatarMoreText}>+{extra}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.runParticipantNames} numberOfLines={1}>{namePreview}</Text>
        {/* Here vs Going — derived from presence intersection */}
        {(() => {
          const hereCount = runHereCountMap[runId] || 0;
          if (hereCount > 0) {
            return (
              <View style={styles.runLiveRow}>
                <View style={styles.runLiveDot} />
                <Text style={styles.runLiveText}>
                  {hereCount} here{hereCount < count ? ` · ${count} going` : ''}
                </Text>
              </View>
            );
          }
          return (
            <Text style={styles.runCardMeta}>
              {count === 1 ? '1 player going' : `${count} players going`}
            </Text>
          );
        })()}
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

  // ── Single source of truth for "Now Playing" ─────────────────────────────
  // De-duplicate the real-time presence list by `odId` (the userId key written
  // onto every presence doc at check-in time). This ensures the "Players Here"
  // stat, the pulse animation, and the PresenceList rows all reflect the same
  // set of users — even if a stale/duplicate doc slipped through.
  //
  // A presence must have a non-empty `odId` to be counted; docs without one
  // cannot be linked to a user and are silently excluded.
  const uniqueActivePresences = useMemo(() => {
    const seen = new Set();
    return presences.filter((p) => {
      const uid = p.odId;
      if (!uid || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    });
  }, [presences]);

  // ── Run activation: "here" count per run ───────────────────────────────
  // Cross-reference run participants with active presences at this gym.
  // hereCount = participants who are also physically checked in right now.
  // Pure derivation — no schema changes, no new Firestore reads.
  const runHereCountMap = useMemo(() => {
    const hereUids = new Set(uniqueActivePresences.map((p) => p.odId));
    const map = {};
    Object.entries(runParticipantsMap).forEach(([runId, participants]) => {
      map[runId] = participants.filter((p) => hereUids.has(p.userId)).length;
    });
    return map;
  }, [runParticipantsMap, uniqueActivePresences]);

  // Sort runs: live (hereCount > 0) first, then by startTime ascending within each group
  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => {
      const aLive = (runHereCountMap[a.id] || 0) > 0 ? 1 : 0;
      const bLive = (runHereCountMap[b.id] || 0) > 0 ? 1 : 0;
      if (bLive !== aLive) return bLive - aLive; // live runs first
      // Within same group, preserve time ordering
      const aTime = a.startTime?.toMillis?.() ?? 0;
      const bTime = b.startTime?.toMillis?.() ?? 0;
      return aTime - bTime;
    });
  }, [runs, runHereCountMap]);

  // (presence debug logs removed — counts confirmed stable)

  // Tick counter forces a re-render every 60 seconds so "X minutes ago"
  // timestamps on presence cards stay current without a full data refetch.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (uniqueActivePresences.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [uniqueActivePresences.length]);

  // Hide the default navigation header — this screen uses a custom hero image header
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Animated value for the pulsing live indicator dot next to the player count
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // playerCount is derived from uniqueActivePresences — the same deduplicated
  // real-time array rendered by PresenceList — so the stat card, pulse animation,
  // and player rows always agree. Route-param fallback is used only while the
  // initial Firestore snapshot is still loading (presencesLoading === true).
  const playerCount = presencesLoading
    ? (paramPlayers ?? 0)
    : uniqueActivePresences.length;

  // Planning Today: union of scheduled-visit user IDs and run-participant user IDs
  // for today's runs. Deduplication (via Set) prevents double-counting a user
  // who both planned a visit AND joined a run at this gym today.
  // Runs ⊂ Planning — joining a run implicitly counts as planning.
  const todayCount = useMemo(() => {
    const seenUids = new Set();
    todaySchedules.forEach((s) => {
      const id = s.odId || s.userId;
      if (id) seenUids.add(id);
    });
    runs.forEach((run) => {
      const runDate = run.startTime?.toDate();
      if (runDate && isToday(runDate)) {
        (runParticipantsMap[run.id] || []).forEach((p) => {
          if (p.userId) seenUids.add(p.userId);
        });
      }
    });
    const total = seenUids.size;
    // Fall back to route-param value only when live data hasn't loaded yet
    return total > 0 ? total : (paramPlannedToday || 0);
  }, [todaySchedules, runs, runParticipantsMap, paramPlannedToday]);

  // Planning Tomorrow: same Set-union pattern as todayCount — union of scheduled-visit
  // user IDs and run-participant user IDs for tomorrow's runs. Deduplication prevents
  // double-counting a user who both planned a visit AND joined a run tomorrow.
  const tomorrowCount = useMemo(() => {
    const seenUids = new Set();
    tomorrowSchedules.forEach((s) => {
      const id = s.odId || s.userId;
      if (id) seenUids.add(id);
    });
    runs.forEach((run) => {
      const runDate = run.startTime?.toDate();
      if (runDate && isTomorrow(runDate)) {
        (runParticipantsMap[run.id] || []).forEach((p) => {
          if (p.userId) seenUids.add(p.userId);
        });
      }
    });
    const total = seenUids.size;
    // Fall back to route-param value only when live data hasn't loaded yet
    return total > 0 ? total : (paramPlannedTomorrow || 0);
  }, [tomorrowSchedules, runs, runParticipantsMap, paramPlannedTomorrow]);

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
      if (__DEV__) console.error('[toggleLike] error:', err.message);
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
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero image header with an absolute-positioned back button */}
        <View style={styles.heroContainer}>
          <Image
            source={
              GYM_LOCAL_IMAGES[gymId]
                ? GYM_LOCAL_IMAGES[gymId]
                : (gym?.imageUrl || paramImageUrl)
                ? { uri: gym?.imageUrl || paramImageUrl }
                : courtImage
            }
            style={styles.heroImage}
            resizeMode="cover"
          />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() =>
              navigation.canGoBack()
                ? navigation.goBack()
                : navigation.navigate('ViewRunsMain')
            }
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Dismissible error banner — shown when reviews or clips snapshot fails */}
        {fetchError && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setFetchError(false)} activeOpacity={0.8}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.errorBannerText}>Something went wrong — pull to refresh</Text>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Gym name, address, directions button, and type badge */}
        <View style={styles.header}>
          {/* Gym name — full-width row so long names wrap naturally */}
          <Text style={styles.gymName} numberOfLines={2}>{gym?.name || gymName}</Text>

          {/* Action buttons row — sits below the name so it never competes for space */}
          <View style={styles.gymActionRow}>
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
            {/* Home Court toggle — separate from Follow/heart */}
            <TouchableOpacity
              style={[
                styles.followButton,
                isHomeCourt && { backgroundColor: '#6366F120', borderColor: '#6366F155' },
              ]}
              onPress={toggleHomeCourt}
              disabled={homeCourtLoading}
            >
              <Ionicons
                name={isHomeCourt ? 'home' : 'home-outline'}
                size={16}
                color={isHomeCourt ? '#6366F1' : colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.followButtonText,
                  isHomeCourt && { color: '#6366F1' },
                ]}
              >
                {isHomeCourt ? 'Home Court' : 'Set Home'}
              </Text>
            </TouchableOpacity>
            {/* Report gym */}
            <TouchableOpacity
              style={styles.followButton}
              onPress={() => { setReportType('gym'); setReportTargetId(gymId); setReportVisible(true); }}
            >
              <Ionicons name="flag-outline" size={16} color={colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.followButtonText}>Report</Text>
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

          {/* Smart proximity prompt — shown when user is physically at this gym */}
          {nearbyGym && locationEnabled && !isCheckedInHere && (
            <View style={styles.proximityCard}>
              <View style={styles.proximityIconWrap}>
                <Ionicons name="location" size={22} color="#FF7A45" />
              </View>
              <View style={styles.proximityContent}>
                <Text style={styles.proximityTitle}>You're at {nearbyGym.name}</Text>
                <Text style={styles.proximitySubtitle}>
                  Looks like you arrived. Check in to let players know you're here.
                </Text>
                <View style={styles.proximityButtons}>
                  <TouchableOpacity
                    style={styles.proximityCheckInBtn}
                    onPress={handleProximityCheckIn}
                    disabled={proximityCheckingIn}
                    activeOpacity={0.82}
                  >
                    {proximityCheckingIn ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.proximityCheckInText}>Check In</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.proximityDismissBtn}
                    onPress={() => dismissProximity(nearbyGym.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.proximityDismissText}>Not now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Primary CTA — one-tap check-in directly into this gym */}
          <TouchableOpacity
            style={[
              styles.checkInButton,
              isCheckedInHere && styles.checkInButtonCheckedIn,
              (checkingIn || isCheckedInHere) && { opacity: isCheckedInHere ? 1 : 0.6 },
            ]}
            onPress={handleCheckInHere}
            disabled={checkingIn || isCheckedInHere}
          >
            {checkingIn ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isCheckedInHere ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.checkInButtonText}>You're Checked In</Text>
              </>
            ) : (
              <Text style={styles.checkInButtonText}>Check In Here</Text>
            )}
          </TouchableOpacity>

          {/* Check-in helper text */}
          {!isCheckedInHere && (
            <Text style={styles.checkInHelper}>
              You must be at the gym to check in.
            </Text>
          )}

          {/* Start a Run — secondary CTA, visually distinct from Check In */}
          <TouchableOpacity
            style={styles.startRunCTA}
            onPress={() => setRunModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="basketball-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.startRunCTAText}>Start a Run</Text>
          </TouchableOpacity>

          {/* Location permission CTA — shown when not granted and not already checked in */}
          {!locationEnabled && !isCheckedInHere && (
            <TouchableOpacity style={styles.locationCTA} activeOpacity={0.8} onPress={handleEnableLocation}>
              <Ionicons name="location" size={16} color="#F97316" />
              <Text style={styles.locationCTAText}>Enable location for check-in</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}

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

            {/* ── Hours of operation ─────────────────────────────────────────
                Stored in Firestore as gym.hours = { monday: { open: "HH:MM", close: "HH:MM" }, ... }
                Today's hours shown inline; tap the row to expand the full week.
            ──────────────────────────────────────────────────────────────── */}
            {gym?.hours && (() => {
              const todayKey = DAYS_OF_WEEK[new Date().getDay()];
              const todayHours = gym.hours[todayKey];
              return (
                <View style={styles.hoursBlock}>
                  <TouchableOpacity
                    style={styles.hoursHeader}
                    onPress={() => setHoursExpanded((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.hoursHeaderLeft}>
                      <Ionicons name="time-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.hoursToday}>
                        Today: <Text style={styles.hoursTodayValue}>{formatHoursRange(todayHours)}</Text>
                      </Text>
                    </View>
                    <Ionicons
                      name={hoursExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>

                  {hoursExpanded && (
                    <View style={styles.hoursWeek}>
                      {DAYS_OF_WEEK.map((day) => {
                        const isCurrentDay = day === todayKey;
                        return (
                          <View key={day} style={styles.hoursRow}>
                            <Text style={[styles.hoursDay, isCurrentDay && styles.hoursDayToday]}>
                              {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                            </Text>
                            <Text style={[styles.hoursTime, isCurrentDay && styles.hoursTimeToday]}>
                              {formatHoursRange(gym.hours[day])}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* ── Gym website — shown only for membership/day-pass gyms ──────
                Lets players visit the gym's site for membership pricing info.
                Stored in Firestore as gym.websiteUrl (string URL).
            ──────────────────────────────────────────────────────────────── */}
            {gym?.websiteUrl && gym?.accessType !== 'free' && (
              <TouchableOpacity
                style={styles.websiteButton}
                onPress={() => Linking.openURL(gym.websiteUrl).catch(() => {})}
                activeOpacity={0.75}
              >
                <Ionicons name="globe-outline" size={15} color={colors.infoText} style={{ marginRight: 6 }} />
                <Text style={styles.websiteButtonText}>Visit Gym Website</Text>
                <Ionicons name="open-outline" size={12} color={colors.infoText} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}
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

        {/* ── Upcoming Runs ───────────────────────────────────────────────────
            Organized group runs at this gym (today and tomorrow). Shown above
            Now Playing so the Start a Run CTA is prominent near the top.
            Separate from the check-in / presence system — no Firestore schema changes.
        ─────────────────────────────────────────────────────────────────── */}
        <View style={[styles.runsSection, { marginHorizontal: SPACING.lg }]}>
          <View style={styles.runsSectionHeader}>
            <View style={styles.runsSectionTitleRow}>
              <Ionicons name="basketball-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.runsSectionTitle}>Upcoming Runs</Text>
            </View>
          </View>

          {sortedRuns.length === 0 ? (
            <View style={styles.runsEmptyState}>
              <Text style={styles.runsEmptyText}>No runs planned yet</Text>
              <Text style={styles.runsEmptySubtext}>Be the first to start one</Text>
            </View>
          ) : (
            sortedRuns.map((run) => {
              const isJoined = joinedRunIds.has(run.id);
              const isLeaving = leavingRunId === run.id;
              return (
                <View key={run.id} style={[styles.runCard, { alignItems: 'flex-start' }]}>
                  <View style={styles.runCardLeft}>
                    <Text style={styles.runCardTime}>{formatRunTime(run.startTime)}</Text>
                    {renderRunParticipantAvatars(run.id)}
                    {run.creatorName ? (
                      <Text style={styles.runStartedBy}>Started by {run.creatorName}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.runCardRight, { paddingTop: 2 }]}>
                    {isJoined ? (
                      <View style={styles.runJoinedActions}>
                        <View style={styles.runGoingBadge}>
                          <Text style={styles.runGoingBadgeText}>Going</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.runLeaveButton}
                          onPress={() => handleLeaveRun(run.id)}
                          disabled={isLeaving}
                        >
                          {isLeaving ? (
                            <ActivityIndicator size="small" color={colors.textMuted} />
                          ) : (
                            <Text style={styles.runLeaveButtonText}>Leave</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.runJoinButton}
                        onPress={() => handleJoinRun(run)}
                      >
                        <Text style={styles.runJoinButtonText}>Join Run</Text>
                      </TouchableOpacity>
                    )}
                    {/* Chat button — participants only.
                        Non-participants cannot enter chat (UI + Firestore rules). */}
                    {isJoined && (
                      <TouchableOpacity
                        onPress={() => navigation.navigate('RunChat', {
                          runId: run.id,
                          gymId,
                          gymName: gym?.name || gymName,
                          startTime: run.startTime ?? null,
                        })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
                        <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary }}>Chat</Text>
                      </TouchableOpacity>
                    )}
                    {/* Report run */}
                    <TouchableOpacity
                      onPress={() => { setReportType('run'); setReportTargetId(run.id); setReportVisible(true); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginTop: 6 }}
                    >
                      <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Now Playing section — deduplicated real-time presences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Playing</Text>
          <PresenceList
            items={uniqueActivePresences}
            type="presence"
            navigation={navigation}
            emptyMessage="No one here yet"
            emptySubtext="Be the first to check in!"
          />
        </View>

        {/* Gym Highlights — Stories-style horizontal row */}
        <View
          style={styles.section}
          onLayout={(e) => { clipsYRef.current = e.nativeEvent.layout.y; }}
        >
          {/* Section header */}
          <View style={clipPlayerStyles.storiesHeaderRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Gym Highlights</Text>
            <Text style={clipPlayerStyles.storiesSubtitle}>From recent sessions</Text>
          </View>

          {clipsLoading ? (
            // Skeleton: Post tile + 3 grey placeholder tiles while data loads
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={clipPlayerStyles.storiesRow}
            >
              <TouchableOpacity
                style={[
                  clipPlayerStyles.storiesPostTile,
                  (postingClip || hasAlreadyPostedClip) && { opacity: 0.5 },
                ]}
                onPress={handlePostClip}
                disabled={postingClip || hasAlreadyPostedClip || !gymId}
              >
                {postingClip ? (
                  <ActivityIndicator color="#FF7A45" size="small" />
                ) : hasAlreadyPostedClip ? (
                  <Ionicons name="checkmark-circle-outline" size={24} color="#6B7280" />
                ) : (
                  <Ionicons name="add-circle-outline" size={24} color="#FF7A45" />
                )}
                <Text style={clipPlayerStyles.storiesPostLabel}>
                  {postingClip ? 'Starting…' : hasAlreadyPostedClip ? 'Posted' : 'Post'}
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
                  style={[
                    clipPlayerStyles.storiesPostTile,
                    (postingClip || hasAlreadyPostedClip) && { opacity: 0.5 },
                  ]}
                  onPress={handlePostClip}
                  disabled={postingClip || hasAlreadyPostedClip || !gymId}
                >
                  {postingClip ? (
                    <ActivityIndicator color="#FF7A45" size="small" />
                  ) : hasAlreadyPostedClip ? (
                    <Ionicons name="checkmark-circle-outline" size={24} color="#6B7280" />
                  ) : (
                    <Ionicons name="add-circle-outline" size={24} color="#FF7A45" />
                  )}
                  <Text style={clipPlayerStyles.storiesPostLabel}>
                    {postingClip ? 'Starting…' : hasAlreadyPostedClip ? 'Posted' : 'Post'}
                  </Text>
                </TouchableOpacity>
              }
              ListEmptyComponent={
                <View style={clipPlayerStyles.storiesEmptyWrap}>
                  <Ionicons name="film-outline" size={22} color="rgba(255,255,255,0.18)" style={{ marginBottom: 6 }} />
                  <Text style={clipPlayerStyles.storiesEmptyText}>No highlights yet</Text>
                  <Text style={clipPlayerStyles.storiesEmptySubtext}>Post a clip from your session</Text>
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

          {/* Rating summary — shown above the CTA only when reviews exist */}
          {reviews.length > 0 && (() => {
            const avg = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
            return (
              <View style={styles.ratingSummary}>
                <Text style={styles.ratingBig}>{avg.toFixed(1)}</Text>
                <View style={styles.ratingDetails}>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={star <= Math.round(avg) ? 'star' : 'star-outline'}
                        size={16}
                        color="#F59E0B"
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingCount}>
                    {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>
              </View>
            );
          })()}

          {/*
           * Leave a Review CTA — gated behind two conditions:
           *   1. User must have a verified visit or run at this gym (hasRunAttended)
           *   2. User must not have already reviewed this gym (hasReviewed)
           * If neither condition blocks, show the primary button.
           */}
          {!hasRunAttended ? (
            <View style={styles.reviewGateNote}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.reviewGateText}>Check in here to leave a review</Text>
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

          {/* Reviews list — sorted: verified run first, then rating desc, then newest.
              Empty state shown inline when no reviews exist. */}
          {reviews.length === 0 ? (
            <View style={styles.reviewsEmpty}>
              <Ionicons name="star-outline" size={28} color={colors.textMuted} />
              <Text style={styles.reviewsEmptyText}>No reviews yet</Text>
              <Text style={styles.reviewsEmptySubtext}>Be the first to leave one!</Text>
            </View>
          ) : (
            [...reviews]
              .sort((a, b) => {
                // Priority 1 — verified run attendees float to the top
                const aV = a.verifiedAttendee ? 1 : 0;
                const bV = b.verifiedAttendee ? 1 : 0;
                if (bV !== aV) return bV - aV;
                // Priority 2 — higher rating first
                const ratingDiff = (b.rating || 0) - (a.rating || 0);
                if (ratingDiff !== 0) return ratingDiff;
                // Priority 3 — newest first
                const aMs = a.createdAt?.toMillis?.() ?? 0;
                const bMs = b.createdAt?.toMillis?.() ?? 0;
                return bMs - aMs;
              })
              .map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('UserProfile', { userId: review.userId })}
                    >
                      {review.userAvatar ? (
                        <Image source={{ uri: review.userAvatar }} style={styles.reviewAvatar} />
                      ) : (
                        <View style={styles.reviewAvatarPlaceholder}>
                          <Text style={styles.reviewAvatarInitial}>
                            {(review.userName || 'A')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.reviewMeta}>
                      {/* Name + run count on one line */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => navigation.navigate('UserProfile', { userId: review.userId })}
                        >
                          <Text style={styles.reviewerName}>{review.userName || 'Anonymous'}</Text>
                        </TouchableOpacity>
                        {(reviewerStatsMap[review.userId]?.totalAttended ?? 0) > 0 && (
                          <Text style={{ fontSize: 11, color: colors.textMuted }}>
                            {' \u2022 '}{reviewerStatsMap[review.userId].totalAttended} runs attended
                          </Text>
                        )}
                      </View>
                      {/* Star rating */}
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
                      {/* Verified Run badge — below stars, run-completion path only */}
                      {review.verifiedAttendee && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                          <Ionicons name="checkmark-circle" size={12} color="#6366F1" />
                          <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '600' }}>Verified Run</Text>
                        </View>
                      )}
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

      {/* ── Run Type Picker Sheet ────────────────────────────────────────── */}
      {/* Only Open Run is available at app-listed gyms. Private and Paid     */}
      {/* runs are only accessible from the Home screen (user supplies own    */}
      {/* venue). The "+ Start a Run" button now bypasses this sheet entirely. */}
      <Modal
        visible={runTypeSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRunTypeSheetVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setRunTypeSheetVisible(false)}
        />
        <View style={styles.typeSheetContainer}>
          {/* Handle */}
          <View style={styles.typeSheetHandle} />

          <Text style={styles.typeSheetTitle}>What kind of run?</Text>
          <Text style={styles.typeSheetSub}>Choose how you want to set up your run.</Text>

          {/* Open Run */}
          <TouchableOpacity
            style={styles.typeSheetOption}
            onPress={() => {
              setRunTypeSheetVisible(false);
              setRunModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.typeSheetIconWrap, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="basketball-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeSheetOptionTitle}>Open Run</Text>
              <Text style={styles.typeSheetOptionDesc}>Anyone can see and join. Great for getting a full court going.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

        </View>
      </Modal>

      {/* ── Start a Run Modal ────────────────────────────────────────────── */}
      <Modal
        visible={runModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRunModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.runModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setRunModalVisible(false)}
            />
            <View style={styles.runModalCard}>
              <Text style={styles.runModalTitle}>Start a Run</Text>
              <Text style={styles.runModalSubtitle}>
                Pick a time — others nearby will see it and can join.
              </Text>

              {/* Day picker */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.runDayPickerContent}
                style={styles.runDayPickerRow}
              >
                {getRunDays().map((day) => (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.runDayChip,
                      selectedRunDay?.key === day.key && styles.runDayChipSelected,
                    ]}
                    onPress={() => { setSelectedRunDay(day); setSelectedRunSlot(null); }}
                  >
                    <Text style={[
                      styles.runDayChipLabel,
                      selectedRunDay?.key === day.key && styles.runDayChipLabelSelected,
                    ]}>
                      {day.label}
                    </Text>
                    <Text style={[
                      styles.runDayChipDate,
                      selectedRunDay?.key === day.key && styles.runDayChipDateSelected,
                    ]}>
                      {day.dateStr}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Time slot grid */}
              {!selectedRunDay ? (
                <View style={styles.runSelectDayPrompt}>
                  <Text style={styles.runSelectDayText}>Select a day above</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.runSlotsScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.runSlotsContainer}>
                    {getRunSlots(selectedRunDay).map((slot) => (
                      <TouchableOpacity
                        key={slot.timeSlot}
                        style={[
                          styles.runSlotCard,
                          selectedRunSlot?.timeSlot === slot.timeSlot && styles.runSlotCardSelected,
                        ]}
                        onPress={() => setSelectedRunSlot(slot)}
                      >
                        <Text style={[
                          styles.runSlotText,
                          selectedRunSlot?.timeSlot === slot.timeSlot && styles.runSlotTextSelected,
                        ]}>
                          {slot.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}

              {/* Actions */}
              <View style={styles.runModalActions}>
                <TouchableOpacity
                  style={styles.runModalCancelButton}
                  onPress={() => {
                    setRunModalVisible(false);
                    setSelectedRunDay(null);
                    setSelectedRunSlot(null);
                  }}
                  disabled={startingRun}
                >
                  <Text style={styles.runModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.runModalConfirmButton,
                    (!selectedRunSlot || startingRun) && styles.runModalButtonDisabled,
                  ]}
                  onPress={handleStartOrJoinRun}
                  disabled={!selectedRunSlot || startingRun}
                >
                  {startingRun ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.runModalConfirmText}>Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Clip Source Bottom Sheet ─────────────────────────────────────── */}
      <Modal
        visible={clipSheetVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeClipSheet()}
      >
        {/* Scrim — tap outside to dismiss */}
        <TouchableOpacity
          style={clipSheetStyles.scrim}
          activeOpacity={1}
          onPress={() => closeClipSheet()}
        >
          {/* Sheet panel — block touch propagation so tapping inside doesn't close */}
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <Animated.View
              style={[
                clipSheetStyles.sheet,
                {
                  transform: [{
                    translateY: clipSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  }],
                  opacity: clipSheetAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 1],
                  }),
                },
              ]}
            >
              {/* Drag handle */}
              <View style={clipSheetStyles.handle} />

              <Text style={clipSheetStyles.sheetTitle}>Post a Clip</Text>
              <Text style={clipSheetStyles.sheetSubtitle}>
                Clips must be 10 seconds or less
              </Text>

              {/* Record option */}
              <TouchableOpacity
                style={clipSheetStyles.option}
                onPress={goToRecorder}
                activeOpacity={0.7}
              >
                <View style={[clipSheetStyles.optionIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="videocam" size={22} color="#2563EB" />
                </View>
                <View style={clipSheetStyles.optionText}>
                  <Text style={clipSheetStyles.optionLabel}>Record Clip</Text>
                  <Text style={clipSheetStyles.optionSub}>Use your camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Divider */}
              <View style={clipSheetStyles.divider} />

              {/* Library option */}
              <TouchableOpacity
                style={clipSheetStyles.option}
                onPress={uploadFromLibrary}
                activeOpacity={0.7}
              >
                <View style={[clipSheetStyles.optionIcon, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="images" size={22} color="#7C3AED" />
                </View>
                <View style={clipSheetStyles.optionText}>
                  <Text style={clipSheetStyles.optionLabel}>Upload from Library</Text>
                  <Text style={clipSheetStyles.optionSub}>Choose an existing video</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Cancel button */}
              <TouchableOpacity
                style={clipSheetStyles.cancelButton}
                onPress={() => closeClipSheet()}
                activeOpacity={0.7}
              >
                <Text style={clipSheetStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Participant list modal (opened by +N bubble) ──────────────── */}
      <Modal
        visible={participantModalRunId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setParticipantModalRunId(null)}
      >
        <TouchableOpacity
          style={styles.participantModalOverlay}
          activeOpacity={1}
          onPress={() => setParticipantModalRunId(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.participantModalSheet}>
            <View style={styles.participantModalHandle} />
            <Text style={styles.participantModalTitle}>Players Going</Text>
            <FlatList
              data={participantModalRunId ? (runParticipantsMap[participantModalRunId] || []) : []}
              keyExtractor={(item) => item.userId || item.id}
              style={styles.participantModalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.participantModalRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setParticipantModalRunId(null);
                    navigation.navigate('UserProfile', { userId: item.userId });
                  }}
                >
                  {item.userAvatar ? (
                    <Image source={{ uri: item.userAvatar }} style={styles.participantModalAvatar} />
                  ) : (
                    <View style={[styles.participantModalAvatar, styles.participantModalAvatarFallback]}>
                      <Text style={styles.participantModalInitial}>
                        {(item.userName || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.participantModalName} numberOfLines={1}>
                    {item.userName || 'Player'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.participantModalClose}
              onPress={() => setParticipantModalRunId(null)}
            >
              <Text style={styles.participantModalCloseText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Report modal (shared for gym + run reports) */}
      <ReportModal
        visible={reportVisible}
        onClose={() => { setReportVisible(false); setReportType(null); setReportTargetId(null); }}
        type={reportType}
        targetId={reportTargetId}
      />

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
  const isProcessing = clip.status === 'ready_raw';

  return (
    <TouchableOpacity
      style={[clipPlayerStyles.gridTile, style]}
      onPress={() => {
        // Allow playback if a URL is resolved even while raw; "Processing" is
        // just informational. If no URL yet, tapping does nothing.
        if (videoUrl) navigation.navigate('ClipPlayer', { videoUrl, clipId: clip.id, gymId: clip.gymId });
      }}
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
          size={32}
          color="rgba(255,255,255,0.95)"
        />
      </View>

      {/* Bottom-left identity: avatar + name + time — tappable, opens profile */}
      <TouchableOpacity
        style={clipPlayerStyles.tileIdentityOverlay}
        onPress={() => navigation.navigate('UserProfile', { userId: clip.uploaderUid })}
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
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={12} color={liked ? '#FF6B35' : '#ccc'} />
        <Text style={[clipPlayerStyles.tileLikesPillText, liked && clipPlayerStyles.tileLikesPillTextActive]}>
          {likesCount}
        </Text>
      </TouchableOpacity>

      {/* Processing badge — shown while backend transcodes the raw upload */}
      {isProcessing && (
        <View style={clipPlayerStyles.processingBadge}>
          <Text style={clipPlayerStyles.processingBadgeText}>Processing…</Text>
        </View>
      )}

    </TouchableOpacity>
  );
}

// ─── Clip Source Bottom Sheet styles ──────────────────────────────────────────
const clipSheetStyles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 24,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  optionSub: {
    fontSize: 13,
    color: '#6B7280',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F3F4F6',
    marginLeft: 58,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
});

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
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    marginBottom: SPACING.sm,
  },
  storiesSubtitle: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '400',
  },
  // (clipCountBadge / clipCountText removed — count badge no longer shown)
  // Shared horizontal scroll container for both loaded and skeleton states.
  storiesRow: {
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: SPACING.xs,
    paddingRight: 4,
  },
  // "+ Post" tile — same shape as clip tiles, more subtle styling.
  storiesPostTile: {
    width: 120,
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  storiesPostLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(255,255,255,0.45)',
  },
  // Override applied on top of gridTile for the horizontal stories row.
  // Fixed height — all content (thumbnail + overlays) lives inside the clip.
  storiesTile: {
    width: 120,
    height: 160,
    flex: 0,
    aspectRatio: 0.75,              // overrides gridTile's 1:1 → forces 3:4 portrait
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',  // subtle card edge
    // overflow:'hidden' is inherited from gridTile — all overlays stay inside
  },
  // ── Tile overlay internals ─────────────────────────────────────────────────
  // Dark scrim covering the bottom portion of the thumbnail for text legibility.
  tileScrim: {
    ...StyleSheet.absoluteFillObject,
    top: '50%',                   // bottom half scrim → more coverage for identity overlay
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
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
    fontSize: 11,
    fontWeight: '600',
  },
  tileTimeAgo: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
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
    borderRadius: 14,
    backgroundColor: '#252525',
  },
  // Empty state wrapper — same height as tiles so text centers in the row.
  storiesEmptyWrap: {
    height: 160,
    width: 150,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  storiesEmptyText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.38)',
    fontWeight: '500',
    textAlign: 'center',
  },
  storiesEmptySubtext: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    marginTop: 3,
  },
  // "Processing…" badge overlaid on ready_raw clip tiles.
  processingBadge: {
    position: 'absolute',
    bottom: 30,           // sits just above the identity overlay
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  processingBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
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
  gymName: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  gymActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.xs,
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

  // ── Hours of operation ──────────────────────────────────────────────────────
  hoursBlock: {
    marginTop: SPACING.sm,
  },
  hoursHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hoursHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hoursToday: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
  },
  hoursTodayValue: {
    color: colors.textPrimary || colors.text,
    fontWeight: FONT_WEIGHTS.medium,
  },
  hoursWeek: {
    marginTop: SPACING.xs,
    paddingLeft: 20,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  hoursDay: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    width: 30,
    fontWeight: FONT_WEIGHTS.medium,
  },
  hoursDayToday: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  hoursTime: {
    fontSize: FONT_SIZES.xs,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },
  hoursTimeToday: {
    color: colors.textPrimary || colors.text,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── Gym website button ──────────────────────────────────────────────────────
  websiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: colors.infoBg ?? 'rgba(10,132,255,0.1)',
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  websiteButtonText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.infoText,
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
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  checkInButtonCheckedIn: {
    backgroundColor: '#22C55E',
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
  checkInHelper: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
  },
  startRunCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  startRunCTAText: {
    color: colors.primary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  locationCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(249,115,22,0.08)',
  },
  locationCTAText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#F97316',
    flex: 1,
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

  // ─── Run card participant avatars ─────────────────────────────────────────
  // Compact 30 px avatars that fit inside the run card. Same overlapping-stack
  // pattern as the removed Who's Going section (36 px), scaled down.
  runAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  runAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.surface,
    overflow: 'hidden',
  },
  runAvatarOffset: {
    marginLeft: 4,
  },
  runAvatarImg: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  runAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  runAvatarInitial: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  runAvatarMore: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: colors.border,
  },
  runAvatarMoreText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
  },

  // ─── Participant list modal ─────────────────────────────────────────────
  participantModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  participantModalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.lg * 1.5,
    borderTopRightRadius: RADIUS.lg * 1.5,
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
    maxHeight: '60%',
  },
  participantModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  participantModalTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginBottom: SPACING.md,
  },
  participantModalList: {
    flexGrow: 0,
  },
  participantModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
  },
  participantModalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  participantModalAvatarFallback: {
    backgroundColor: colors.primary + '25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantModalInitial: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  participantModalName: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  participantModalClose: {
    marginTop: SPACING.md,
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
  },
  participantModalCloseText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
  },
  runParticipantNames: {
    fontSize: FONT_SIZES.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },

  // ─── Runs section ────────────────────────────────────────────────────────
  runsSection: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  runsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  runsSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  runsSectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  startRunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  startRunButtonText: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // ── Run type picker bottom sheet ──────────────────────────────────────────
  typeSheetContainer: {
    backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl ?? 48,
    paddingTop: SPACING.sm,
  },
  typeSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: isDark ? '#48484A' : '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  typeSheetTitle: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.bold,
    color: isDark ? '#FFFFFF' : '#111111',
    marginBottom: SPACING.xxs,
  },
  typeSheetSub: {
    fontSize: FONT_SIZES.small,
    color: isDark ? '#8E8E93' : '#6B7280',
    marginBottom: SPACING.md,
  },
  typeSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  typeSheetIconWrap: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  typeSheetOptionTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: isDark ? '#FFFFFF' : '#111111',
    marginRight: SPACING.xs,
  },
  typeSheetOptionDesc: {
    fontSize: FONT_SIZES.small,
    color: isDark ? '#8E8E93' : '#6B7280',
    lineHeight: 18,
  },
  typeSheetPremiumChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B3518',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FF6B3535',
  },
  typeSheetPremiumChipText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FF6B35',
  },
  typeSheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: isDark ? '#38383A' : '#E5E7EB',
    marginLeft: 62,
  },
  runsEmptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  runsEmptyText: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runsEmptySubtext: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  runCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  runCardLeft: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  runCardTime: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  runCardMeta: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Run activation — LIVE indicator row
  runLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  runLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 5,
  },
  runLiveText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.success,
  },
  runCardRight: {
    alignItems: 'flex-end',
  },
  runJoinButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  runJoinButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runLeaveButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    alignItems: 'center',
  },
  runLeaveButtonText: {
    color: colors.primary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runJoinedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  runGoingBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    alignItems: 'center',
  },
  runGoingBadgeText: {
    color: '#34C759',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runStartedBy: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ─── Start a Run modal ───────────────────────────────────────────────────
  runModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  runModalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.lg * 1.5,
    borderTopRightRadius: RADIUS.lg * 1.5,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    maxHeight: '85%',
  },
  runModalTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginBottom: SPACING.xs,
  },
  runModalSubtitle: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginBottom: SPACING.lg,
  },
  runDayPickerRow: {
    marginBottom: SPACING.md,
    marginHorizontal: -SPACING.xs,
  },
  runDayPickerContent: {
    paddingHorizontal: SPACING.xs,
    gap: SPACING.sm,
  },
  runDayChip: {
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    minWidth: 78,
    borderWidth: 1,
    borderColor: colors.border,
  },
  runDayChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  runDayChipLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
  },
  runDayChipLabelSelected: {
    color: '#fff',
  },
  runDayChipDate: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  runDayChipDateSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  runSelectDayPrompt: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  runSelectDayText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
  },
  runSlotsScroll: {
    maxHeight: 180,
  },
  runSlotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  runSlotCard: {
    width: '48%',
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  runSlotCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '15',
  },
  runSlotText: {
    fontSize: FONT_SIZES.small,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  runSlotTextSelected: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  runModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  runModalCancelButton: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  runModalCancelText: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runModalConfirmButton: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  runModalConfirmText: {
    fontSize: FONT_SIZES.body,
    color: '#fff',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runModalButtonDisabled: {
    opacity: 0.45,
  },

  // ── Error banner ──────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B45309',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  errorBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.small,
    color: '#fff',
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── Smart proximity prompt card ───────────────────────────────────────────
  proximityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: isDark ? '#1C1108' : '#FFF7ED',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,122,69,0.30)' : 'rgba(255,122,69,0.35)',
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  proximityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255,122,69,0.15)' : 'rgba(255,122,69,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  proximityContent: {
    flex: 1,
  },
  proximityTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  proximitySubtitle: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  proximityButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  proximityCheckInBtn: {
    backgroundColor: '#FF7A45',
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    minWidth: 90,
    alignItems: 'center',
  },
  proximityCheckInText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  proximityDismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
  },
  proximityDismissText: {
    color: colors.textMuted,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
