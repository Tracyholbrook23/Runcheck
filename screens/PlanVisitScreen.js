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

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useSchedules, useGyms, useProfile, useLivePresenceMap } from '../hooks';
import { useMyRunChats } from '../hooks/useMyRunChats';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';
import { subscribeToAllUpcomingRuns, startOrJoinRun } from '../services/runService';
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
  const [step, setStep] = useState(1);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // User profile provides name + avatar for activity feed writes
  const { profile } = useProfile();

  // Hide the default navigation header — this screen uses its own title layout
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const availableDays = getAvailableDays();

  const {
    schedules,
    loading: schedulesLoading,
    createSchedule,
    cancelSchedule,
    creating,
    formatScheduleTime,
  } = useSchedules();

  const { gyms, loading: gymsLoading } = useGyms();
  const { countMap } = useLivePresenceMap();

  // ── Runs the user has joined — used to show/hide chat button ────────────
  const { runChats } = useMyRunChats();
  const joinedRunIds = useMemo(() => new Set(runChats.map((c) => c.runId)), [runChats]);

  // ── Community runs — all upcoming runs across all gyms ──────────────────
  const [communityRuns, setCommunityRuns] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToAllUpcomingRuns((runs) => {
      setCommunityRuns(runs);
    });
    return unsubscribe;
  }, []);

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
  const handleCancelSchedule = async (schedule) => {
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
              await cancelSchedule(schedule.id);

              // Remove the corresponding activity feed event — fire and forget.
              // Fast path: if the schedule doc has an activityId we delete that
              // exact document. Fallback: query-based delete limited to 1 result
              // so only the most recent matching event is removed.
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
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Step 1: Planned Visits ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <LinearGradient
            colors={['#3D1E00', '#1A0A00', colors.background]}
            locations={[0, 0.55, 1]}
            style={styles.headerGradient}
          >
            <View style={styles.titleRow}>
              <View>
                <Text style={styles.title}>Plan a Visit</Text>
                <Text style={styles.subtitle}>Schedule when you plan to play</Text>
              </View>
            </View>
          </LinearGradient>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={styles.scrollBody}>

              {schedules.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Upcoming Visits</Text>
                  {schedules.map((schedule) => {
                    const scheduleGym = gyms.find((g) => g.id === schedule.gymId);
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
                        </View>
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => handleCancelSchedule(schedule)}
                        >
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
                  </View>
                  <Text style={styles.emptyText}>No visits planned yet</Text>
                  <Text style={styles.emptySubtext}>
                    Schedule a visit so other players know you're coming
                  </Text>
                </View>
              )}

              {/* ── Runs Being Planned ─────────────────────────────────────── */}
              <View style={styles.section}>
                <View style={styles.runsSectionHeader}>
                  <Ionicons name="basketball-outline" size={15} color={colors.primary} style={{ marginRight: 5 }} />
                  <Text style={styles.sectionTitle}>Runs Being Planned</Text>
                </View>
                {communityRuns.length > 0 ? (
                  communityRuns.map((run) => {
                    const runGym = gyms.find((g) => g.id === run.gymId);
                    const isJoined = joinedRunIds.has(run.id);
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
                            </Text>
                          </View>
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
                        <View style={styles.viewRunButton}>
                          <Text style={styles.viewRunButtonText}>View</Text>
                          <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.runsEmptyState}>
                    <Text style={styles.runsEmptyText}>No runs planned yet</Text>
                    <Text style={styles.runsEmptySubtext}>
                      When someone starts a run, it'll show up here
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
      </SafeAreaView>
    );
  }

  // ─── Step 2: Select Gym ────────────────────────────────────────────────────
  if (step === 2) {
    return (
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
          <View style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView contentContainerStyle={styles.scrollBody}>

                {gyms.map((gym) => (
                  <TouchableOpacity
                    key={gym.id}
                    style={[
                      styles.gymCard,
                      // Highlight the selected gym with a primary-color border
                      selectedGym?.id === gym.id && styles.gymCardSelected,
                    ]}
                    onPress={() => setSelectedGym(gym)}
                  >
                    <View style={styles.gymCardLeft}>
                      {/* Checkmark when selected, outline circle otherwise */}
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
                    {/* Live presence badge — count from useLivePresenceMap (expiry-filtered, deduplicated) */}
                    {(countMap[gym.id] ?? 0) > 0 && (
                      <View style={styles.presenceBadge}>
                        <Text style={styles.presenceBadgeText}>{countMap[gym.id]} here</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}

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
      </SafeAreaView>
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

    return (
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

          {/* Start a Run prompt */}
          <View style={styles.confirmationPrompt}>
            <Text style={styles.confirmationPromptTitle}>Want others to join you?</Text>
            <Text style={styles.confirmationPromptDesc}>
              Starting a run lets nearby players see your session and hop in.
            </Text>
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
                // Create the run using the same service RunDetailsScreen uses.
                // startOrJoinRun handles the merge rule — if a run already exists
                // within ±60 min at this gym, the user joins it instead.
                await startOrJoinRun(
                  selectedGym.id,
                  selectedGym.name,
                  selectedSlot.date
                );

                // Navigate to RunDetailsScreen so the user sees their new run
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
                <Text style={styles.confirmationPrimaryText}>Start a Run</Text>
              </>
            )}
          </TouchableOpacity>

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
            onPress={handleCreateSchedule}
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
    </SafeAreaView>
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
    backgroundColor: colors.background,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: FONT_SIZES.small,
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
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  gymCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '15',
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
    color: colors.textPrimary,
  },
  gymCardAddress: {
    fontSize: FONT_SIZES.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  gymCardType: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
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
});
