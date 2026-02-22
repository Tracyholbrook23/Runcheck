/**
 * HomeScreen.js — Main Dashboard
 *
 * The landing screen users see after signing in. Provides a high-level
 * snapshot of current activity and quick navigation into the app's core
 * features.
 *
 * Key sections:
 *   - Header           — RunCheck logo + profile icon shortcut
 *   - Welcome          — Large hero text "Find Your Next Run"
 *   - Presence Card    — Shows the user's active check-in (gym name +
 *                        time remaining) with a Check Out action. Only
 *                        rendered when `isCheckedIn` is true.
 *   - Quick Actions    — Three BlurView cards linking to Check In,
 *                        Find Runs, and Plan a Visit tabs
 *   - Hot Courts       — Horizontal scroll list of nearby active gyms
 *                        (currently seeded with placeholder data)
 *   - Recent Activity  — Feed of recent community check-ins and plans
 *                        (currently seeded with placeholder data)
 *
 * Layout uses a full-screen `ImageBackground` with a dark overlay so
 * all content renders on top of the court photo with consistent contrast.
 * BlurView cards from `expo-blur` give the frosted-glass UI feel.
 *
 * Styles are memoized per `(colors, isDark)` to avoid re-computing on
 * every state change.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  ImageBackground,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, SHADOWS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence, useGyms } from '../hooks';
import { Logo } from '../components';

/**
 * HomeScreen — Main dashboard component.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 *   React Navigation prop used to navigate between tabs and nested screens.
 * @returns {JSX.Element}
 */
