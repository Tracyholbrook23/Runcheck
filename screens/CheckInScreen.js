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
import { usePresence, useGyms, useLocation } from '../hooks';

export default function CheckInScreen({ navigation }) {
  const [open, setOpen] = useState(false);
  const [selectedGym, setSelectedGym] = useState(null);
  const [gymItems, setGymItems] = useState([]);

  const {
    presence,
    loading: presenceLoading,
    isCheckedIn,
    checkIn,
    checkingIn,
    getTimeRemaining,
  } = usePresence();

  const {
    gyms,
    loading: gymsLoading,
    ensureGymsExist,
  } = useGyms();

  const {
    getCurrentLocation,
    loading: locationLoading,
  } = useLocation();

  useEffect(() => {
    ensureGymsExist();
  }, [ensureGymsExist]);

  useEffect(() => {
    const items = gyms.map((gym) => ({
      label: `${gym.name} (${gym.currentPresenceCount || 0} here)`,
      value: gym.id,
      gymName: gym.name,
    }));
    setGymItems(items);
  }, [gyms]);

  const handleCheckIn = async () => {
    if (!selectedGym) {
      Alert.alert('Select a Gym', 'Please select a gym to check into.');
      return;
    }

    try {
      const userLocation = await getCurrentLocation();
      const gymItem = gymItems.find((item) => item.value === selectedGym);
      const gymName = gymItem?.gymName || selectedGym;

      await checkIn(selectedGym, userLocation);

      Alert.alert(
        'Checked In!',
        `You're now checked in at ${gymName}. Your check-in will expire in 3 hours.`,
        [
          {
            text: 'View Gyms',
            onPress: () => navigation.getParent()?.navigate('Runs'),
          },
        ]
      );
    } catch (error) {
      console.error('Check-in error:', error);
      if (error.message.includes('permission')) {
        Alert.alert(
          'Location Required',
          'Please enable location services to check in. We use your location to verify you are at the gym.'
        );
      } else {
        Alert.alert('Check-in Failed', error.message || 'Please try again.');
      }
    }
  };

  const loading = presenceLoading || gymsLoading;
  const isProcessing = checkingIn || locationLoading;

  if (isCheckedIn && presence) {
    const timeRemaining = getTimeRemaining();

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.activeContainer}>
          <Text style={styles.activeTitle}>You're Already Checked In</Text>
          <View style={styles.activeCard}>
            <Text style={styles.activeGym}>{presence.gymName}</Text>
            <Text style={styles.activeTime}>
              {timeRemaining ? `Expires in ${timeRemaining}` : 'Expiring soon...'}
            </Text>
          </View>
          <Text style={styles.activeHint}>
            Check out from the Home screen to check in elsewhere.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.getParent()?.navigate('Home')}
          >
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
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
            textStyle={{ color: COLORS.textPrimary }}
            placeholderStyle={{ color: COLORS.textMuted }}
            listItemLabelStyle={{ color: COLORS.textPrimary }}
            selectedItemLabelStyle={{ color: COLORS.primary }}
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
            style={[styles.checkInButton, isProcessing && styles.buttonDisabled]}
            onPress={handleCheckIn}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.checkInButtonText}>Check In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.getParent()?.navigate('Home')}
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
    color: COLORS.textSecondary,
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
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    color: COLORS.textPrimary,
  },
  dropdown: {
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  dropdownContainer: {
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  infoBox: {
    backgroundColor: COLORS.infoBackground,
    borderRadius: 8,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.infoText,
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
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
  activeContainer: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  activeCard: {
    backgroundColor: COLORS.presenceBackground,
    borderRadius: 12,
    padding: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  activeGym: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: COLORS.presenceTextBright,
    marginBottom: SPACING.sm,
  },
  activeTime: {
    fontSize: FONT_SIZES.body,
    color: COLORS.presenceText,
  },
  activeHint: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textSecondary,
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
