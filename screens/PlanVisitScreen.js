import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { useSchedules, useGyms } from '../hooks';

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

const getTimeSlotsForDay = (dayObj) => {
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

const fakeGyms = [
  {
    id: 'fake1',
    name: 'Pan American Recreation Center',
    type: 'indoor',
    address: '2100 E 3rd St, Austin, TX 78702',
    currentPresenceCount: 10,
  },
  {
    id: 'fake2',
    name: 'Life Time Austin North',
    type: 'indoor',
    address: '13725 Ranch Rd 620 N, Austin, TX 78717',
    currentPresenceCount: 9,
  },
  {
    id: 'fake3',
    name: "Gold's Gym Hester's Crossing",
    type: 'indoor',
    address: '2400 S I-35 Frontage Rd, Round Rock, TX 78681',
    currentPresenceCount: 12,
  },
  {
    id: 'fake4',
    name: 'Clay Madsen Recreation Center',
    type: 'indoor',
    address: '1600 Gattis School Rd, Round Rock, TX 78664',
    currentPresenceCount: 5,
  },
];

export default function PlanVisitScreen({ navigation }) {
  const [selectedGym, setSelectedGym] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [step, setStep] = useState(1);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const availableDays = getAvailableDays();
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

  const handleCreateSchedule = async () => {
    if (!selectedGym || !selectedSlot) return;
    try {
      await createSchedule(selectedGym.id, selectedGym.name, selectedSlot.date);
      const dayDesc = selectedDay?.label === 'Today' ? 'today' : `on ${selectedDay?.label}, ${selectedDay?.dateStr}`;
      Alert.alert(
        'Visit Scheduled!',
        `You're planning to visit ${selectedGym.name} ${dayDesc} at ${selectedSlot.label}`,
        [{ text: 'OK', onPress: () => setStep(1) }]
      );
      setSelectedGym(null);
      setSelectedSlot(null);
      setSelectedDay(null);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

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

  // Step 1 — Planned Visits
  if (step === 1) {
    return (
      <SafeAreaView style={styles.safe}>
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
      </SafeAreaView>
    );
  }

  // Step 2 — Select Gym
  if (step === 2) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.title}>Select a Gym</Text>
              <Text style={styles.subtitle}>Where do you plan to play?</Text>
            </View>
          </View>

          {fakeGyms.map((gym) => (
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
      </SafeAreaView>
    );
  }

  // Step 3 — Select Time
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Select a Time</Text>
            <Text style={styles.subtitle}>When are you arriving at {selectedGym?.name}?</Text>
          </View>
        </View>

        {/* Day Picker */}
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

        {/* Time Slots */}
        {!selectedDay ? (
          <View style={styles.selectDayPrompt}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.selectDayText}>Select a day above to see available times</Text>
          </View>
        ) : timeSlots.length === 0 ? (
          <View style={styles.selectDayPrompt}>
            <Text style={styles.selectDayText}>No more times available for today</Text>
          </View>
        ) : (
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
    </SafeAreaView>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: SPACING.md,
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