const HomeScreen = ({ navigation }) => {
  const { colors, isDark, themeStyles } = useTheme();

  // Recompute styles only when the theme changes
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const {
    presence,
    loading,
    isCheckedIn,
    checkOut,
    checkingOut,
    getTimeRemaining,
  } = usePresence();

  const { gyms } = useGyms();

  /**
   * handleCheckOut — Prompts the user for confirmation then calls `checkOut()`.
   *
   * Uses a destructive-style Alert so the user doesn't accidentally check
   * out of their gym session. Shows a success alert on completion.
   */
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

  /**
   * goToTab — Navigates to a top-level bottom tab by name.
   *
   * `navigation.getParent()` is needed because HomeScreen lives inside
   * HomeStack, which itself is a child of the MainTabs navigator.
   *
   * @param {string} tabName — Name of the tab to navigate to (e.g., 'CheckIn', 'Runs').
   */
  const goToTab = (tabName) => {
    navigation.getParent()?.navigate(tabName);
  };

  const fakeActivity = [
    { id: 'a1', name: 'Big Ray',    action: 'checked in at',      gym: 'Pan American Recreation Center', time: '3m ago',  avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg'   },
    { id: 'a2', name: 'Aaliyah S.', action: 'planned a visit to', gym: "Gold's Gym Hester's Crossing",   time: '7m ago',  avatarUrl: 'https://randomuser.me/api/portraits/women/28.jpg' },
    { id: 'a3', name: 'Coach D',    action: 'checked in at',      gym: 'Life Time Austin North',         time: '12m ago', avatarUrl: 'https://randomuser.me/api/portraits/men/77.jpg'   },
  ];

  return (
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      {/* Dark overlay sits between the background image and all content */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Logo size="small" />
            <Text style={styles.headerTitle}>RunCheck</Text>
          </View>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => goToTab('Profile')}
          >
            <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome hero text */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>Find Your{'\n'}Next Run</Text>
            <Text style={styles.welcomeSubtitle}>Join a pickup run near you</Text>
          </View>

          {/*
           * Presence Card — only shown when user is checked in.
           * During the initial load we show a skeleton spinner inside the blur card.
           * Once loaded, if the user is checked in we render the full card with
           * gym name, time remaining, and a check-out button.
           */}
          {loading ? (
            <BlurView intensity={60} tint="dark" style={styles.presenceCard}>
              <ActivityIndicator size="small" color={colors.primary} />
            </BlurView>
          ) : isCheckedIn ? (
            <BlurView intensity={60} tint="dark" style={styles.presenceCard}>
              <View style={styles.presenceHeader}>
                <View style={styles.liveIndicator} />
                <Text style={styles.presenceLabel}>YOU'RE CHECKED IN</Text>
              </View>
              <Text style={styles.presenceGym}>{presence.gymName}</Text>
              <Text style={styles.presenceTime}>Expires in {getTimeRemaining()}</Text>
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
            </BlurView>
          ) : null}

          {/* Quick Actions — Check In (disabled when already checked in), Find Runs, Plan */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              onPress={() => goToTab('CheckIn')}
              disabled={isCheckedIn}
              activeOpacity={0.8}
            >
              <BlurView intensity={60} tint="dark" style={styles.actionCard}>
                <Ionicons name="location" size={26} color="#FFFFFF" />
                <Text style={styles.actionCardTitle}>
                  {isCheckedIn ? 'Already Checked In' : 'Check Into a Run'}
                </Text>
                <Text style={styles.actionCardSub}>Find courts near you</Text>
              </BlurView>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionCardSmallWrapper}
                onPress={() => goToTab('Runs')}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={styles.actionCardSmall}>
                  <Ionicons name="basketball-outline" size={24} color={colors.primary} />
                  <Text style={styles.actionSmallTitle}>Find Runs</Text>
                  <Text style={styles.actionSmallSub}>Open games</Text>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCardSmallWrapper}
                onPress={() => goToTab('Plan')}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={styles.actionCardSmall}>
                  <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                  <Text style={styles.actionSmallTitle}>Plan a Visit</Text>
                  <Text style={styles.actionSmallSub}>Schedule ahead</Text>
                </BlurView>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hot Courts — horizontal scroll of nearby active gyms */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Hot Courts Near You</Text>
            <View style={styles.liveActivity}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>36 active</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.courtScroll}
            contentContainerStyle={styles.courtScrollContent}
          >
            {gyms.slice(0, 4).map((gym) => (
              <TouchableOpacity
                key={gym.id}
                activeOpacity={0.8}
                onPress={() =>
                  // Navigate into the Runs tab's nested RunDetails screen, passing gym data
                  navigation.getParent()?.navigate('Runs', {
                    screen: 'RunDetails',
                    params: {
                      gymId: gym.id,
                      gymName: gym.name,
                      players: gym.currentPresenceCount || 0,
                      imageUrl: gym.imageUrl,
                      plannedToday: gym.plannedToday || 0,
                      plannedTomorrow: gym.plannedTomorrow || 0,
                    },
                  })
                }
              >
                <BlurView intensity={60} tint="dark" style={styles.courtCard}>
                  <View style={styles.courtCardTop}>
                    <View style={styles.courtLiveDot} />
                    <Text style={styles.courtPlayerCount}>{gym.currentPresenceCount || 0} playing</Text>
                  </View>
                  <Text style={styles.courtName}>{gym.name}</Text>
                  <View style={styles.courtMeta}>
                    <Text style={styles.courtType}>{gym.type === 'outdoor' ? 'Outdoor' : 'Indoor'}</Text>
                    <Text style={styles.courtDot}> · </Text>
                    <Text style={styles.courtDistance}>+{gym.plannedToday || 0} today</Text>
                  </View>
                </BlurView>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Recent Activity feed */}
          <Text style={styles.sectionTitleStandalone}>Recent Activity</Text>
          <View style={styles.activityFeed}>
            {fakeActivity.map((item) => (
              <BlurView key={item.id} intensity={40} tint="dark" style={styles.activityRow}>
                <Image source={{ uri: item.avatarUrl }} style={styles.activityAvatar} />
                <View style={styles.activityInfo}>
                  <Text style={styles.activityText} numberOfLines={1}>
                    <Text style={styles.activityName}>{item.name}</Text>
                    <Text style={styles.activityAction}>{' '}{item.action}{' '}</Text>
                    <Text style={styles.activityGym}>{item.gym}</Text>
                  </Text>
                  <Text style={styles.activityTime}>{item.time}</Text>
                </View>
              </BlurView>
            ))}
          </View>

          {/* Footer tagline */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

/**
 * getStyles — Generates a themed StyleSheet for HomeScreen.
 *
 * @param {object} colors — Active color palette from ThemeContext.
 * @param {boolean} isDark — Whether dark mode is active.
 * @returns {object} React Native StyleSheet object.
 */
const getStyles = (colors, isDark) => StyleSheet.create({
  bgImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerIcon: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  welcomeSection: {
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  welcomeTitle: {
    fontSize: FONT_SIZES.hero,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
    lineHeight: 46,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.2,
  },
  presenceCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
    fontSize: FONT_SIZES.xs,
    color: '#FFFFFF',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 1,
  },
  presenceGym: {
    fontSize: FONT_SIZES.h2,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  presenceTime: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: SPACING.md,
  },
  checkOutButton: {
    backgroundColor: colors.danger,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  checkOutText: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  actionsSection: {
    gap: SPACING.sm,
  },
actionCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.xxs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
  },
  actionCardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    marginTop: SPACING.xs,
    letterSpacing: -0.2,
  },
  actionCardSub: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionCardSmallWrapper: {
    flex: 1,
  },
  actionCardSmall: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xxs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionSmallTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    marginTop: SPACING.xxs,
  },
  actionSmallSub: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  liveActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.lg,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  footer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  sectionTitleStandalone: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },

  // Hot Courts horizontal scroll
  courtScroll: {
    marginHorizontal: -SPACING.md,
  },
  courtScrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  courtCard: {
    width: 150,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 4,
  },
  courtCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
    marginBottom: 2,
  },
  courtLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  courtPlayerCount: {
    fontSize: FONT_SIZES.xs,
    color: colors.success,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.2,
  },
  courtName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  courtMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  courtType: {
    fontSize: FONT_SIZES.xs,
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  courtDot: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.4)',
  },
  courtDistance: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.5)',
  },

  // Recent Activity feed
  activityFeed: {
    gap: SPACING.xs,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: SPACING.sm,
  },
  activityAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  activityInfo: {
    flex: 1,
  },
  activityText: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.85)',
  },
  activityName: {
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  activityAction: {
    color: 'rgba(255,255,255,0.6)',
  },
  activityGym: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  activityTime: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
});

export default HomeScreen;
