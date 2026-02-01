import React, { useState, useEffect } from 'react';
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
import { COLORS, FONT_SIZES, SPACING, BUTTON } from '../constants/theme';
import { auth } from '../config/firebase';
import { subscribeToUserPresence, checkOut } from '../services/presenceService';

const HomeScreen = ({ navigation }) => {
  const [activePresence, setActivePresence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    let unsubscribe;

    if (auth.currentUser) {
      unsubscribe = subscribeToUserPresence(auth.currentUser.uid, (presence) => {
        setActivePresence(presence);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleCheckOut = async () => {
    Alert.alert(
      'Check Out',
      `Are you sure you want to check out from ${activePresence?.gymName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          style: 'destructive',
          onPress: async () => {
            setCheckingOut(true);
            try {
              await checkOut();
              Alert.alert('Checked Out', "You've successfully checked out.");
            } catch (error) {
              console.error('Check-out error:', error);
              Alert.alert('Error', error.message || 'Failed to check out.');
            } finally {
              setCheckingOut(false);
            }
          },
        },
      ]
    );
  };

  const getTimeRemaining = () => {
    if (!activePresence?.expiresAt) return null;
    const expiresAt = activePresence.expiresAt.toDate();
    const minutes = Math.max(0, Math.round((expiresAt - new Date()) / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo */}
        <View style={styles.logoWrapper}>
          <Image
            source={require('../assets/hoop-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>RunCheck</Text>
        <Text style={styles.subtitle}>Find or join a pickup run near you</Text>

        {/* Active Presence Card */}
        {loading ? (
          <View style={styles.presenceCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : activePresence ? (
          <View style={styles.presenceCard}>
            <View style={styles.presenceHeader}>
              <View style={styles.liveIndicator} />
              <Text style={styles.presenceLabel}>You're Checked In</Text>
            </View>
            <Text style={styles.presenceGym}>{activePresence.gymName}</Text>
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

        {/* Action Buttons */}
        <TouchableOpacity
          style={[BUTTON.base, activePresence && styles.buttonDisabled]}
          onPress={() => navigation.navigate('CheckIn')}
        >
          <Text style={BUTTON.text}>
            {activePresence ? 'Already Checked In' : 'Check Into a Run'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[BUTTON.base, styles.accentButton]}
          onPress={() => navigation.navigate('ViewRuns')}
        >
          <Text style={BUTTON.text}>Find Open Runs</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.textDark,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.subtitle,
    color: COLORS.textDark,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  // Active presence card
  presenceCard: {
    backgroundColor: '#e8f5e9',
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
    backgroundColor: '#4caf50',
    marginRight: SPACING.xs,
  },
  presenceLabel: {
    fontSize: FONT_SIZES.small,
    color: '#2e7d32',
    fontWeight: '600',
  },
  presenceGym: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: 'bold',
    color: '#1b5e20',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  presenceTime: {
    fontSize: FONT_SIZES.small,
    color: '#388e3c',
    marginBottom: SPACING.sm,
  },
  checkOutButton: {
    backgroundColor: '#c62828',
    borderRadius: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  checkOutText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: '600',
  },
  // Buttons
  accentButton: {
    backgroundColor: COLORS.accent,
    marginTop: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Footer
  footer: {
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.border,
  },
});

export default HomeScreen;
