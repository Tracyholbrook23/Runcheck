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
 *     ├── CityGate  → One-time city availability gate (shown after signup)
 *     └── Main      → MainTabs (authenticated shell)
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

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from './screens/HomeScreen';
import SignupScreen from './screens/SignupScreen';
import LoginScreen from './screens/LoginScreen';
import ViewRunsScreen from './screens/ViewRunsScreen';
import CheckInScreen from './screens/CheckInScreen';
import RunDetailsScreen from './screens/RunDetailsScreen';
import PlanVisitScreen from './screens/PlanVisitScreen';
import GymMapScreen from './screens/GymMapScreen';
import ProfileScreen from './screens/ProfileScreen';
import { ThemeProvider, useTheme } from './contexts';
import SplashScreen from './screens/SplashScreen';
import GymReviewsScreen from './screens/GymReviewsScreen';
import CityGateScreen from './screens/CityGateScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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
        }}
      />
      <Stack.Screen name="GymMap" component={GymMapScreen} options={{ title: 'Gym Map' }} />
      <Stack.Screen name="RunDetails" component={RunDetailsScreen} options={{ title: 'Run Details' }} />
      <Stack.Screen name="GymReviews" component={GymReviewsScreen} options={{ headerShown: false }} />
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
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

/**
 * MainTabs — Bottom tab navigator shown after authentication.
 *
 * Reads the active theme's color tokens to style the tab bar so it
 * respects dark/light mode without a full re-mount. Tab icons are
 * resolved from the route name using a simple lookup inside
 * `tabBarIcon`.
 *
 * @returns {JSX.Element} Bottom tab navigator with five top-level tabs.
 */
function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
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
        // Map each tab's route name to an Ionicons icon name
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Runs') iconName = 'basketball-outline';
          else if (route.name === 'CheckIn') iconName = 'log-in-outline';
          else if (route.name === 'Plan') iconName = 'calendar-outline';
          else if (route.name === 'Profile') iconName = 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Runs" component={RunsStack} />
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="CityGate" component={CityGateScreen} />
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
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
