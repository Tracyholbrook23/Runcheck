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
import ProfileScreen from './screens/ProfileScreen';
import { COLORS, NAV_HEADER } from './constants/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={NAV_HEADER}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ title: 'Home' }} />
    </Stack.Navigator>
  );
}

function RunsStack() {
  return (
    <Stack.Navigator screenOptions={NAV_HEADER}>
      <Stack.Screen name="ViewRunsMain" component={ViewRunsScreen} options={{ title: 'Find Runs' }} />
      <Stack.Screen name="RunDetails" component={RunDetailsScreen} options={{ title: 'Run Details' }} />
    </Stack.Navigator>
  );
}

function CheckInStack() {
  return (
    <Stack.Navigator screenOptions={NAV_HEADER}>
      <Stack.Screen name="CheckInMain" component={CheckInScreen} options={{ title: 'Check In' }} />
    </Stack.Navigator>
  );
}

function PlanStack() {
  return (
    <Stack.Navigator screenOptions={NAV_HEADER}>
      <Stack.Screen name="PlanVisitMain" component={PlanVisitScreen} options={{ title: 'Plan a Visit' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={NAV_HEADER}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.tabActive,
        tabBarInactiveTintColor: COLORS.tabInactive,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
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

export default function App() {
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
