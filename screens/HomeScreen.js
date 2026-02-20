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
import { usePresence } from '../hooks';
import { Logo } from '../components';

const HomeScreen = ({ navigation }) => {
  const { colors, isDark, themeStyles } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

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

  const fakeHotCourts = [
    { id: 'fake1', name: 'Pan American Recreation Center', players: 10, type: 'Indoor', plannedToday: 5,  plannedTomorrow: 8,  imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlugK3VDdlosE9o97HH-NdRI89Eww_GHZaHQ&s' },
    { id: 'fake2', name: 'Life Time Austin North',         players: 9,  type: 'Indoor', plannedToday: 7,  plannedTomorrow: 12, imageUrl: 'https://media.lifetime.life/is/image/lifetimeinc/fso-gymnasium-01-1?crop=362,224,1360,1088&id=1701881564012&fit=crop,1&wid=390' },
    { id: 'fake3', name: "Gold's Gym Hester's Crossing",   players: 12, type: 'Indoor', plannedToday: 3,  plannedTomorrow: 6,  imageUrl: 'https://res.cloudinary.com/ggus-dev/image/private/s--HzKSnHnn--/c_auto%2Cg_center%2Cw_1200%2Ch_800/v1/25fcf1e9/austin-hesters-crossing-basketball.webp?_a=BAAAV6DQ' },
    { id: 'fake4', name: 'Clay Madsen Recreation Center',  players: 5,  type: 'Indoor', plannedToday: 4,  plannedTomorrow: 9,  imageUrl: 'https://s3-media0.fl.yelpcdn.com/bphoto/R1OXLFLx0N6gUT2rNfqLoA/348s.jpg' },
  ];

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
      {/* Dark overlay */}
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
          {/* Welcome */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>Find Your{'\n'}Next Run</Text>
            <Text style={styles.welcomeSubtitle}>Join a pickup run near you</Text>
          </View>

          {/* Presence Card */}
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

          {/* Quick Actions */}
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

          {/* Hot Courts Near You */}
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
            {fakeHotCourts.map((court) => (
              <TouchableOpacity
                key={court.id}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.getParent()?.navigate('Runs', {
                    screen: 'RunDetails',
                    params: {
                      gymId: court.id,
                      gymName: court.name,
                      players: court.players,
                      imageUrl: court.imageUrl,
                      plannedToday: court.plannedToday,
                      plannedTomorrow: court.plannedTomorrow,
                    },
                  })
                }
              >
                <BlurView intensity={60} tint="dark" style={styles.courtCard}>
                  <View style={styles.courtCardTop}>
                    <View style={styles.courtLiveDot} />
                    <Text style={styles.courtPlayerCount}>{court.players} playing</Text>
                  </View>
                  <Text style={styles.courtName}>{court.name}</Text>
                  <View style={styles.courtMeta}>
                    <Text style={styles.courtType}>{court.type}</Text>
                    <Text style={styles.courtDot}> · </Text>
                    <Text style={styles.courtDistance}>+{court.plannedToday} today</Text>
                  </View>
                </BlurView>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Recent Activity */}
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

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Built for hoopers. Powered by community.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

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

  // Hot Courts
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

  // Recent Activity
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