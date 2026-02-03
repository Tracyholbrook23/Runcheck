import React, { useState, useEffect } from 'react';
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
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';
import { auth } from '../config/firebase';
import { getAllGyms } from '../services/gymService';
import {
  createSchedule,
  cancelSchedule,
  subscribeToUserSchedules,
} from '../services/scheduleService';

// Generate available time slots for the next 7 days
const getAvailableTimeSlots = () => {
  const slots = [];
  const now = new Date();
  const currentHour = now.getHours();

  // Today's remaining slots (next few hours)
  for (let hour = currentHour + 1; hour <= 22; hour++) {
    const date = new Date(now);
    date.setHours(hour, 0, 0, 0);
    const label = `Today ${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
    slots.push({ date, label, timeSlot: date.toISOString() });
  }

  // Next 6 days
  for (let day = 1; day <= 6; day++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + day);
    const dayName = day === 1 ? 'Tomorrow' : dayDate.toLocaleDateString('en-US', { weekday: 'short' });

    for (let hour = 6; hour <= 22; hour += 2) {
      const date = new Date(dayDate);
      date.setHours(hour, 0, 0, 0);
      const label = `${dayName} ${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
      slots.push({ date, label, timeSlot: date.toISOString() });
    }
  }

  return slots.slice(0, 20); // Limit to 20 slots
};

export default function PlanVisitScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gyms, setGyms] = useState([]);
  const [userSchedules, setUserSchedules] = useState([]);
  const [selectedGym, setSelectedGym] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [step, setStep] = useState(1); // 1: view schedules, 2: select gym, 3: select time

  const timeSlots = getAvailableTimeSlots();

  useEffect(() => {
    loadData();

    let unsubscribe;
    if (auth.currentUser) {
      unsubscribe = subscribeToUserSchedules(auth.currentUser.uid, (schedules) => {
        setUserSchedules(schedules);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const loadData = async () => {
    try {
      const gymsData = await getAllGyms();
      setGyms(gymsData);
    } catch (error) {
      console.error('Error loading gyms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!selectedGym || !selectedSlot) return;

    setSubmitting(true);
    try {
      await createSchedule(
        auth.currentUser.uid,
        selectedGym.id,
        selectedGym.name,
        selectedSlot.date
      );

      Alert.alert(
        'Visit Scheduled!',
        `You're planning to visit ${selectedGym.name} at ${selectedSlot.label}`,
        [{ text: 'OK', onPress: () => setStep(1) }]
      );

      setSelectedGym(null);
      setSelectedSlot(null);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
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

  const formatScheduleTime = (schedule) => {
    const date = schedule.scheduledTime?.toDate();
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Step 1: View existing intents
  if (step === 1) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView style={styles.container}>
          <Text style={styles.title}>Planned Visits</Text>
          <Text style={styles.subtitle}>
            Schedule when you plan to play
          </Text>

          {userSchedules.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Upcoming Visits</Text>
              {userSchedules.map((schedule) => (
                <View key={schedule.id} style={styles.intentCard}>
                  <View style={styles.intentInfo}>
                    <Text style={styles.intentGym}>{schedule.gymName}</Text>
                    <Text style={styles.intentTime}>
                      {formatScheduleTime(schedule)}
                    </Text>
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
              <Text style={styles.emptyText}>No visits scheduled</Text>
              <Text style={styles.emptySubtext}>
                Plan ahead so others know you're coming
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setStep(2)}
          >
            <Text style={styles.primaryButtonText}>Schedule a Visit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 2: Select gym
  if (step === 2) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView style={styles.container}>
          <Text style={styles.title}>Select a Gym</Text>
          <Text style={styles.subtitle}>Where do you plan to play?</Text>

          {gyms.map((gym) => (
            <TouchableOpacity
              key={gym.id}
              style={[
                styles.optionCard,
                selectedGym?.id === gym.id && styles.optionCardSelected,
              ]}
              onPress={() => setSelectedGym(gym)}
            >
              <Text style={styles.optionTitle}>{gym.name}</Text>
              <Text style={styles.optionSubtitle}>{gym.address}</Text>
              {gym.currentPresenceCount > 0 && (
                <Text style={styles.optionBadge}>
                  {gym.currentPresenceCount} there now
                </Text>
              )}
            </TouchableOpacity>
          ))}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep(1)}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                !selectedGym && styles.buttonDisabled,
              ]}
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

  // Step 3: Select time slot
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Select a Time</Text>
        <Text style={styles.subtitle}>
          When do you plan to arrive at {selectedGym?.name}?
        </Text>

        <View style={styles.slotsContainer}>
          {timeSlots.map((slot) => (
            <TouchableOpacity
              key={slot.timeSlot}
              style={[
                styles.slotCard,
                selectedSlot?.timeSlot === slot.timeSlot && styles.slotCardSelected,
              ]}
              onPress={() => setSelectedSlot(slot)}
            >
              <Text
                style={[
                  styles.slotText,
                  selectedSlot?.timeSlot === slot.timeSlot && styles.slotTextSelected,
                ]}
              >
                {slot.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep(2)}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (!selectedSlot || submitting) && styles.buttonDisabled,
            ]}
            onPress={handleCreateSchedule}
            disabled={!selectedSlot || submitting}
          >
            {submitting ? (
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: SPACING.lg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: COLORS.textDark,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: SPACING.md,
  },
  intentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  intentInfo: {
    flex: 1,
  },
  intentGym: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  intentTime: {
    fontSize: FONT_SIZES.small,
    color: COLORS.primary,
    marginTop: 2,
  },
  cancelButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelButtonText: {
    color: '#c62828',
    fontSize: FONT_SIZES.small,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textLight,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0f7ff',
  },
  optionTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  optionSubtitle: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textLight,
    marginTop: 2,
  },
  optionBadge: {
    fontSize: FONT_SIZES.small,
    color: COLORS.primary,
    marginTop: SPACING.xs,
    fontWeight: '500',
  },
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  slotCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0f7ff',
  },
  slotText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  slotTextSelected: {
    color: COLORS.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: 'center',
    marginRight: SPACING.sm,
    backgroundColor: '#f0f0f0',
  },
  secondaryButtonText: {
    color: COLORS.textDark,
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
