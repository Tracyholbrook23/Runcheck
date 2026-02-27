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
 *   - LIVE Indicator   — Compact banner showing total active players and
 *                        the hottest court; hidden when totalActive === 0;
 *                        tapping navigates to the hottest court's RunDetails
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

import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, SHADOWS, FONT_WEIGHTS } from '../constants/theme';
import { useTheme } from '../contexts';
import { usePresence, useGyms } from '../hooks';
import { Logo } from '../components';
import { db, auth } from '../config/firebase';
import { collection, query, orderBy, limit, where, onSnapshot, doc } from 'firebase/firestore';

/**
 * BlinkingDot — A small green dot that pulses its opacity when `active` is
 * true and renders as a plain static dot when `active` is false.
 *
 * Reused for both the LIVE indicator banner and each Hot Courts card dot.
 * Accepts the caller's existing dot style so dimensions and color stay
 * consistent with `liveBannerDot` / `courtLiveDot`.
 *
 * @param {{ active: boolean, style: object }} props
 */
const BlinkingDot = ({ active, style }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.2,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      opacity.setValue(1);
    }
  }, [active]);

  if (!active) {
    return <View style={style} />;
  }
  return <Animated.View style={[style, { opacity }]} />;
};

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

  const [activityFeed, setActivityFeed] = useState([]);
  const [friendIds, setFriendIds] = useState([]);

  // Subscribe to the current user's friends list in real time.
  useEffect(() => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', currentUid),
      (snap) => { setFriendIds(snap.exists() ? (snap.data().friends ?? []) : []); },
      () => { setFriendIds([]); }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to activity documents from the last 2 hours in real time.
  // The cutoff is computed once on mount; Firestore evaluates it server-side.
  useEffect(() => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'activity'),
      where('createdAt', '>=', twoHoursAgo),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setActivityFeed(items);
      },
      (error) => {
        console.error('Error subscribing to activity feed:', error);
        setActivityFeed([]);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * getRelativeTime — Converts a Firestore Timestamp (or Date) to a short
   * human-readable relative string like "3m ago" or "2h ago".
   *
   * @param {import('firebase/firestore').Timestamp|Date|null} timestamp
   * @returns {string}
   */
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

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

  // Sum of currentPresenceCount across all gyms for the live badge
  const totalActive = gyms.reduce((sum, g) => sum + (g.currentPresenceCount || 0), 0);

  // Gym with the highest currentPresenceCount — used by the LIVE indicator
  const hottestGym = gyms.length > 0
    ? gyms.reduce(
        (best, g) => (g.currentPresenceCount || 0) > (best.currentPresenceCount || 0) ? g : best,
        gyms[0]
      )
    : null;

  // Partition the feed into friends vs. community
  const friendsActivity = activityFeed.filter((item) => friendIds.includes(item.userId));
  const communityActivity = activityFeed.filter((item) => !friendIds.includes(item.userId));

  // Shared row renderer — used by Recent Activity section (taps go to UserProfile)
  const renderActivityRow = (item) => (
    <TouchableOpacity
      key={item.id}
      activeOpacity={0.75}
      onPress={() => {
        console.log('🏀 [Activity] Row tapped — full item:', JSON.stringify(item));
        if (!item.userId) {
          console.warn('⚠️ [Activity] item.userId is missing, cannot navigate');
          return;
        }
        try {
          console.log('🏀 [Activity] Calling navigation.push UserProfile with userId:', item.userId);
          navigation.push('UserProfile', { userId: item.userId });
          console.log('🏀 [Activity] navigation.push called successfully');
        } catch (err) {
          console.error('❌ [Activity] navigation.push threw:', err);
        }
      }}
    >
      <BlurView intensity={40} tint="dark" style={styles.activityRow}>
        {item.userAvatar ? (
          <Image source={{ uri: item.userAvatar }} style={styles.activityAvatar} />
        ) : (
          <View style={[styles.activityAvatar, styles.activityAvatarPlaceholder]}>
            <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        <View style={styles.activityInfo}>
          <Text style={styles.activityText} numberOfLines={1}>
            <Text style={styles.activityName}>{item.userName}</Text>
            <Text style={styles.activityAction}>{' '}{item.action}{' '}</Text>
            <Text style={styles.activityGym}>{item.gymName}</Text>
          </Text>
          <Text style={styles.activityTime}>{getRelativeTime(item.createdAt)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
      </BlurView>
    </TouchableOpacity>
  );

  // Friends Activity row renderer — row taps go to RunDetails; avatar tap goes to UserProfile
  const renderFriendActivityRow = (item) => {
    const timeLabel = getRelativeTime(item.createdAt);
    const isJustNow = timeLabel === 'just now';

    const navigateToGym = () => {
      if (item.gymId) {
        navigation.getParent()?.navigate('Runs', {
          screen: 'RunDetails',
          params: { gymId: item.gymId, gymName: item.gymName },
        });
      } else if (item.userId) {
        console.warn('⚠️ [FriendsActivity] gymId missing, falling back to UserProfile');
        navigation.push('UserProfile', { userId: item.userId });
      } else {
        console.warn('⚠️ [FriendsActivity] gymId and userId both missing, cannot navigate');
      }
    };

    const navigateToUser = () => {
      if (!item.userId) {
        console.warn('⚠️ [FriendsActivity] userId missing on avatar tap');
        return;
      }
      navigation.push('UserProfile', { userId: item.userId });
    };

    return (
      <TouchableOpacity key={item.id} activeOpacity={0.75} onPress={navigateToGym}>
        <BlurView intensity={40} tint="dark" style={styles.activityRow}>
          <TouchableOpacity onPress={navigateToUser} activeOpacity={0.75}>
            {item.userAvatar ? (
              <Image source={{ uri: item.userAvatar }} style={styles.activityAvatar} />
            ) : (
              <View style={[styles.activityAvatar, styles.activityAvatarPlaceholder]}>
                <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.activityInfo}>
            <Text style={styles.activityText} numberOfLines={1}>
              <Text style={styles.activityName}>{item.userName}</Text>
              <Text style={styles.activityAction}>{' '}{item.action}{' '}</Text>
              <Text style={styles.activityGym}>{item.gymName}</Text>
            </Text>
            <Text style={[styles.activityTime, isJustNow && styles.activityTimeJustNow]}>
              {timeLabel}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
        </BlurView>
      </TouchableOpacity>
    );
  };

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
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => navigation.navigate('Leaderboard')}
            >
              <Ionicons name="trophy-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => goToTab('Profile')}
            >
              <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
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

          {/*
           * LIVE Indicator — compact banner shown above Hot Courts when any
           * player is currently active. Tapping navigates to the hottest
           * court's RunDetails screen. Renders nothing when totalActive === 0.
           */}
          {totalActive > 0 && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (hottestGym && (hottestGym.currentPresenceCount || 0) > 0) {
                  navigation.getParent()?.navigate('Runs', {
                    screen: 'RunDetails',
                    params: {
                      gymId: hottestGym.id,
                      gymName: hottestGym.name,
                      imageUrl: hottestGym.imageUrl,
                    },
                  });
                }
              }}
            >
              <BlurView intensity={40} tint="dark" style={styles.liveBanner}>
                <View style={styles.liveBannerTop}>
                  <BlinkingDot active={totalActive > 0} style={styles.liveBannerDot} />
                  <Text style={styles.liveBannerLabel}>🔥 LIVE</Text>
                  <Text style={styles.liveBannerCount}> · {totalActive} playing right now</Text>
                </View>
                {hottestGym && (hottestGym.currentPresenceCount || 0) > 0 && (
                  <Text style={styles.liveBannerSub}>
                    {'Top court: '}
                    <Text style={styles.liveBannerGym}>{hottestGym.name}</Text>
                    {` (${hottestGym.currentPresenceCount})`}
                  </Text>
                )}
              </BlurView>
            </TouchableOpacity>
          )}

          {/* Hot Courts — horizontal scroll of nearby active gyms */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Hot Courts Near You</Text>
            {totalActive > 0 && (
              <View style={styles.liveActivity}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{totalActive} active</Text>
              </View>
            )}
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
                    <BlinkingDot
                      active={(gym.currentPresenceCount || 0) > 0}
                      style={styles.courtLiveDot}
                    />
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

          {/* Friends Activity feed — only shown when friends have recent activity */}
          {friendsActivity.length > 0 && (
            <>
              <Text style={styles.sectionTitleStandalone}>Friends Activity ({friendsActivity.length})</Text>
              <View style={styles.activityFeed}>
                {friendsActivity.map(renderFriendActivityRow)}
              </View>
            </>
          )}

          {/* Recent Activity feed — community items (non-friends), or full feed if no friends activity */}
          <Text style={styles.sectionTitleStandalone}>Recent Activity</Text>
          <View style={styles.activityFeed}>
            {(friendsActivity.length > 0 ? communityActivity : activityFeed).length === 0 ? (
              <BlurView intensity={40} tint="dark" style={styles.activityRow}>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTime}>No recent activity yet</Text>
                </View>
              </BlurView>
            ) : (
              (friendsActivity.length > 0 ? communityActivity : activityFeed).map(renderActivityRow)
            )}
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
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 44,
    height: 44,
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

  // LIVE Indicator banner — compact BlurView strip above Hot Courts
  liveBanner: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
    marginTop: SPACING.xl,
    gap: 4,
  },
  liveBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  liveBannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveBannerLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  liveBannerCount: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  liveBannerSub: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  liveBannerGym: {
    color: colors.primary,
    fontWeight: FONT_WEIGHTS.semibold,
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
  activityAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
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
  activityTimeJustNow: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default HomeScreen;
