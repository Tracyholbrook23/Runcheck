import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ title: 'Home' }} />
    </Stack.Navigator>
  );
}

function RunsStack() {
  const { themeStyles, colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen
        name="ViewRunsMain"
        component={ViewRunsScreen}
        options={({ navigation }) => ({
          title: 'Find Runs',
          headerRight: () => (
            <Ionicons
              name="map-outline"
              size={24}
              color={colors.textPrimary}
              onPress={() => navigation.navigate('GymMap')}
              style={{ marginRight: 8 }}
            />
          ),
        })}
      />
      <Stack.Screen name="GymMap" component={GymMapScreen} options={{ title: 'Gym Map' }} />
      <Stack.Screen name="RunDetails" component={RunDetailsScreen} options={{ title: 'Run Details' }} />
    </Stack.Navigator>
  );
}

function CheckInStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="CheckInMain" component={CheckInScreen} options={{ title: 'Check In' }} />
    </Stack.Navigator>
  );
}

function PlanStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="PlanVisitMain" component={PlanVisitScreen} options={{ title: 'Plan a Visit' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  const { themeStyles } = useTheme();
  return (
    <Stack.Navigator screenOptions={themeStyles.NAV_HEADER}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
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

function AppContent() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
