/**
 * App.js — Root Application Entry Point
 *
 * Defines the entire navigation structure for RunCheck using React Navigation.
 * The app uses a two-layer navigation model:
 *
 *   Root Stack (no header):
 *     ├── Splash    → Animated intro screen
 *     ├── Login     → Email/password sign-in
 *     ├── Signup    → New account registration
 *     ├── Onboarding → Welcome → HomeCourt → Finish (first-time only)
 *     └── Main       → MainTabs (authenticated shell)
 *
 *   MainTabs (bottom tab navigator):
 *     ├── Home      → HomeStack  (HomeScreen)
 *     ├── Runs      → RunsStack  (ViewRuns → GymMap | RunDetails → GymReviews)
 *     ├── CheckIn   → CheckInStack
 *     ├── Plan      → PlanStack
 *     └── Profile   → ProfileStack
 *
 * ThemeProvider wraps the entire tree so every screen and navigator can
 * access the current color palette and toggle dark/light mode.
 */

import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import HomeScreen from './screens/HomeScreen';
import SignupScreen from './screens/SignupScreen';
import LoginScreen from './screens/LoginScreen';
import ViewRunsScreen from './screens/ViewRunsScreen';
import CheckInScreen from './screens/CheckInScreen';
import RunDetailsScreen from './screens/RunDetailsScreen';
import TrimClipScreen from './screens/TrimClipScreen';
import RecordClipScreen from './screens/RecordClipScreen';
import PlanVisitScreen from './screens/PlanVisitScreen';
import GymMapScreen from './screens/GymMapScreen';
import ProfileScreen from './screens/ProfileScreen';
import { ThemeProvider, useTheme } from './contexts';
import SplashScreen from './screens/SplashScreen';
import GymReviewsScreen from './screens/GymReviewsScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import ClaimUsernameScreen from './screens/ClaimUsernameScreen';
import SettingsScreen from './screens/SettingsScreen';
import SearchUsersScreen from './screens/SearchUsersScreen';
import OnboardingRegionScreen from './screens/OnboardingRegionScreen';
import OnboardingWelcomeScreen from './screens/OnboardingWelcomeScreen';
import OnboardingHomeCourtScreen from './screens/OnboardingHomeCourtScreen';
import OnboardingFinishScreen from './screens/OnboardingFinishScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import ClipPlayerScreen from './screens/ClipPlayerScreen';
import PremiumScreen from './screens/PremiumScreen';
import RequestGymScreen from './screens/RequestGymScreen';
import MyGymRequestsScreen from './screens/MyGymRequestsScreen';
import AdminToolsScreen from './screens/AdminToolsScreen';
import AdminGymRequestsScreen from './screens/AdminGymRequestsScreen';
import AdminGymRequestDetailScreen from './screens/AdminGymRequestDetailScreen';
import AdminReportsScreen from './screens/AdminReportsScreen';
import AdminSuspendedUsersScreen from './screens/AdminSuspendedUsersScreen';
import AdminHiddenClipsScreen from './screens/AdminHiddenClipsScreen';
import AdminFeaturedClipsScreen from './screens/AdminFeaturedClipsScreen';
import AdminAllClipsScreen from './screens/AdminAllClipsScreen';
import MyReportsScreen from './screens/MyReportsScreen';
import CreatePrivateRunScreen from './screens/CreatePrivateRunScreen';
import RunChatScreen from './screens/RunChatScreen';
import MessagesScreen from './screens/MessagesScreen';
import DMConversationScreen from './screens/DMConversationScreen';
import { registerPushToken } from './utils/notifications';

// ─── Navigation Ref ───────────────────────────────────────────────────────────
// Module-level ref so the notification tap handler (inside App, outside the
// NavigationContainer tree) can imperatively navigate to any screen.
const navigationRef = createNavigationContainerRef();

// ─── Global Notification Handler ──────────────────────────────────────────────
// Must be set at module level (outside any component) so it is registered
// before the first notification can arrive. Without this, iOS silently drops
// foreground notifications; background / closed state notifications may also
// fail to present depending on the iOS version.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,   // show the banner at top of screen (iOS 14+)
    shouldShowList: true,     // show in Notification Centre
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator();
const Tab = createMaterialTopTabNavigator();

/**
 * HomeStack — Stack navigator for the Home tab.
 *
 * Currently contains only HomeScreen. Wrapped in its own stack so the
 * tab bar's header theme tokens are applied consistently via `themeStyles.NAV_HEADER`.
 *
 * @returns {JSX.Element} Stack navigator with HomeScreen as the sole route.
 */
function HomeStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ClipPlayer" component={ClipPlayerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SearchUsers" component={SearchUsersScreen} options={{ title: 'Find Players', headerBackTitle: 'Home', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: 'Messages', headerBackTitle: 'Home', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="DMConversation" component={DMConversationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RunChat" component={RunChatScreen} options={{ headerBackTitle: 'Messages', ...themeStyles.NAV_HEADER }} />
    </Stack.Navigator>
  );
}

/**
 * RunsStack — Stack navigator for the Runs tab.
 *
 * Manages the gym-browsing flow:
 *   ViewRunsMain → GymMap (optional detour to map view)
 *   ViewRunsMain → RunDetails → GymReviews
 *
 * @returns {JSX.Element} Stack navigator with four gym-related screens.
 */
function RunsStack() {
  const { themeStyles, colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen
        name="ViewRunsMain"
        component={ViewRunsScreen}
        options={{
          headerShown: false,
          title: 'Runs',
        }}
      />
      <Stack.Screen name="GymMap" component={GymMapScreen} options={{ title: 'Gym Map' }} />
      <Stack.Screen name="RunDetails" component={RunDetailsScreen} options={{ title: 'Run Details' }} />
      <Stack.Screen name="CreatePrivateRun" component={CreatePrivateRunScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Premium" component={PremiumScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RecordClipScreen" component={RecordClipScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TrimClipScreen" component={TrimClipScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GymReviews" component={GymReviewsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ClipPlayer" component={ClipPlayerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RequestGym" component={RequestGymScreen} options={{ title: 'Request a Gym' }} />
      <Stack.Screen name="RunChat" component={RunChatScreen} options={{ headerBackTitle: 'Messages', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="DMConversation" component={DMConversationScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

/**
 * CheckInStack — Stack navigator for the Check In tab.
 *
 * Single-screen stack. Wrapping in a Stack lets us inherit the themed
 * header styles even though CheckIn hides its own header in useEffect.
 *
 * @returns {JSX.Element} Stack navigator with CheckInScreen.
 */
function CheckInStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="CheckInMain" component={CheckInScreen} options={{ title: 'Check In' }} />
    </Stack.Navigator>
  );
}

/**
 * PlanStack — Stack navigator for the Plan a Visit tab.
 *
 * Hosts the multi-step gym scheduling wizard (PlanVisitScreen).
 *
 * @returns {JSX.Element} Stack navigator with PlanVisitScreen.
 */
function PlanStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="PlanVisitMain" component={PlanVisitScreen} options={{ title: 'Plan a Visit' }} />
    </Stack.Navigator>
  );
}

/**
 * ProfileStack — Stack navigator for the Profile tab.
 *
 * ProfileScreen manages its own header-free layout, so no shared
 * header options are applied here.
 *
 * @returns {JSX.Element} Stack navigator with ProfileScreen.
 */
function ProfileStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Premium" component={PremiumScreen} options={{ headerShown: false }} />
      {/* Required so leaderboard row taps can navigate to UserProfile from the Profile tab */}
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings', headerBackTitle: 'Profile', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="SearchUsers" component={SearchUsersScreen} options={{ title: 'Find Players', headerBackTitle: 'Profile', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="MyGymRequests" component={MyGymRequestsScreen} options={{ title: 'My Gym Requests', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="MyReports" component={MyReportsScreen} options={{ title: 'My Reports', headerBackTitle: 'Settings', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminTools" component={AdminToolsScreen} options={{ title: 'Admin Tools', headerBackTitle: 'Profile', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminGymRequests" component={AdminGymRequestsScreen} options={{ title: 'Gym Requests', headerBackTitle: 'Admin Tools', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminGymRequestDetail" component={AdminGymRequestDetailScreen} options={{ title: 'Request Detail', headerBackTitle: 'Requests', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminReports" component={AdminReportsScreen} options={{ title: 'Reports', headerBackTitle: 'Admin Tools', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminSuspendedUsers" component={AdminSuspendedUsersScreen} options={{ title: 'Suspended Users', headerBackTitle: 'Admin Tools', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminHiddenClips" component={AdminHiddenClipsScreen} options={{ title: 'Hidden Clips', headerBackTitle: 'Admin Tools', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminFeaturedClips" component={AdminFeaturedClipsScreen} options={{ title: 'Featured Clips', headerBackTitle: 'Admin Tools', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="AdminAllClips" component={AdminAllClipsScreen} options={{ title: 'All Clips', headerBackTitle: 'Admin Tools', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="ClipPlayer" component={ClipPlayerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: 'Messages', headerBackTitle: 'Profile', ...themeStyles.NAV_HEADER }} />
      <Stack.Screen name="DMConversation" component={DMConversationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RunChat" component={RunChatScreen} options={{ headerBackTitle: 'Messages', ...themeStyles.NAV_HEADER }} />
    </Stack.Navigator>
  );
}

/**
 * MainTabs — Bottom tab navigator shown after authentication.
 *
 * @returns {JSX.Element} Bottom tab navigator with five top-level tabs.
 */
function MainTabs() {
  const { colors } = useTheme();

  useEffect(() => {
    registerPushToken();
  }, []);

  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      screenOptions={({ route }) => ({
        headerShown: false,
        swipeEnabled: true,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 0,
          height: 80,
          paddingBottom: 14,
          paddingTop: 10,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIndicatorStyle: {
          height: 0,
        },
        tabBarIcon: ({ color }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Runs') iconName = 'basketball-outline';
          else if (route.name === 'CheckIn') iconName = 'log-in-outline';
          else if (route.name === 'Plan') iconName = 'calendar-outline';
          else if (route.name === 'Profile') iconName = 'person-outline';
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen
        name="Runs"
        component={RunsStack}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Runs', { screen: 'ViewRunsMain' });
          },
        })}
      />
      <Tab.Screen name="CheckIn" component={CheckInStack} options={{ title: 'Check In' }} />
      <Tab.Screen name="Plan" component={PlanStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

/**
 * AppContent — Root navigation tree.
 *
 * Renders the NavigationContainer and the top-level root stack.
 * This component is intentionally separate from `App` so it can sit
 * inside `ThemeProvider` and call `useTheme` through child navigators.
 *
 * @returns {JSX.Element} NavigationContainer wrapping the full app flow.
 */
function AppContent() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="ClaimUsername" component={ClaimUsernameScreen} />
        <Stack.Screen name="OnboardingRegion" component={OnboardingRegionScreen} />
        <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcomeScreen} />
        <Stack.Screen name="OnboardingHomeCourt" component={OnboardingHomeCourtScreen} />
        <Stack.Screen name="OnboardingFinish" component={OnboardingFinishScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * App — Application root component.
 *
 * Wraps everything in `ThemeProvider` so that dark/light mode state and
 * the derived color tokens are available throughout the entire component
 * tree via `useTheme()`.
 *
 * @returns {JSX.Element} The fully themed and navigable RunCheck app.
 */
export default function App() {
  // ─── Notification Debug Listeners ─────────────────────────────────────────
  // These listeners are wired up at the root level so they fire regardless of
  // which screen is active.  They are for debugging the push pipeline and as
  // foundation for future in-app notification handling (e.g. navigating on tap).
  //
  // addNotificationReceivedListener   — fires when a notification arrives while
  //   the app is FOREGROUNDED. (Background/closed notifications are presented
  //   by iOS directly; this listener will NOT fire for those.)
  //
  // addNotificationResponseReceivedListener — fires when the user TAPS a
  //   notification (foreground, background, or closed state).  This is the
  //   correct hook for handling notification taps in all app states.
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        if (__DEV__) {
          console.log('[Notifications] received (foreground):', {
            title: notification.request.content.title,
            body: notification.request.content.body,
            data: notification.request.content.data,
          });
        }
      }
    );

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        if (__DEV__) {
          console.log('[Notifications] tapped by user:', {
            title: response.notification.request.content.title,
            body: response.notification.request.content.body,
            data,
            actionIdentifier: response.actionIdentifier,
          });
        }

        // ── DM notification tap: navigate to the conversation ─────────────
        // data.type === 'dm' is set by the onDmMessageCreated Cloud Function.
        // Navigate into HomeStack › DMConversation so the user can reply.
        if (data?.type === 'dm' && data?.conversationId && navigationRef.isReady()) {
          navigationRef.navigate('Main', {
            screen: 'Home',
            params: {
              screen: 'DMConversation',
              params: {
                conversationId: data.conversationId,
                otherUserId: data.senderId ?? null,
                otherUserName: data.senderName ?? 'Player',
                otherUserAvatar: null,
              },
            },
          });
        }
      }
    );

    // Clean up both subscriptions when the root component unmounts.
    // In practice the root never unmounts during normal use, but this keeps
    // the pattern correct for testing and future refactors.
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
