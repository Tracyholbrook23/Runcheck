import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './screens/HomeScreen';
import SignupScreen from './screens/SignupScreen';
import LoginScreen from './screens/LoginScreen';
import ViewRunsScreen from './screens/ViewRunsScreen';
import CheckInScreen from './screens/CheckInScreen';
import RunDetailsScreen from './screens/RunDetailsScreen';
import PlanVisitScreen from './screens/PlanVisitScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="ViewRuns" component={ViewRunsScreen} />
        <Stack.Screen name="CheckIn" component={CheckInScreen} />
        <Stack.Screen name="RunDetails" component={RunDetailsScreen} />
        <Stack.Screen name="PlanVisit" component={PlanVisitScreen} options={{ title: 'Plan a Visit' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
