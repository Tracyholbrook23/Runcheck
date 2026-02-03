import React, { useState, useEffect } from 'react';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import * as Location from 'expo-location';
import { auth } from '../config/firebase';
import { checkIn, getActivePresence } from '../services/presenceService';
import { getAllGyms, seedGyms } from '../services/gymService';

export default function CheckInScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [gymsLoading, setGymsLoading] = useState(true);
  const [activePresence, setActivePresence] = useState(null);

  // Dropdown state
  const [open, setOpen] = useState(false);
  const [selectedGym, setSelectedGym] = useState(null);
  const [gymItems, setGymItems] = useState([]);

  // Load gyms and check for active presence on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setGymsLoading(true);

      // Check for active presence first
      if (auth.currentUser) {
        const presence = await getActivePresence(auth.currentUser.uid);
        setActivePresence(presence);
      }

      // Load gyms
      let gyms = await getAllGyms();

      // If no gyms exist, seed them
      if (gyms.length === 0) {
        await seedGyms();
        gyms = await getAllGyms();
      }

      // Format for dropdown
      const items = gyms.map((gym) => ({
        label: `${gym.name} (${gym.currentPresenceCount || 0} here)`,
        value: gym.id,
        gymName: gym.name,
      }));

      setGymItems(items);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load gyms. Please try again.');
    } finally {
      setGymsLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!selectedGym) {
      Alert.alert('Select a Gym', 'Please select a gym to check into.');
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Not Logged In', 'Please log in to check in.');
      return;
    }

    setLoading(true);

    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Required',
          'Please enable location services to check in. We use your location to verify you are at the gym.'
        );
        setLoading(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const userLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // Get the gym name from items
      const gymItem = gymItems.find((item) => item.value === selectedGym);
      const gymName = gymItem?.gymName || selectedGym;

      await checkIn(auth.currentUser.uid, selectedGym, userLocation);

      Alert.alert(
        'Checked In!',
        `You're now checked in at ${gymName}. Your check-in will expire in 3 hours.`,
        [
          {
            text: 'View Gyms',
            onPress: () => navigation.navigate('ViewRuns'),
          },
        ]
      );
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Check-in Failed', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // If user already has an active presence, show that instead
  if (activePresence) {
    const expiresAt = activePresence.expiresAt?.toDate();
    const timeRemaining = expiresAt
      ? Math.max(0, Math.round((expiresAt - new Date()) / 60000))
      : 0;

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.activeContainer}>
          <Text style={styles.activeTitle}>You're Already Checked In</Text>
          <View style={styles.activeCard}>
            <Text style={styles.activeGym}>{activePresence.gymName}</Text>
            <Text style={styles.activeTime}>
              {timeRemaining > 0
                ? `Expires in ${timeRemaining} minutes`
                : 'Expiring soon...'}
            </Text>
          </View>
          <Text style={styles.activeHint}>
            Check out from the Home screen to check in elsewhere.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (gymsLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading gyms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.innerContainer}>
          <Text style={styles.title}>Check Into a Gym</Text>
          <Text style={styles.subtitle}>
            Let others know you're here to play
          </Text>

          <Text style={styles.label}>Select Gym:</Text>

          <DropDownPicker
            open={open}
            value={selectedGym}
            items={gymItems}
            setOpen={setOpen}
            setValue={setSelectedGym}
            setItems={setGymItems}
            placeholder="Choose a gym"
            containerStyle={{ marginBottom: open ? 200 : 20 }}
            style={styles.dropdown}
            dropDownContainerStyle={styles.dropdownContainer}
            zIndex={5000}
            zIndexInverse={1000}
            listMode="SCROLLVIEW"
          />

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Your check-in will automatically expire after 3 hours, or you can
              check out manually from the Home screen.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.checkInButton, loading && styles.buttonDisabled]}
            onPress={handleCheckIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.checkInButtonText}>Check In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.body,
    color: COLORS.textDark,
  },
  innerContainer: {
    padding: SPACING.lg,
    zIndex: 1000,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
    textAlign: 'center',
    color: COLORS.textDark,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    color: COLORS.textDark,
  },
  dropdown: {
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  dropdownContainer: {
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  infoBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZES.small,
    color: '#1a73e8',
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  checkInButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  // Active presence styles
  activeContainer: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: SPACING.lg,
  },
  activeCard: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  activeGym: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: '#2e7d32',
    marginBottom: SPACING.sm,
  },
  activeTime: {
    fontSize: FONT_SIZES.body,
    color: '#388e3c',
  },
  activeHint: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg * 2,
  },
  backButtonText: {
    color: '#fff',
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
});
