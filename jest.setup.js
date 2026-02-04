// Jest setup file
import '@testing-library/react-native/extend-expect';

// Mock @react-navigation/bottom-tabs
jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) => React.createElement(View, null, children),
      Screen: ({ children }) => React.createElement(View, null, children),
    }),
  };
});

// Mock react-native-dropdown-picker
jest.mock('react-native-dropdown-picker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockDropDownPicker({ placeholder, value, items }) {
    return (
      <View testID="dropdown-picker">
        <Text>{value || placeholder}</Text>
      </View>
    );
  };
});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  getReactNativePersistence: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({
    currentUser: null,
  })),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  setDoc: jest.fn(),
  doc: jest.fn(),
}));

// Mock image assets
jest.mock('./assets/hoop-icon.png', () => 'hoop-icon.png');

// Suppress console warnings during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    args[0]?.includes?.('Animated') ||
    args[0]?.includes?.('componentWillReceiveProps')
  ) {
    return;
  }
  originalWarn(...args);
};

// Mock alert
global.alert = jest.fn();
