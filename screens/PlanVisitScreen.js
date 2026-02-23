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
 *   - `getTimeSlotsForDay` — builds 30-min time slots, skipping past times
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useSchedules, useGyms, useProfile } from '../hooks';
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
 * getTimeSlotsForDay — Generates 30-minute time slots for a given day.
 *
 * Covers 6:00 AM to 10:00 PM in 30-minute increments. When the day is
 * today, any slot that has already passed is filtered out so users can't
 * schedule in the past.
 *
 * Each slot contains:
 *   - `date`     — Full JavaScript Date for the slot's start time
 *   - `label`    — Formatted time string (e.g. "6:30 PM")
 *   - `timeSlot` — ISO string used as a unique key and for Firestore writes
 *
 * @param {{ dateObj: Date } | null} dayObj — The selected day object from `getAvailableDays`.
 * @returns {{ date: Date, label: string, timeSlot: string }[]} Array of available time slots.
 */
const getTimeSlotsForDay = (dayObj) => {
  if (!dayObj) return [];
  const slots = [];
  const now = new Date();
  const isToday = dayObj.dateObj.toDateString() === now.toDateString();
  for (let hour = 6; hour <= 22; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const date = new Date(dayObj.dateObj);
      date.setHours(hour, min, 0, 0);
      // Skip past time slots when the selected day is today
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

  // Recompute time slots whenever the selected day changes.
  // Returns an empty array until a day is chosen.
  const timeSlots = selectedDay ? getTimeSlotsForDay(selectedDay) : [];

  const {
    schedules,
    loading: schedulesLoading,
    createSchedule,
    cancelSchedule,
    creating,
    formatScheduleTime,
  } = useSchedules();

  const { gyms, loading: gymsLoading } = useGyms();

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
        });

        // Backlink: store the activity doc ID on the schedule document so that
        // handleCancelSchedule can target the exact activity record to delete.
        if (newSchedule?.id) {
          updateDoc(doc(db, 'schedules', newSchedule.id), {
            activityId: activityRef.id,
          }).catch((err) => console.error('activityId backlink error:', err));
        }
      } catch (err) {
        // Activity write failure is non-fatal — the schedule itself succeeded.
        console.error('Activity write error (plan):', err);
      }

      const dayDesc = selectedDay?.label === 'Today' ? 'today' : `on ${selectedDay?.label}, ${selectedDay?.dateStr}`;

      Alert.alert(
        'Visit Scheduled!',
        `You're planning to visit ${selectedGym.name} ${dayDesc} at ${selectedSlot.label}. Check in when you arrive to earn +15 pts!`,
        [{ text: 'OK', onPress: () => setStep(1) }]
      );
      // Reset all selections so the wizard is clean for the next use
      setSelectedGym(null);
      setSelectedSlot(null);
      setSelectedDay(null);
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
                    .catch((err) => console.error('Activity cleanup error (cancel plan):', err));
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
                    .catch((err) => console.error('Activity cleanup error (cancel plan):', err));
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
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <View style={styles.titleRow}>
                <View>
                  <Text style={styles.title}>Plan a Visit</Text>
                  <Text style={styles.subtitle}>Schedule when you plan to play</Text>
                </View>
              </View>

              {schedules.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Upcoming Visits</Text>
                  {schedules.map((schedule) => (
                    <View key={schedule.id} style={styles.intentCard}>
                      <View style={styles.intentIconWrap}>
                        <Ionicons name="calendar" size={20} color={colors.primary} />
                      </View>
                      <View style={styles.intentInfo}>
                        <Text style={styles.intentGym}>{schedule.gymName}</Text>
                        {/* formatScheduleTime converts the Firestore Timestamp to a readable label */}
                        <Text style={styles.intentTime}>{formatScheduleTime(schedule)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => handleCancelSchedule(schedule)}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No visits scheduled</Text>
                  <Text style={styles.emptySubtext}>Plan ahead so others know you're coming</Text>
                </View>
              )}

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
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <View style={styles.titleRow}>
                <View>
                  <Text style={styles.title}>Select a Gym</Text>
                  <Text style={styles.subtitle}>Where do you plan to play?</Text>
                </View>
              </View>

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
                  {/* Live presence badge — shows if anyone is currently there */}
                  {gym.currentPresenceCount > 0 && (
                    <View style={styles.presenceBadge}>
                      <Text style={styles.presenceBadgeText}>{gym.currentPresenceCount} here</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}

              <View style={styles.buttonRow}>
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
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── Step 3: Select Time ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Select a Time</Text>
            <Text style={styles.subtitle}>When are you arriving at {selectedGym?.name}?</Text>
          </View>
        </View>

        {/*
         * Day Picker — horizontal scroll of 7 day chips.
         * Selecting a day clears the time slot so users can't carry over
         * an invalid selection from a previous day.
         */}
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
              onPress={() => { setSelectedDay(day); setSelectedSlot(null); }}
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

        {/* Time Slots — shown only after a day is selected */}
        {!selectedDay ? (
          <View style={styles.selectDayPrompt}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.selectDayText}>Select a day above to see available times</Text>
          </View>
        ) : timeSlots.length === 0 ? (
          // Edge case: user selected today but it's already past 10 PM
          <View style={styles.selectDayPrompt}>
            <Text style={styles.selectDayText}>No more times available for today</Text>
          </View>
        ) : (
          // 2-column grid of 30-minute time slot cards
          <View style={styles.slotsContainer}>
            {timeSlots.map((slot) => (
              <TouchableOpacity
                key={slot.timeSlot}
                style={[styles.slotCard, selectedSlot?.timeSlot === slot.timeSlot && styles.slotCardSelected]}
                onPress={() => setSelectedSlot(slot)}
              >
                <Text style={[styles.slotText, selectedSlot?.timeSlot === slot.timeSlot && styles.slotTextSelected]}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            ))}
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
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
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
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
  },
  intentIconWrap: {
    marginRight: SPACING.sm,
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
  cancelButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
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
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...(isDark ? {} : { borderWidth: 1, borderColor: colors.border }),
    alignItems: 'center',
  },
  slotCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '15',
  },
  slotText: {
    fontSize: FONT_SIZES.small,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  slotTextSelected: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
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
