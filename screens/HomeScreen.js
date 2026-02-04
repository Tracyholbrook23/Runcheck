import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence } from '../hooks';

const HomeScreen = ({ navigation }) => {
  const { colors, themeStyles } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const BUTTON = themeStyles.BUTTON;

  const {
    presence,
    loading,
    isCheckedIn,
    checkOut,
    checkingOut,
    getTimeRemaining,
  } = usePresence();

  const handleCheckOut = async () => {
    Alert.alert(
      'Check Out',
      `Are you sure you want to check out from ${presence?.gymName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await checkOut();
              Alert.alert('Checked Out', "You've successfully checked out.");
            } catch (error) {
              console.error('Check-out error:', error);
              Alert.alert('Error', error.message || 'Failed to check out.');
            }
          },
        },
      ]
    );
  };

  const goToTab = (tabName) => {
    navigation.getParent()?.navigate(tabName);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('../assets/hoop-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>RunCheck</Text>
        <Text style={styles.subtitle}>Find or join a pickup run near you</Text>

        {loading ? (
          <View style={styles.presenceCard}>
            <ActivityIndicator size="small" color={colors.success} />
          </View>
        ) : isCheckedIn ? (
          <View style={styles.presenceCard}>
            <View style={styles.presenceHeader}>
              <View style={styles.liveIndicator} />
              <Text style={styles.presenceLabel}>You're Checked In</Text>
            </View>
            <Text style={styles.presenceGym}>{presence.gymName}</Text>
            <Text style={styles.presenceTime}>
              Expires in {getTimeRemaining()}
            </Text>
            <TouchableOpacity
              style={styles.checkOutButton}
              onPress={handleCheckOut}
              disabled={checkingOut}
            >
              {checkingOut ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.checkOutText}>Check Out</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          style={[BUTTON.base, isCheckedIn && styles.buttonDisabled]}
          onPress={() => goToTab('CheckIn')}
        >
          <Text style={BUTTON.text}>
            {isCheckedIn ? 'Already Checked In' : 'Check Into a Run'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[BUTTON.base, styles.accentButton]}
          onPress={() => goToTab('Runs')}
        >
          <Text style={BUTTON.text}>Find Open Runs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[BUTTON.base, styles.planButton]}
          onPress={() => goToTab('Plan')}
        >
          <Text style={BUTTON.text}>Plan a Visit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
      </View>
    </SafeAreaView>
  );
};

const getStyles = (colors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    marginBottom: SPACING.md,
  },
  logo: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: FONT_SIZES.title + 4,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.subtitle,
    color: colors.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  presenceCard: {
    backgroundColor: colors.presenceBackground,
    borderRadius: 12,
    padding: SPACING.md,
    width: '100%',
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  presenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: SPACING.xs,
  },
  presenceLabel: {
    fontSize: FONT_SIZES.small,
    color: colors.presenceText,
    fontWeight: '600',
  },
  presenceGym: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: 'bold',
    color: colors.presenceTextBright,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  presenceTime: {
    fontSize: FONT_SIZES.small,
    color: colors.presenceText,
    marginBottom: SPACING.sm,
  },
  checkOutButton: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  checkOutText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: '600',
  },
  accentButton: {
    backgroundColor: colors.primaryLight,
    marginTop: SPACING.md,
  },
  planButton: {
    backgroundColor: colors.secondary,
    marginTop: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footer: {
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
  },
});

export default HomeScreen;
