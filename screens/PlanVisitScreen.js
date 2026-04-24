/**
 * PlanVisitScreen.js — Multi-Step Gym Visit Scheduler
 *
 * A three-step wizard that lets users plan a future gym visit so other
 * players know they're coming. The current step is tracked with a simple
 * `step` integer state rather than nested navigators, keeping the flow
 * contained in a single screen component.
 *
 * Step 1 — Planned Visits:
 *   Shows all upcoming scheduled visits with a cancel option. If none
 *   exist, an empty state prompts the user to schedule one.
 *
 * Step 2 — Select Gym:
 *   Displays a selectable list of gyms. The selected gym gets a primary-
 *   colored border and checkmark icon.
 *
 * Step 3 — Select Time:
 *   A horizontal day picker (today + next 6 days) followed by a grid of
 *   30-minute time slots from 6 AM to 10 PM. Past time slots are filtered
 *   out when "Today" is selected.
 *
 * Helper functions:
 *   - `getAvailableDays` — builds the 7-day array with display labels
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useSchedules, useGyms, useProfile, useLivePresenceMap, useLocation } from '../hooks';
import { useMyRunChats } from '../hooks/useMyRunChats';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import { ReliabilityIntroModal } from '../components';
import { calculateDistanceMeters } from '../utils/locationUtils';
import { subscribeToAllUpcomingRuns, startOrJoinRun, joinExistingRun, leaveRun } from '../services/runService';
import { auth, db } from '../config/firebase';
import { addDoc, updateDoc, collection, serverTimestamp, Timestamp, query, where, limit, getDocs, deleteDoc, doc } from 'firebase/firestore';

/**
 * getAvailableDays — Builds a 7-day date array starting from today.
 *
 * Each entry contains:
 *   - `label`   — "Today", "Tomorrow", or the short weekday name (e.g. "Mon")
 *   - `dateStr` — Short date string for the second line of the chip (e.g. "Jan 15")
 *   - `dateObj` — JavaScript Date object for building time slots
 *   - `key`     — Unique string key for React list rendering
 *
 * @returns {{ label: string, dateStr: string, dateObj: Date, key: string }[]}
 */
