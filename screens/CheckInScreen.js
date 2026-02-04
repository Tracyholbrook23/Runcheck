import React, { useState, useEffect, useMemo } from 'react';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useTheme } from '../contexts';

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
import { usePresence, useGyms } from '../hooks';

export default function CheckInScreen({ navigation }) {
  const [open, setOpen] = useState(false);
  const [selectedGym, setSelectedGym] = useState(null);
  const [gymItems, setGymItems] = useState([]);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

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
      const gymItem = gymItems.find((item) => item.value === selectedGym);
      const gymName = gymItem?.gymName || selectedGym;

      await checkIn(selectedGym);

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
      if (error.message.includes('permission denied')) {
        Alert.alert(
          'Location Required',
          'Please enable location services to check in. We use your location to verify you are at the gym.'
        );
      } else if (error.message.includes('Unable to retrieve')) {
        Alert.alert(
          'GPS Unavailable',
          'Could not get your location. Please check that GPS is enabled and try again.'
        );
      } else {
        Alert.alert('Check-in Failed', error.message || 'Please try again.');
      }
    }
  };

  const loading = presenceLoading || gymsLoading;
  const isProcessing = checkingIn;

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
          <ActivityIndicator size="large" color={colors.primary} />
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
            textStyle={{ color: colors.textPrimary }}
            placeholderStyle={{ color: colors.textMuted }}
            listItemLabelStyle={{ color: colors.textPrimary }}
            selectedItemLabelStyle={{ color: colors.primary }}
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

const getStyles = (colors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.textSecondary,
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
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    color: colors.textPrimary,
  },
  dropdown: {
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  dropdownContainer: {
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  infoBox: {
    backgroundColor: colors.infoBackground,
    borderRadius: 8,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZES.small,
    color: colors.infoText,
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkInButton: {
    backgroundColor: colors.primary,
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
    color: colors.primary,
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
    color: colors.textPrimary,
    marginBottom: SPACING.lg,
  },
  activeCard: {
    backgroundColor: colors.presenceBackground,
    borderRadius: 12,
    padding: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  activeGym: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: '600',
    color: colors.presenceTextBright,
    marginBottom: SPACING.sm,
  },
  activeTime: {
    fontSize: FONT_SIZES.body,
    color: colors.presenceText,
  },
  activeHint: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    backgroundColor: colors.primary,
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