const getAvailableDays = () => {
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



// ── Plan Visit gym filter options ─────────────────────────────────────────────
const PLAN_TYPE_FILTERS = [
  { key: null,       label: 'All' },
  { key: 'indoor',  label: 'Indoor' },
  { key: 'outdoor', label: 'Outdoor' },
];
const PLAN_ACCESS_FILTERS = [
  { key: null,         label: 'All' },
  { key: 'free',       label: 'Free' },
  { key: 'membership', label: 'Membership' },
];

/**
 * GymThumbnail — Small rounded gym image, falling back to an icon.
 * Matches the same pattern used in ProfileScreen and CheckInScreen.
 */
function GymThumbnail({ gym, fallbackIcon, iconColor, style }) {
  const source = GYM_LOCAL_IMAGES[gym?.id]
    ? GYM_LOCAL_IMAGES[gym.id]
    : gym?.imageUrl
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

  return (
    <View style={[{ width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Ionicons name={fallbackIcon} size={18} color={iconColor} />
    </View>
  );
}

/**
 * PlanVisitScreen — Three-step gym scheduling wizard.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop for hiding the header.
 * @returns {JSX.Element}
 */
export default function PlanVisitScreen({ navigation }) {
  const [selectedGym, setSelectedGym] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [startingRun, setStartingRun] = useState(false);
  // Loading guard for "Join Run" on run cards in the "Runs Being Planned" section.
  // Kept separate from startingRun so Step 4 / Step 1 card CTAs stay independent.
  const [joiningRun, setJoiningRun] = useState(false);
  const [step, setStep] = useState(1);
  // How many OTHER users have scheduled the same gym/slot as the one just created.
  // V1: exact timeSlot key match. Future: ±60-min clustering across nearby slots.
  const [coPlannersCount, setCoPlannersCount] = useState(0);

  // ── Step 2 gym filter state ───────────────────────────────────────────────
  const [gymSearch, setGymSearch] = useState('');
  const [gymTypeFilter, setGymTypeFilter] = useState(null);
  const [gymAccessFilter, setGymAccessFilter] = useState(null);
  const [gymCityFilter, setGymCityFilter] = useState(null);
  const [sortByNearestPlan, setSortByNearestPlan] = useState(false);
  const [gymFilterSheetVisible, setGymFilterSheetVisible] = useState(false);

  // ── Runs Being Planned filters ─────────────────────────────────────────────
  const [runFilterSheetVisible, setRunFilterSheetVisible] = useState(false);
  // Distance cap in miles. null = no cap (any distance).
  // Default to null so users without location permission see runs immediately.
  // Auto-applies 25 mi once location is granted for the first time.
  const [runDistanceFilter, setRunDistanceFilter] = useState(null);
  const didAutoApplyDistance = React.useRef(false);
  useEffect(() => {
    if (userLocation && !didAutoApplyDistance.current && runDistanceFilter === null) {
      didAutoApplyDistance.current = true;
      setRunDistanceFilter(25);
    }
  }, [userLocation]);
  // Level filter. null = show all levels.
  const [runLevelFilter, setRunLevelFilter] = useState(null);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Reliability intro modal — shown once before first scheduled visit
  const [reliabilityModalVisible, setReliabilityModalVisible] = useState(false);
  const pendingActionRef = useRef(null);

  // User profile provides name + avatar for activity feed writes
  const { profile } = useProfile();

  // Hide the default navigation header — this screen uses its own title layout
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const availableDays = getAvailableDays();

  const {
    schedules: rawSchedules,
    loading: schedulesLoading,
    createSchedule,
    cancelSchedule,
    creating,
    formatScheduleTime,
  } = useSchedules();

  const { gyms, loading: gymsLoading } = useGyms();
  const { countMap } = useLivePresenceMap();
  const { location: userLocation, getCurrentLocation } = useLocation();

  // ─── SCREENSHOT MODE ────────────────────────────────────────────────────────
  // Flip to true before screenshots, back to false before shipping.
  const SCREENSHOT_MODE = false;

  const now = new Date();
  const d = (hours) => new Date(now.getTime() + hours * 3600000);

  const MOCK_SCHEDULES = [
    {
      id: 'msv1',
      gymId: 'austin-sports-center-central',
      gymName: 'Austin Sports Center - Central',
      scheduledTime: { toDate: () => d(1.5), toMillis: () => d(1.5).getTime() },
      timeSlot: new Date(d(1.5).setMinutes(0, 0, 0)).toISOString(),
      status: 'scheduled',
    },
    {
      id: 'msv2',
      gymId: 'gregory-gymnasium-austin',
      gymName: 'Gregory Gymnasium',
      scheduledTime: { toDate: () => d(8), toMillis: () => d(8).getTime() },
      timeSlot: new Date(d(8).setMinutes(0, 0, 0)).toISOString(),
      status: 'scheduled',
    },
    {
      id: 'msv3',
      gymId: 'hutto-family-ymca',
      gymName: 'Hutto Family YMCA',
      scheduledTime: { toDate: () => d(4), toMillis: () => d(4).getTime() },
      timeSlot: new Date(d(4).setMinutes(0, 0, 0)).toISOString(),
      status: 'scheduled',
    },
  ];

  const MOCK_COMMUNITY_RUNS = [
    {
      id: 'mcr5',
      gymId: 'gregory-gymnasium-austin',
      gymName: 'Gregory Gymnasium',
      startTime: { toDate: () => d(8) },
      participantCount: 14,
      runLevel: 'competitive',
      createdBy: 'mock22',
      creatorName: 'TopLock',
    },
    {
      id: 'mcr1',
      gymId: 'austin-sports-center-central',
      gymName: 'Austin Sports Center - Central',
      startTime: { toDate: () => d(1.5) },
      participantCount: 9,
      runLevel: 'competitive',
      createdBy: 'mock1',
      creatorName: 'JordanH',
    },
    {
      id: 'mcr3',
      gymId: 'hutto-family-ymca',
      gymName: 'Hutto Family YMCA',
      startTime: { toDate: () => d(4) },
      participantCount: 11,
      runLevel: 'mixed',
      createdBy: 'mock28',
      creatorName: 'PickNRoll',
    },
    {
      id: 'mcr2',
      gymId: 'clay-madsen-round-rock',
      gymName: 'Clay Madsen Recreation Center',
      startTime: { toDate: () => d(26) },
      participantCount: 6,
      runLevel: 'casual',
      createdBy: 'mock16',
      creatorName: 'RockHoops',
    },
    {
      id: 'mcr4',
      gymId: 'ut-rec-sports-center-austin',
      gymName: 'UT Rec Sports Center',
      startTime: { toDate: () => d(51) },
      participantCount: 4,
      runLevel: 'casual',
      createdBy: 'mock10',
      creatorName: 'LongHorn1',
    },
  ];

  const schedules = SCREENSHOT_MODE ? MOCK_SCHEDULES : rawSchedules;
  // ────────────────────────────────────────────────────────────────────────────

  // ── Step 2 filter helpers ─────────────────────────────────────────────────
  const sanitizeGymSearch = (raw) =>
    raw
      .replace(/[^a-zA-Z0-9 '.\-&]/g, '')
      .replace(/^ +/, '')
      .replace(/ {2,}/g, ' ')
      .slice(0, 50);

  // Cities derived dynamically from loaded gyms so it auto-expands as gyms are added.
  const availableGymCities = useMemo(() => {
    const seen = new Set();
    const cities = [];
    gyms.forEach((g) => {
      if (g.city && !seen.has(g.city)) { seen.add(g.city); cities.push(g.city); }
    });
    return cities.sort();
  }, [gyms]);

  // Requests GPS before enabling nearest sort (same pattern as ViewRunsScreen).
  const handleNearestPlanToggle = async () => {
    if (!sortByNearestPlan && !userLocation) {
      try { await getCurrentLocation(); } catch (_) {}
    }
    setSortByNearestPlan((prev) => !prev);
  };

  // Filtered + sorted gym list for Step 2 gym selection.
  const filteredGymsForPlan = useMemo(() => {
    const q = gymSearch.trim().toLowerCase();
    let result = gyms;
    if (q) {
      result = result.filter((gym) => {
        const name    = gym.name?.toLowerCase()    ?? '';
        const address = gym.address?.toLowerCase() ?? '';
        const city    = gym.city?.toLowerCase()    ?? '';
        return name.includes(q) || address.includes(q) || city.includes(q);
      });
    }
    if (gymTypeFilter === 'indoor')       result = result.filter((g) => g.type !== 'outdoor');
    else if (gymTypeFilter === 'outdoor') result = result.filter((g) => g.type === 'outdoor');
    if (gymAccessFilter === 'free')            result = result.filter((g) => g.accessType === 'free');
    else if (gymAccessFilter === 'membership') result = result.filter((g) => g.accessType !== 'free');
    if (gymCityFilter) result = result.filter((g) => g.city === gymCityFilter);
    if (sortByNearestPlan && userLocation) {
      result = [...result].sort((a, b) => {
        const aDist = a.location ? calculateDistanceMeters(userLocation, a.location) : Infinity;
        const bDist = b.location ? calculateDistanceMeters(userLocation, b.location) : Infinity;
        return aDist - bDist;
      });
    }
    return result;
  }, [gyms, gymSearch, gymTypeFilter, gymAccessFilter, gymCityFilter, sortByNearestPlan, userLocation]);

  const gymActiveFilterCount =
    (gymTypeFilter ? 1 : 0) + (gymAccessFilter ? 1 : 0) + (gymCityFilter ? 1 : 0) + (sortByNearestPlan ? 1 : 0);

  // ── Runs the user has joined — used to show/hide chat button ────────────
  const { runChats } = useMyRunChats();
  const joinedRunIds = useMemo(() => new Set(runChats.map((c) => c.runId)), [runChats]);

  // ── Community runs — all upcoming runs across all gyms ──────────────────
  const [communityRuns, setCommunityRuns] = useState([]);

  useEffect(() => {
    if (SCREENSHOT_MODE) {
      setCommunityRuns(MOCK_COMMUNITY_RUNS);
      return;
    }
    const unsubscribe = subscribeToAllUpcomingRuns((runs) => {
      setCommunityRuns(runs);
    });
    return unsubscribe;
  }, []);

  // ── Derived sets for relevance ranking ───────────────────────────────────
  const METERS_PER_MILE = 1609.34;
  const friendIdSet = useMemo(() => new Set(profile?.friends ?? []), [profile]);
  const followedGymIdSet = useMemo(() => new Set(profile?.followedGyms ?? []), [profile]);

  // ── Filtered + relevance-sorted community runs ───────────────────────────
  // Priority order: matching visit → friend's run → followed/home gym → nearest
  const filteredAndSortedRuns = useMemo(() => {
    let runs = communityRuns;

    // 1. Distance cap — skip if no location or filter is "Any"
    if (runDistanceFilter !== null && userLocation) {
      runs = runs.filter((run) => {
        const gym = gyms.find((g) => g.id === run.gymId);
        if (!gym?.location) return true; // no coords — include to be safe
        return calculateDistanceMeters(userLocation, gym.location) / METERS_PER_MILE <= runDistanceFilter;
      });
    }

    // 2. Level filter
    if (runLevelFilter) {
      runs = runs.filter((run) => (run.runLevel ?? 'mixed') === runLevelFilter);
    }

    // 3. Relevance sort — higher score floats to the top
    return [...runs].sort((a, b) => {
      const score = (run) => {
        let s = 0;
        // Matching scheduled visit for this run — most relevant
        const hasVisit = schedules.some((sch) => {
          if (sch.gymId !== run.gymId) return false;
          const st = sch.scheduledTime?.toDate?.();
          const rt = run.startTime?.toDate?.();
          if (!st || !rt) return false;
          return Math.abs(st.getTime() - rt.getTime()) <= 60 * 60 * 1000;
        });
        if (hasVisit) s += 100;
        // Friend started this run
        if (run.createdBy && friendIdSet.has(run.createdBy)) s += 50;
        // Gym is followed or is home court
        if (followedGymIdSet.has(run.gymId) || run.gymId === profile?.homeCourtId) s += 25;
        // Proximity bonus — closer gyms score slightly higher (max ~10 pts)
        if (userLocation) {
          const gym = gyms.find((g) => g.id === run.gymId);
          if (gym?.location) {
            const miles = calculateDistanceMeters(userLocation, gym.location) / METERS_PER_MILE;
            s += Math.max(0, 10 - miles / 3);
          }
        }
        return s;
      };
      return score(b) - score(a);
    });
  }, [
    communityRuns, runDistanceFilter, runLevelFilter,
    userLocation, gyms, schedules,
    friendIdSet, followedGymIdSet, profile,
  ]);

  /**
   * formatRunTime — Formats a run's Firestore Timestamp for display.
   * Context-aware: "Today 6:30 PM", "Tomorrow 9:00 AM", "Mon, Jan 13 7:00 PM".
   */
  const formatRunTime = (startTime) => {
    const date = startTime?.toDate();
    if (!date) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today ${time}`;
    if (isTomorrow) return `Tomorrow ${time}`;
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${time}`;
  };

  const loading = schedulesLoading || gymsLoading;

  /**
   * withReliabilityGate — Shows the one-time reliability intro modal before
   * the first schedule action. If already seen, runs the action immediately.
   */
  const withReliabilityGate = (action) => {
    if (profile?.hasSeenReliabilityWarning) {
      action();
    } else {
      pendingActionRef.current = action;
      setReliabilityModalVisible(true);
    }
  };

  /**
   * handleCreateSchedule — Writes the new schedule to Firestore and resets wizard.
   *
   * Calls `createSchedule` with the selected gym's ID, name, and the chosen
   * time slot's Date object. On success, shows a confirmation alert and
   * resets all selection state before returning to Step 1.
   *
   * Note: planning a visit earns 0 points. Points are awarded at check-in
   * time — 15 pts if the check-in fulfils this plan, 10 pts otherwise.
   */
  const handleCreateSchedule = async () => {
    if (!selectedGym || !selectedSlot) return;
    try {
      // createSchedule returns { id, ...scheduleData } — capture it so we can
      // store the activity doc ID back on the schedule for precise cleanup later.
      const newSchedule = await createSchedule(selectedGym.id, selectedGym.name, selectedSlot.date);

      // Await the addDoc so we get the DocumentReference and can read its ID.
      const uid = auth.currentUser?.uid;
      try {
        const activityRef = await addDoc(collection(db, 'activity'), {
          userId: uid,
          userName: profile?.name || 'Anonymous',
          userAvatar: profile?.photoURL || null,
          action: 'planned a visit to',
          gymId: selectedGym.id,
          gymName: selectedGym.name,
          createdAt: Timestamp.now(),
          // plannedTime lets the HomeScreen filter out plans whose time has passed.
          // Without this field, a plan for tomorrow could show in today's feed.
          plannedTime: Timestamp.fromDate(new Date(selectedSlot.date)),
        });

        // Backlink: store the activity doc ID on the schedule document so that
        // handleCancelSchedule can target the exact activity record to delete.
        if (newSchedule?.id) {
          updateDoc(doc(db, 'schedules', newSchedule.id), {
            activityId: activityRef.id,
          }).catch((err) => { if (__DEV__) console.error('activityId backlink error:', err); });
        }
      } catch (err) {
        // Activity write failure is non-fatal — the schedule itself succeeded.
        if (__DEV__) console.error('Activity write error (plan):', err);
      }

      // Compute how many OTHER users are planning the same gym/slot, using the
      // gyms list already in memory (useGyms real-time subscription).
      // scheduleCounts includes the current user so subtract 1.
      // V1: exact timeSlot key match; future: ±60-min clustering.
      const planGym = gyms.find((g) => g.id === selectedGym.id);
      const rawCount = planGym?.scheduleCounts?.[newSchedule.timeSlot] ?? 0;
      setCoPlannersCount(Math.max(0, rawCount - 1));

      // Show the confirmation screen instead of a native alert.
      // Selections are NOT cleared here — Step 4 needs them for display.
      // They are reset when the user taps "Done" on the confirmation screen.
      setStep(4);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  /**
   * handleCancelSchedule — Prompts the user then cancels a scheduled visit.
   *
   * Uses a destructive-style Alert to prevent accidental cancellations.
   * Calls `cancelSchedule` with the schedule's Firestore document ID.
   *
   * @param {object} schedule — Schedule document from Firestore with `id` and `gymName`.
   */
  /**
   * cancelVisitOnly — shared helper that cancels the schedule doc and
   * removes the corresponding activity feed entry. Called by both cancel
   * paths inside handleCancelSchedule.
   */
  const cancelVisitOnly = async (schedule) => {
    await cancelSchedule(schedule.id);
    const uid = auth.currentUser?.uid;
    if (uid) {
      if (schedule.activityId) {
        deleteDoc(doc(db, 'activity', schedule.activityId))
          .catch((err) => { if (__DEV__) console.error('Activity cleanup error (cancel plan):', err); });
      } else {
        getDocs(
          query(
            collection(db, 'activity'),
            where('userId', '==', uid),
            where('gymId',  '==', schedule.gymId),
            where('action', '==', 'planned a visit to'),
            limit(1)
          )
        )
          .then((snap) =>
            Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'activity', d.id))))
          )
          .catch((err) => { if (__DEV__) console.error('Activity cleanup error (cancel plan):', err); });
      }
    }
  };

  /**
   * handleCancelSchedule — Prompts the user then cancels a scheduled visit.
   *
   * If the user has already joined a matching run for this visit, they are
   * offered the choice to leave that run at the same time. Cancelling a visit
   * without leaving the run leaves them confirmed for a game they no longer
   * plan to attend, which is a reliability/trust issue.
   *
   * @param {object} schedule    — Schedule document from Firestore.
   * @param {object|null} matchingRun — The run matching this visit slot, if any.
   * @param {boolean} isInRun   — Whether the user has joined that run.
   */
  const handleCancelSchedule = async (schedule, matchingRun, isInRun) => {
    if (matchingRun && isInRun) {
      // User is in the run — give them a choice.
      Alert.alert(
        'Cancel Visit',
        `You're also in the run at ${schedule.gymName}. Do you want to leave the run too?`,
        [
          { text: 'Keep Everything', style: 'cancel' },
          {
            text: 'Cancel Visit Only',
            onPress: async () => {
              try {
                await cancelVisitOnly(schedule);
              } catch (error) {
                Alert.alert('Error', error.message);
              }
            },
          },
          {
            text: 'Cancel Visit & Leave Run',
            style: 'destructive',
            onPress: async () => {
              try {
                await Promise.all([
                  cancelVisitOnly(schedule),
                  leaveRun(matchingRun.id),
                ]);
              } catch (error) {
                Alert.alert('Error', error.message);
              }
            },
          },
        ]
      );
    } else {
      // No matching run — original single-confirm flow.
      Alert.alert(
        'Cancel Visit',
        `Cancel your planned visit to ${schedule.gymName}?`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Cancel Visit',
            style: 'destructive',
            onPress: async () => {
              try {
                await cancelVisitOnly(schedule);
              } catch (error) {
                Alert.alert('Error', error.message);
              }
            },
          },
        ]
      );
    }
  };

  if (loading) {
    return (
      <ImageBackground source={require('../assets/images/court-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
      </ImageBackground>
    );
  }

  // ─── Step 1: Planned Visits ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <ImageBackground source={require('../assets/images/court-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.headerGradient}>
            <View style={styles.titleRow}>
              <View>
                <Text style={styles.title}>Plan a Visit</Text>
                <Text style={styles.subtitle}>Schedule when you plan to play</Text>
              </View>
            </View>
          </View>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={styles.scrollBody}>

              {schedules.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Upcoming Visits</Text>
                  {schedules.map((schedule) => {
                    const scheduleGym = gyms.find((g) => g.id === schedule.gymId);
                    // How many OTHER users are planning this gym/slot.
                    // scheduleCounts includes the current user, so subtract 1.
                    // V1: exact timeSlot key match; future: ±60-min clustering.
                    const otherCount = Math.max(
                      0,
                      (scheduleGym?.scheduleCounts?.[schedule.timeSlot] ?? 1) - 1
                    );
                    // Is there already a run at this gym within ±60 min of this slot?
                    // Uses communityRuns already subscribed in memory — no extra reads.
                    const matchingRun = communityRuns.find((run) => {
                      if (run.gymId !== schedule.gymId) return false;
                      const runTime = run.startTime?.toDate?.();
                      const schedTime = schedule.scheduledTime?.toDate?.();
                      if (!runTime || !schedTime) return false;
                      return Math.abs(runTime.getTime() - schedTime.getTime()) <= 60 * 60 * 1000;
                    });
                    const hasExistingRun = !!matchingRun;
                    // True when the user has already joined the matching run for this visit.
                    // Used to show "In the Run" state instead of the momentum badge / Start Run.
                    const isInMatchingRun = matchingRun ? joinedRunIds.has(matchingRun.id) : false;
                    return (
                      <View key={schedule.id} style={styles.intentCard}>
                        <GymThumbnail
                          gym={scheduleGym || { id: schedule.gymId }}
                          fallbackIcon="calendar"
                          iconColor={colors.primary}
                          style={!scheduleGym?.imageUrl && !GYM_LOCAL_IMAGES[schedule.gymId] ? styles.intentThumbFallback : null}
                        />
                        <View style={styles.intentInfo}>
                          <Text style={styles.intentGym}>{schedule.gymName}</Text>
                          <Text style={styles.intentTime}>{formatScheduleTime(schedule)}</Text>
                          {scheduleGym && (
                            <Text style={styles.intentMeta}>
                              {scheduleGym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}
                            </Text>
                          )}
                          {isInMatchingRun ? (
                            // Already joined — green confirmation state.
                            <View style={styles.inRunBadge}>
                              <Ionicons name="checkmark-circle" size={11} color="#22C55E" style={{ marginRight: 3 }} />
                              <Text style={styles.inRunBadgeText}>You're in the run</Text>
                            </View>
                          ) : matchingRun ? (
                            // A run EXISTS for this visit slot — make the badge tappable
                            // so the user can jump straight to it. This is the key
                            // connection between "my visit" and "the actual run."
                            <TouchableOpacity
                              style={[styles.coPlannerBadge, styles.coPlannerBadgeHigh, styles.coPlannerBadgeTappable]}
                              activeOpacity={0.7}
                              onPress={() =>
                                navigation.getParent()?.navigate('Runs', {
                                  screen: 'RunDetails',
                                  params: { gymId: matchingRun.gymId, gymName: matchingRun.gymName, players: 0 },
                                })
                              }
                            >
                              <Ionicons name="basketball-outline" size={11} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.coPlannerBadgeText}>
                                A run is forming for your visit — tap to join
                              </Text>
                              <Ionicons name="chevron-forward" size={10} color={colors.primary} style={{ marginLeft: 2 }} />
                            </TouchableOpacity>
                          ) : otherCount >= 1 ? (
                            // No run yet — passive momentum signal.
                            <View style={[
                              styles.coPlannerBadge,
                              otherCount >= 3 && styles.coPlannerBadgeHigh,
                            ]}>
                              <Ionicons
                                name={otherCount >= 3 ? 'flame-outline' : 'people-outline'}
                                size={11}
                                color={colors.primary}
                                style={{ marginRight: 3 }}
                              />
                              <Text style={styles.coPlannerBadgeText}>
                                {otherCount >= 3
                                  ? `Run forming · ${otherCount + 1} players planning`
                                  : otherCount === 2
                                  ? `${otherCount + 1} players lining up for this time`
                                  : '1 other planning to play here'}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.cardActionColumn}>
                          {otherCount >= 2 && !hasExistingRun && !isInMatchingRun && (
                            <TouchableOpacity
                              style={styles.cardStartRunButton}
                              disabled={startingRun}
                              onPress={async () => {
                                const time = schedule.scheduledTime?.toDate?.();
                                if (!time) return;
                                const run = await startOrJoinRun(schedule.gymId, schedule.gymName, time);
                                if (run?.id) {
                                  navigation.navigate('RunDetails', { runId: run.id });
                                }
                              }}
                            >
                              <Text style={styles.cardStartRunText}>Start Run</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => handleCancelSchedule(schedule, matchingRun, isInMatchingRun)}
                          >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyStateCompact}>
                  <Ionicons name="calendar-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <Text style={styles.emptyStateCompactText}>No visits planned yet</Text>
                </View>
              )}

              {/* ── Runs Being Planned ─────────────────────────────────────── */}
              <View style={styles.section}>
                <View style={styles.runsSectionHeader}>
                  <Ionicons name="basketball-outline" size={15} color={colors.primary} style={{ marginRight: 5 }} />
                  <Text style={styles.sectionTitle}>Runs Being Planned By Others</Text>
                  {filteredAndSortedRuns.length > 0 && (
                    <View style={styles.runCountBadge}>
                      <Text style={styles.runCountBadgeText}>{filteredAndSortedRuns.length}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.runsFilterButton, (runDistanceFilter !== null || runLevelFilter !== null) && styles.runsFilterButtonActive]}
                    onPress={() => setRunFilterSheetVisible(true)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name="options-outline"
                      size={13}
                      color={(runDistanceFilter !== null || runLevelFilter !== null) ? '#fff' : 'rgba(255,255,255,0.7)'}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.runsFilterButtonText, (runDistanceFilter !== null || runLevelFilter !== null) && styles.runsFilterButtonTextActive]}>
                      Filter{(runDistanceFilter !== null ? 1 : 0) + (runLevelFilter !== null ? 1 : 0) > 0
                        ? ` · ${(runDistanceFilter !== null ? 1 : 0) + (runLevelFilter !== null ? 1 : 0)}`
                        : ''}
                    </Text>
                  </TouchableOpacity>
                </View>

                {filteredAndSortedRuns.length > 0 ? (
                  filteredAndSortedRuns.map((run) => {
                    const runGym = gyms.find((g) => g.id === run.gymId);
                    const isJoined = joinedRunIds.has(run.id);
                    // "Your Visit" badge: user has a schedule at this gym within
                    // ±60 min of this run. Using find (not some) so we can also
                    // derive the planner count via the schedule's timeSlot key.
                    const matchingVisitSchedule = schedules.find((schedule) => {
                      if (schedule.gymId !== run.gymId) return false;
                      const schedTime = schedule.scheduledTime?.toDate?.();
                      const runTime = run.startTime?.toDate?.();
                      if (!schedTime || !runTime) return false;
                      return Math.abs(schedTime.getTime() - runTime.getTime()) <= 60 * 60 * 1000;
                    });
                    const hasMatchingVisit = !!matchingVisitSchedule;
                    // Total planners at this gym/time slot — used to signal momentum
                    // on the run card for users who haven't joined yet.
                    const runPlannerCount = matchingVisitSchedule
                      ? (runGym?.scheduleCounts?.[matchingVisitSchedule.timeSlot] ?? 0)
                      : 0;
                    return (
                      <TouchableOpacity
                        key={run.id}
                        style={styles.runCard}
                        activeOpacity={0.7}
                        onPress={() =>
                          navigation.getParent()?.navigate('Runs', {
                            screen: 'RunDetails',
                            params: { gymId: run.gymId, gymName: run.gymName, players: 0 },
                          })
                        }
                      >
                        <GymThumbnail
                          gym={runGym || { id: run.gymId }}
                          fallbackIcon="basketball-outline"
                          iconColor={colors.primary}
                          style={!runGym?.imageUrl && !GYM_LOCAL_IMAGES[run.gymId] ? styles.runThumbFallback : null}
                        />
                        <View style={styles.runCardInfo}>
                          <Text style={styles.runCardGym} numberOfLines={1}>{run.gymName}</Text>
                          <Text style={styles.runCardTime}>{formatRunTime(run.startTime)}</Text>
                          {/* Run level badge — Casual (green), Balanced (slate), Competitive (red) */}
                          {(() => {
                            const level = run.runLevel ?? 'mixed';
                            const levelColor =
                              level === 'competitive' ? '#EF4444' :
                              level === 'casual'      ? '#22C55E' : '#94A3B8';
                            const levelLabel =
                              level === 'mixed' ? 'Balanced' :
                              level.charAt(0).toUpperCase() + level.slice(1);
                            return (
                              <View style={[styles.runLevelBadge, { backgroundColor: levelColor + '18', borderColor: levelColor + '44' }]}>
                                <Text style={[styles.runLevelBadgeText, { color: levelColor }]}>
                                  {levelLabel}
                                </Text>
                              </View>
                            );
                          })()}
                          <View style={styles.runCardMetaRow}>
                            {run.creatorName ? (
                              <Text style={styles.runCardMeta} numberOfLines={1}>
                                Started by {run.creatorName}
                              </Text>
                            ) : null}
                            <Text style={styles.runCardPlayers}>
                              {run.participantCount === 1
                                ? '1 player going'
                                : `${run.participantCount} players going`}
                              {runPlannerCount > run.participantCount
                                ? ` · ${runPlannerCount} planning`
                                : ''}
                            </Text>
                          </View>
                          {hasMatchingVisit && (
                            <View style={styles.yourVisitBadge}>
                              <Ionicons name="calendar-outline" size={11} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.yourVisitBadgeText}>Your Visit</Text>
                            </View>
                          )}
                        </View>
                        {isJoined && (
                          <TouchableOpacity
                            style={styles.runCardChatButton}
                            activeOpacity={0.7}
                            onPress={() =>
                              navigation.getParent()?.navigate('Runs', {
                                screen: 'RunChat',
                                params: {
                                  runId: run.id,
                                  gymId: run.gymId,
                                  gymName: run.gymName,
                                  startTime: run.startTime ?? null,
                                },
                              })
                            }
                          >
                            <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
                          </TouchableOpacity>
                        )}
                        {hasMatchingVisit && !isJoined ? (
                          // User has a scheduled visit for this gym/time but hasn't joined yet.
                          // Show "Join Run" as the primary CTA instead of the passive "View".
                          <TouchableOpacity
                            style={styles.viewRunButton}
                            disabled={joiningRun}
                            activeOpacity={0.7}
                            onPress={async () => {
                              setJoiningRun(true);
                              try {
                                await joinExistingRun(run.id, run.gymId, run.gymName);
                                navigation.getParent()?.navigate('Runs', {
                                  screen: 'RunDetails',
                                  params: { gymId: run.gymId, gymName: run.gymName, players: 0 },
                                });
                              } catch (e) {
                                // Fail gracefully — do not crash the UI.
                                // User can still tap the card to navigate to RunDetails.
                                if (__DEV__) console.warn('[PlanVisitScreen] joinExistingRun failed:', e?.message);
                              } finally {
                                setJoiningRun(false);
                              }
                            }}
                          >
                            <Text style={styles.viewRunButtonText}>Join Run</Text>
                            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.viewRunButton}>
                            <Text style={styles.viewRunButtonText}>View</Text>
                            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                ) : communityRuns.length > 0 ? (
                  // Runs exist but all filtered out — nudge user to adjust filters
                  <View style={styles.runsEmptyState}>
                    <Text style={styles.runsEmptyText}>No runs match your filters</Text>
                    <TouchableOpacity
                      onPress={() => { setRunDistanceFilter(null); setRunLevelFilter(null); }}
                    >
                      <Text style={styles.runsEmptyAction}>Clear filters</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.runsEmptyState}>
                    <Text style={styles.runsEmptyText}>No runs planned yet</Text>
                    <Text style={styles.runsEmptySubtext}>
                      Schedule a visit — when enough players plan the same time, a run can form
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={() => setStep(2)}>
                <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.primaryButtonText}>Schedule a Visit</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>

        {/* ── Runs Being Planned — Filter Sheet ──────────────────────────── */}
        <Modal
          visible={runFilterSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setRunFilterSheetVisible(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setRunFilterSheetVisible(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter Runs</Text>
              <TouchableOpacity onPress={() => setRunFilterSheetVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={isDark ? '#8E8E93' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            {/* ── Distance ── */}
            <Text style={styles.sheetSectionLabel}>Distance</Text>
            <View style={styles.sheetPillRow}>
              {[
                { label: '10 mi', value: 10 },
                { label: '25 mi', value: 25 },
                { label: '50 mi', value: 50 },
              ].map(({ label, value }) => {
                const active = runDistanceFilter === value;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.sheetPill, active && styles.sheetPillActive]}
                    onPress={() => {
                      if (!userLocation) getCurrentLocation().catch(() => {});
                      setRunDistanceFilter(active ? null : value);
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="location-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Run Level ── */}
            <Text style={styles.sheetSectionLabel}>Run Level</Text>
            <View style={styles.sheetPillRow}>
              {[
                { label: '😊 Casual',      value: 'casual',      color: '#22C55E' },
                { label: '🤝 Balanced',    value: 'mixed',       color: '#94A3B8' },
                { label: '🔥 Competitive', value: 'competitive', color: '#EF4444' },
              ].map(({ label, value, color }) => {
                const active = runLevelFilter === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.sheetPill, active && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setRunLevelFilter(active ? null : value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Clear All ── */}
            {(runDistanceFilter !== null || runLevelFilter !== null) && (
              <TouchableOpacity
                style={styles.sheetClearBtn}
                onPress={() => { setRunDistanceFilter(null); setRunLevelFilter(null); setRunFilterSheetVisible(false); }}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetClearBtnText}>Clear All Filters</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.sheetDoneButton}
              onPress={() => setRunFilterSheetVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Modal>

      </SafeAreaView>
      </ImageBackground>
    );
  }

  // ─── Step 2: Select Gym ────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <ImageBackground source={require('../assets/images/court-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <LinearGradient
            colors={['#3D1E00', '#1A0A00', colors.background]}
            locations={[0, 0.55, 1]}
            style={styles.headerGradient}
          >
            <View style={styles.titleRow}>
              <View>
                <Text style={styles.title}>Select a Gym</Text>
                <Text style={styles.subtitle}>Where do you plan to play?</Text>
              </View>
            </View>
          </LinearGradient>

          {/* ── Search bar + filter button ───────────────────────────────── */}
          <View style={styles.gymSearchRow}>
            <View style={styles.gymSearchBar}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.gymSearchInput}
                placeholder="Search gyms"
                placeholderTextColor={colors.textMuted}
                value={gymSearch}
                onChangeText={(t) => setGymSearch(sanitizeGymSearch(t))}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="words"
              />
              {gymSearch.length > 0 && (
                <TouchableOpacity onPress={() => setGymSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.gymFilterButton, gymActiveFilterCount > 0 && styles.gymFilterButtonActive]}
              onPress={() => setGymFilterSheetVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="options-outline" size={15} color={gymActiveFilterCount > 0 ? '#fff' : 'rgba(255,255,255,0.8)'} style={{ marginRight: 4 }} />
              <Text style={[styles.gymFilterButtonText, gymActiveFilterCount > 0 && styles.gymFilterButtonTextActive]}>
                Filter{gymActiveFilterCount > 0 ? ` (${gymActiveFilterCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Active filter chips ──────────────────────────────────────── */}
          {gymActiveFilterCount > 0 && (
            <View style={styles.gymActiveChipsRow}>
              {gymTypeFilter && (
                <TouchableOpacity style={styles.gymActiveChip} onPress={() => setGymTypeFilter(null)} activeOpacity={0.8}>
                  <Text style={styles.gymActiveChipText}>{gymTypeFilter === 'indoor' ? 'Indoor' : 'Outdoor'}</Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
              {gymAccessFilter && (
                <TouchableOpacity style={[styles.gymActiveChip, { backgroundColor: gymAccessFilter === 'free' ? '#22C55E' : '#F59E0B' }]} onPress={() => setGymAccessFilter(null)} activeOpacity={0.8}>
                  <Text style={styles.gymActiveChipText}>{gymAccessFilter === 'free' ? 'Free' : 'Membership'}</Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
              {gymCityFilter && (
                <TouchableOpacity style={[styles.gymActiveChip, { backgroundColor: '#6366F1' }]} onPress={() => setGymCityFilter(null)} activeOpacity={0.8}>
                  <Ionicons name="location" size={11} color="#fff" style={{ marginRight: 3 }} />
                  <Text style={styles.gymActiveChipText}>{gymCityFilter}</Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
              {sortByNearestPlan && (
                <TouchableOpacity style={[styles.gymActiveChip, { backgroundColor: '#0A84FF' }]} onPress={() => setSortByNearestPlan(false)} activeOpacity={0.8}>
                  <Ionicons name="navigate" size={11} color="#fff" style={{ marginRight: 3 }} />
                  <Text style={styles.gymActiveChipText}>Nearest</Text>
                  <Ionicons name="close" size={11} color="#fff" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView contentContainerStyle={styles.scrollBody}>

                {filteredGymsForPlan.length === 0 ? (
                  <View style={styles.gymFilterEmptyState}>
                    <Ionicons name="search-outline" size={28} color={colors.textMuted} style={{ marginBottom: 8 }} />
                    <Text style={styles.gymFilterEmptyText}>No gyms match your filters</Text>
                    <TouchableOpacity onPress={() => { setGymSearch(''); setGymTypeFilter(null); setGymAccessFilter(null); setGymCityFilter(null); setSortByNearestPlan(false); }}>
                      <Text style={styles.gymFilterClearText}>Clear all filters</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  filteredGymsForPlan.map((gym) => (
                    <TouchableOpacity
                      key={gym.id}
                      style={[
                        styles.gymCard,
                        selectedGym?.id === gym.id && styles.gymCardSelected,
                      ]}
                      onPress={() => setSelectedGym(gym)}
                    >
                      <View style={styles.gymCardLeft}>
                        <Ionicons
                          name={selectedGym?.id === gym.id ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={selectedGym?.id === gym.id ? colors.primary : colors.textMuted}
                        />
                      </View>
                      <View style={styles.gymCardInfo}>
                        <Text style={styles.gymCardName}>{gym.name}</Text>
                        <Text style={styles.gymCardAddress}>{gym.address}</Text>
                        <Text style={styles.gymCardType}>
                          {gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}{' '}
                          <Text style={styles.gymCardAccent}>OPEN RUN</Text>
                        </Text>
                      </View>
                      {(countMap[gym.id] ?? 0) > 0 && (
                        <View style={styles.presenceBadge}>
                          <Text style={styles.presenceBadgeText}>{countMap[gym.id]} here</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                )}

              </ScrollView>
            </TouchableWithoutFeedback>

            {/* Pinned footer — always visible regardless of list length */}
            <View style={styles.buttonRowPinned}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(1)}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, !selectedGym && styles.buttonDisabled]}
                onPress={() => selectedGym && setStep(3)}
                disabled={!selectedGym}
              >
                <Text style={styles.primaryButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* ── Filter bottom sheet modal ──────────────────────────────────── */}
        <Modal
          visible={gymFilterSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGymFilterSheetVisible(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setGymFilterSheetVisible(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter By</Text>
              <TouchableOpacity onPress={() => setGymFilterSheetVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={isDark ? '#8E8E93' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            {/* Court Type */}
            <Text style={styles.sheetSectionLabel}>Court Type</Text>
            <View style={styles.sheetPillRow}>
              {PLAN_TYPE_FILTERS.map((f) => {
                const active = gymTypeFilter === f.key;
                return (
                  <TouchableOpacity
                    key={String(f.key)}
                    style={[styles.sheetPill, active && styles.sheetPillActive]}
                    onPress={() => setGymTypeFilter(active ? null : f.key)}
                    activeOpacity={0.75}
                  >
                    {f.key === 'indoor'  && <Ionicons name="business-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === 'outdoor' && <Ionicons name="sunny-outline"    size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === null      && <Ionicons name="apps-outline"     size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Access */}
            <Text style={styles.sheetSectionLabel}>Access</Text>
            <View style={styles.sheetPillRow}>
              {PLAN_ACCESS_FILTERS.map((f) => {
                const active = gymAccessFilter === f.key;
                const accentColor = f.key === 'free' ? '#22C55E' : f.key === 'membership' ? '#F59E0B' : colors.primary;
                return (
                  <TouchableOpacity
                    key={String(f.key)}
                    style={[styles.sheetPill, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                    onPress={() => setGymAccessFilter(active ? null : f.key)}
                    activeOpacity={0.75}
                  >
                    {f.key === 'free'        && <Ionicons name="pricetag-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === 'membership'  && <Ionicons name="card-outline"     size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    {f.key === null          && <Ionicons name="apps-outline"     size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />}
                    <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* City */}
            {availableGymCities.length > 0 && (
              <>
                <Text style={styles.sheetSectionLabel}>City</Text>
                <View style={styles.sheetPillRow}>
                  {availableGymCities.map((city) => {
                    const active = gymCityFilter === city;
                    return (
                      <TouchableOpacity
                        key={city}
                        style={[styles.sheetPill, active && { backgroundColor: '#6366F1', borderColor: '#6366F1' }]}
                        onPress={() => setGymCityFilter(active ? null : city)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="location-outline" size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />
                        <Text style={[styles.sheetPillText, active && styles.sheetPillTextActive]}>{city}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Sort By — Nearest First */}
            <Text style={styles.sheetSectionLabel}>Sort By</Text>
            <TouchableOpacity
              style={[styles.sheetToggleRow, sortByNearestPlan && styles.sheetToggleRowActive]}
              onPress={handleNearestPlanToggle}
              activeOpacity={0.75}
            >
              <View style={styles.sheetToggleLeft}>
                <Ionicons name="navigate-outline" size={16} color={sortByNearestPlan ? '#0A84FF' : (isDark ? '#8E8E93' : '#6B7280')} style={{ marginRight: 10 }} />
                <View>
                  <Text style={[styles.sheetToggleTitle, sortByNearestPlan && { color: '#0A84FF' }]}>Nearest First</Text>
                  <Text style={styles.sheetToggleSub}>Sort all gyms by your location</Text>
                </View>
              </View>
              <View style={[styles.sheetToggleSwitch, sortByNearestPlan && styles.sheetToggleSwitchOn]}>
                <View style={[styles.sheetToggleThumb, sortByNearestPlan && styles.sheetToggleThumbOn]} />
              </View>
            </TouchableOpacity>

            {/* Clear All — only shown when any filter is active */}
            {gymActiveFilterCount > 0 && (
              <TouchableOpacity
                style={styles.sheetClearBtn}
                onPress={() => { setGymTypeFilter(null); setGymAccessFilter(null); setGymCityFilter(null); setSortByNearestPlan(false); setGymFilterSheetVisible(false); }}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetClearBtnText}>Clear All Filters</Text>
              </TouchableOpacity>
            )}

            {/* Done button */}
            <TouchableOpacity
              style={styles.sheetDoneButton}
              onPress={() => setGymFilterSheetVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Modal>

      </SafeAreaView>
      </ImageBackground>
    );
  }

  // ─── Step 4: Visit Scheduled — Confirmation + Start a Run prompt ────────────
  if (step === 4) {
    /** Build the day label for display */
    const dayLabel = selectedDay?.label === 'Today'
      ? 'Today'
      : selectedDay?.label === 'Tomorrow'
      ? 'Tomorrow'
      : `${selectedDay?.label}, ${selectedDay?.dateStr}`;

    // Check if a run at this gym already exists within ±60 min of the chosen
    // slot — using the communityRuns subscription already in memory.
    const existingRun = communityRuns.find((run) => {
      if (run.gymId !== selectedGym?.id) return false;
      const runTime = run.startTime?.toDate?.();
      if (!runTime || !selectedSlot?.date) return false;
      return Math.abs(runTime.getTime() - selectedSlot.date.getTime()) <= 60 * 60 * 1000;
    });

    // ── Signal row — compact factual indicator (icon + text below the time) ──
    // High-momentum threshold: 3+ co-planners (4+ total including current user).
    const signalIcon = existingRun
      ? 'basketball-outline'
      : coPlannersCount >= 3
      ? 'flame-outline'
      : coPlannersCount >= 1
      ? 'people-outline'
      : 'calendar-outline';

    const signalIconColor = (existingRun || coPlannersCount >= 1)
      ? colors.primary
      : colors.textMuted;

    const signalText = existingRun
      ? 'Run already forming'
      : coPlannersCount >= 3
      ? `Run forming · ${coPlannersCount + 1} players planning`
      : coPlannersCount === 2
      ? `${coPlannersCount + 1} players lining up for this time`
      : coPlannersCount === 1
      ? '1 other player planning to play here'
      : "You're the first one so far";

    const signalTextColor = (existingRun || coPlannersCount >= 1)
      ? 'rgba(255,255,255,0.90)'
      : colors.textMuted;

    // ── Prompt section — motivating CTA copy ──────────────────────────────────
    const promptTitle = existingRun
      ? 'A run is already in motion'
      : coPlannersCount >= 3
      ? 'This time slot has momentum'
      : coPlannersCount === 2
      ? 'The court is filling up'
      : coPlannersCount === 1
      ? 'Someone else is planning to play'
      : 'Want others to run with you?';

    const promptDesc = existingRun
      ? "Hop in and let the crew know you're coming."
      : coPlannersCount >= 3
      ? 'Start the run so everyone can lock in.'
      : coPlannersCount === 2
      ? 'Start a run and make the session official.'
      : coPlannersCount === 1
      ? 'Start a run so you can both lock in and coordinate.'
      : 'Starting a run lets anyone planning this time find it and join in.';

    const runButtonLabel = existingRun ? 'Join the Run' : 'Start a Run';

    return (
      <ImageBackground source={require('../assets/images/court-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe}>
        <LinearGradient
          colors={['#3D1E00', '#1A0A00', colors.background]}
          locations={[0, 0.55, 1]}
          style={styles.headerGradient}
        >
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>Visit Scheduled</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.confirmationBody}>
          {/* Success icon */}
          <View style={styles.confirmationIconWrap}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          </View>

          {/* Gym + time summary */}
          <Text style={styles.confirmationGym}>{selectedGym?.name}</Text>
          <Text style={styles.confirmationTime}>
            {dayLabel} {'\u00B7'} {selectedSlot?.label}
          </Text>

          {/* Contextual signal row — compact indicator of who else is planning */}
          <View style={styles.confirmationSignalRow}>
            <Ionicons name={signalIcon} size={13} color={signalIconColor} style={{ marginRight: 5 }} />
            <Text style={[styles.confirmationSignalText, { color: signalTextColor }]}>
              {signalText}
            </Text>
          </View>

          {/* Run prompt — motivating CTA; copy updates based on co-planners/run state */}
          <View style={styles.confirmationPrompt}>
            <Text style={styles.confirmationPromptTitle}>{promptTitle}</Text>
            <Text style={styles.confirmationPromptDesc}>{promptDesc}</Text>
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.confirmationPrimaryButton, startingRun && styles.buttonDisabled]}
            activeOpacity={0.7}
            disabled={startingRun}
            onPress={async () => {
              if (!selectedGym || !selectedSlot) return;
              setStartingRun(true);
              try {
                // startOrJoinRun handles the merge rule — if a run already exists
                // within ±60 min at this gym, the user joins it instead of
                // creating a new one. Same logic whether label says "Start" or "Join".
                await startOrJoinRun(
                  selectedGym.id,
                  selectedGym.name,
                  selectedSlot.date
                );

                // Navigate to RunDetailsScreen so the user sees their run
                navigation.getParent()?.navigate('Runs', {
                  screen: 'RunDetails',
                  params: {
                    gymId: selectedGym.id,
                    gymName: selectedGym.name,
                    players: 0,
                  },
                });

                // Reset wizard state so it's clean when the user returns
                setSelectedGym(null);
                setSelectedSlot(null);
                setSelectedDay(null);
                setStep(1);
              } catch (err) {
                Alert.alert('Error', err.message || 'Could not start run. Please try again.');
              } finally {
                setStartingRun(false);
              }
            }}
          >
            {startingRun ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="basketball-outline" size={18} color="#FFFFFF" style={{ marginRight: SPACING.xs }} />
                <Text style={styles.confirmationPrimaryText}>{runButtonLabel}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Helper line — only shown for Start a Run, not Join the Run */}
          {!existingRun && (
            <Text style={styles.confirmationRunHint}>
              {coPlannersCount >= 3
                ? 'Enough players are lining up — start it so everyone can lock in.'
                : 'Anyone planning this time can start the run'}
            </Text>
          )}

          <TouchableOpacity
            style={styles.confirmationSecondaryButton}
            activeOpacity={0.7}
            onPress={() => {
              setSelectedGym(null);
              setSelectedSlot(null);
              setSelectedDay(null);
              setStep(1);
            }}
          >
            <Text style={styles.confirmationSecondaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </ImageBackground>
    );
  }

  // ─── Step 3: Select Time ────────────────────────────────────────────────────

  /**
   * buildSlotFromDate — Combines the selected day with a given time and returns
   * a selectedSlot object ({ date, label, timeSlot }). Returns null if the
   * resulting time is in the past (today only).
   */
  const buildSlotFromDate = (timeDate) => {
    if (!selectedDay || !timeDate) return null;
    const combined = new Date(selectedDay.dateObj);
    combined.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);

    // Prevent past times when the day is today
    if (combined <= new Date()) return null;

    const displayHour = combined.getHours() > 12 ? combined.getHours() - 12 : combined.getHours() === 0 ? 12 : combined.getHours();
    const displayMin = combined.getMinutes() === 0 ? '00' : String(combined.getMinutes()).padStart(2, '0');
    const ampm = combined.getHours() >= 12 ? 'PM' : 'AM';
    const label = `${displayHour}:${displayMin} ${ampm}`;

    return { date: combined, label, timeSlot: combined.toISOString() };
  };

  /**
   * handleTimeChange — Called when the native time picker value changes.
   * Delegates to buildSlotFromDate so the slot shape stays consistent.
   */
  const handleTimeChange = (event, pickedDate) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type === 'dismissed' || !pickedDate) return;

    const slot = buildSlotFromDate(pickedDate);
    if (!slot) {
      Alert.alert('Invalid Time', 'Please select a future time.');
      return;
    }
    setSelectedSlot(slot);
  };

  /** Default picker date: selected time if already set, or next round hour on selected day */
  const pickerDefault = (() => {
    if (selectedSlot?.date) return selectedSlot.date;
    if (!selectedDay) return new Date();
    const d = new Date(selectedDay.dateObj);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      // Next full hour from now
      d.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0); // default 9 AM for future days
    }
    return d;
  })();

  return (
    <ImageBackground source={require('../assets/images/court-bg.jpg')} style={styles.bgImage} resizeMode="cover" blurRadius={3}>
      <View style={styles.overlay} />
      <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <LinearGradient
        colors={['#3D1E00', '#1A0A00', colors.background]}
        locations={[0, 0.55, 1]}
        style={styles.headerGradient}
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Select a Time</Text>
            <Text style={styles.subtitle}>When are you arriving at {selectedGym?.name}?</Text>
          </View>
        </View>
      </LinearGradient>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>

        {/* Day Picker — horizontal scroll of 7 day chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayPickerContent}
          style={styles.dayPickerRow}
        >
          {availableDays.map((day) => (
            <TouchableOpacity
              key={day.key}
              style={[styles.dayChip, selectedDay?.key === day.key && styles.dayChipSelected]}
              onPress={() => { setSelectedDay(day); setSelectedSlot(null); setShowTimePicker(false); }}
            >
              <Text style={[styles.dayChipLabel, selectedDay?.key === day.key && styles.dayChipLabelSelected]}>
                {day.label}
              </Text>
              <Text style={[styles.dayChipDate, selectedDay?.key === day.key && styles.dayChipDateSelected]}>
                {day.dateStr}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Time Selection — native picker */}
        {!selectedDay ? (
          <View style={styles.selectDayPrompt}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.selectDayText}>Select a day above to choose a time</Text>
          </View>
        ) : (
          <View style={styles.timePickerSection}>
            <Text style={styles.timePickerLabel}>Arrival Time</Text>

            <TouchableOpacity
              style={[styles.timePickerButton, selectedSlot ? styles.timePickerButtonSelected : styles.timePickerButtonEmpty]}
              onPress={() => {
                const opening = !showTimePicker;
                setShowTimePicker(opening);
                // Auto-select the default time when opening the picker so
                // Confirm is enabled immediately without requiring a scroll.
                if (opening && !selectedSlot) {
                  const slot = buildSlotFromDate(pickerDefault);
                  if (slot) setSelectedSlot(slot);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.timePickerIconWrap, selectedSlot && styles.timePickerIconWrapSelected]}>
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={selectedSlot ? colors.primary : colors.textMuted}
                />
              </View>
              <View style={styles.timePickerTextWrap}>
                {selectedSlot ? (
                  <Text style={styles.timePickerSelectedTime}>{selectedSlot.label}</Text>
                ) : (
                  <>
                    <Text style={styles.timePickerPlaceholder}>Tap to choose a time</Text>
                    <Text style={styles.timePickerHint}>Opens the time picker</Text>
                  </>
                )}
              </View>
              <Ionicons
                name={showTimePicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={selectedSlot ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Native picker — inline on iOS, modal on Android */}
            {showTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={pickerDefault}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleTimeChange}
                  minuteInterval={15}
                  themeVariant={isDark ? 'dark' : 'light'}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={styles.pickerDoneButton}
                    onPress={() => setShowTimePicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Summary line — only shown after a time is selected */}
            {selectedSlot && selectedDay && !showTimePicker && (
              <View style={styles.timeSummary}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginRight: SPACING.xs }} />
                <Text style={styles.timeSummaryText}>
                  {selectedDay.label === 'Today'
                    ? 'Today'
                    : selectedDay.label === 'Tomorrow'
                    ? 'Tomorrow'
                    : `${selectedDay.label}, ${selectedDay.dateStr}`}
                  {' \u00B7 '}
                  {selectedSlot.label}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(2)}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, (!selectedSlot || creating) && styles.buttonDisabled]}
            onPress={() => withReliabilityGate(handleCreateSchedule)}
            disabled={!selectedSlot || creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Confirm</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      {/* Reliability intro — shown once before first scheduled visit */}
      <ReliabilityIntroModal
        visible={reliabilityModalVisible}
        onConfirm={() => {
          setReliabilityModalVisible(false);
          pendingActionRef.current?.();
          pendingActionRef.current = null;
        }}
        onDismiss={() => {
          setReliabilityModalVisible(false);
          pendingActionRef.current = null;
        }}
      />
    </SafeAreaView>
    </ImageBackground>
  );
}

/**
 * getStyles — Generates a themed StyleSheet for PlanVisitScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  bgImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  headerGradient: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  scrollBody: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  scroll: {
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  intentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  intentThumbFallback: {
    backgroundColor: colors.primary + '18',
  },
  intentInfo: {
    flex: 1,
  },
  intentGym: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  intentTime: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    marginTop: 2,
  },
  intentMeta: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  cancelButton: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xxs,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.regular,
  },
  cardActionColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  cardStartRunButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,120,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,120,0,0.30)',
    borderRadius: 20,
  },
  cardStartRunText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.90)',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // ── Runs Being Planned ──────────────────────────────────
  runsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  runCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  runThumbFallback: {
    backgroundColor: colors.primary + '18',
  },
  runCardInfo: {
    flex: 1,
  },
  runCardGym: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  runCardTime: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    marginTop: 2,
  },
  runCardMetaRow: {
    marginTop: 3,
  },
  runCardMeta: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
  },
  runCardPlayers: {
    fontSize: FONT_SIZES.xs,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: 1,
  },
  // ── Run level badge (mirrors RunDetailsScreen + ViewRunsScreen exactly) ────
  runLevelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  runLevelBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  runCardChatButton: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewRunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: colors.primary + '15',
    gap: 2,
  },
  viewRunButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.primary,
  },
  runsEmptyState: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  runsEmptyText: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  runsEmptySubtext: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 3,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  runsEmptyAction: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 8,
  },
  // ── Run count badge in section header ─────────────────────────────────────
  runCountBadge: {
    marginLeft: 6,
    backgroundColor: colors.primary + '20',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  runCountBadgeText: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // ── Runs Being Planned — Filter button ───────────────────────────────────
  runsFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  runsFilterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  runsFilterButtonText: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FONT_WEIGHTS.medium,
  },
  runsFilterButtonTextActive: {
    color: '#fff',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // ── Compact empty visits state ─────────────────────────────────────────────
  emptyStateCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  emptyStateCompactText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xl + SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  gymCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(20,20,20,0.85)' : colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
  },
  gymCardSelected: {
    borderWidth: 2,
    borderColor: '#FF7A00',
    backgroundColor: isDark ? 'rgba(255,120,0,0.08)' : colors.primary + '15',
  },
  gymCardLeft: {
    marginRight: SPACING.sm,
  },
  gymCardInfo: {
    flex: 1,
  },
  gymCardName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: isDark ? '#FFFFFF' : colors.textPrimary,
  },
  gymCardAddress: {
    fontSize: FONT_SIZES.xs,
    color: isDark ? 'rgba(255,255,255,0.65)' : colors.textMuted,
    marginTop: 2,
  },
  gymCardType: {
    fontSize: FONT_SIZES.small,
    color: isDark ? 'rgba(255,255,255,0.85)' : colors.textSecondary,
    marginTop: 2,
  },
  gymCardAccent: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  presenceBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  presenceBadgeText: {
    fontSize: FONT_SIZES.xs,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  dayPickerRow: {
    marginBottom: SPACING.lg,
    marginHorizontal: -SPACING.md,
  },
  dayPickerContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  dayChip: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    minWidth: 82,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
  },
  dayChipLabelSelected: {
    color: '#fff',
  },
  dayChipDate: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  dayChipDateSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  selectDayPrompt: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  selectDayText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // ── Time Picker ──────────────────────────────────────────
  timePickerSection: {
    marginBottom: SPACING.lg,
  },
  timePickerLabel: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md + 4,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  timePickerButtonEmpty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textMuted + '50',
  },
  timePickerButtonSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.primary + '10',
  },
  timePickerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: colors.textMuted + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timePickerIconWrapSelected: {
    backgroundColor: colors.primary + '18',
  },
  timePickerTextWrap: {
    flex: 1,
  },
  timePickerPlaceholder: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textSecondary,
  },
  timePickerHint: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  timePickerSelectedTime: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primary,
  },
  pickerContainer: {
    marginTop: SPACING.sm,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  pickerDoneButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickerDoneText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.primary,
  },
  timeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: colors.success + '12',
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  timeSummaryText: {
    fontSize: FONT_SIZES.small,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // ── Step 4: Confirmation ─────────────────────────────────
  confirmationBody: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  confirmationIconWrap: {
    marginBottom: SPACING.md,
  },
  confirmationGym: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  confirmationTime: {
    fontSize: FONT_SIZES.body,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.xs,
  },
  // Compact signal row below the time label — dark surface, icon + one-line text
  confirmationSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  confirmationSignalText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
  confirmationPrompt: {
    marginTop: SPACING.xl,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  confirmationPromptTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  confirmationPromptDesc: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  confirmationPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xl,
    alignSelf: 'stretch',
    marginHorizontal: SPACING.md,
  },
  confirmationPrimaryText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
  },
  confirmationSecondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    alignSelf: 'stretch',
    marginHorizontal: SPACING.md,
  },
  confirmationSecondaryText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: colors.textSecondary,
  },
  // Subtle hint under the Start a Run button — communicates shared ownership
  confirmationRunHint: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginHorizontal: SPACING.md,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  buttonRowPinned: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // ── Visit signal badges ────────────────────────────────────────────────────
  // Co-planner badge on Step 1 schedule cards (other users planning same slot)
  coPlannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  coPlannerBadgeText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.90)',
    fontWeight: FONT_WEIGHTS.medium,
  },
  // Tappable variant — used when a real run exists for this visit slot
  coPlannerBadgeTappable: {
    alignSelf: 'flex-start',
  },
  // High-momentum pill — subtle orange-tinted background for 3+ co-planners
  coPlannerBadgeHigh: {
    backgroundColor: 'rgba(255,120,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,120,0,0.22)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  // "You're in the run" badge — shown on visit card when user has already joined
  inRunBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  inRunBadgeText: {
    fontSize: 11,
    color: '#22C55E',
    fontWeight: FONT_WEIGHTS.medium,
  },
  // "Your Visit" badge on Step 1 run cards (user has a schedule near this run)
  yourVisitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  yourVisitBadgeText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── Step 2: Search + Filter ───────────────────────────────────────────────
  gymSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  gymSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
    paddingHorizontal: SPACING.sm,
    height: 40,
  },
  gymSearchInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  gymFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
  },
  gymFilterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gymFilterButtonText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: FONT_WEIGHTS.medium,
  },
  gymFilterButtonTextActive: {
    color: '#fff',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  gymActiveChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
    gap: 6,
  },
  gymActiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  gymActiveChipText: {
    fontSize: FONT_SIZES.xs,
    color: '#fff',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  gymFilterEmptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.xs,
  },
  gymFilterEmptyText: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  gymFilterClearText: {
    fontSize: FONT_SIZES.small,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.xs,
  },

  // ── Filter bottom sheet (mirrors ViewRunsScreen) ──────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? '#48484A' : '#D1D5DB',
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  sheetTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
  },
  sheetSectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  sheetPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sheetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
  },
  sheetPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetPillText: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  sheetPillTextActive: {
    color: '#fff',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  sheetDoneButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  sheetDoneText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#fff',
  },
  // ── Sort toggle row (mirrors ViewRunsScreen exactly) ──────────────────────
  sheetToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: isDark ? '#48484A' : '#E5E7EB',
    marginBottom: SPACING.sm,
  },
  sheetToggleRowActive: {
    borderColor: '#0A84FF',
    backgroundColor: isDark ? 'rgba(10,132,255,0.15)' : 'rgba(10,132,255,0.08)',
  },
  sheetToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetToggleTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: isDark ? '#FFFFFF' : '#111111',
  },
  sheetToggleSub: {
    fontSize: FONT_SIZES.xs,
    color: isDark ? '#8E8E93' : '#6B7280',
    marginTop: 1,
  },
  sheetToggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: isDark ? '#48484A' : '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  sheetToggleSwitchOn: {
    backgroundColor: '#0A84FF',
  },
  sheetToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  sheetToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  sheetClearBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  sheetClearBtnText: {
    fontSize: FONT_SIZES.small,
    color: colors.danger || '#EF4444',
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
