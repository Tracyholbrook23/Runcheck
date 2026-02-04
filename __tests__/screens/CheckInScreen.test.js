import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import CheckInScreen from '../../screens/CheckInScreen';

// Mock navigation (CheckInScreen uses navigation.getParent()?.navigate for tab switching)
const mockParentNavigate = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  getParent: () => ({ navigate: mockParentNavigate }),
};

// Mock gyms data
const mockGyms = [
  { id: 'cowboys-fit-pflugerville', name: 'Cowboys Fit - Pflugerville', type: 'indoor', currentPresenceCount: 3 },
];

// Mock hooks
jest.mock('../../hooks', () => ({
  usePresence: jest.fn(() => ({
    presence: null,
    loading: false,
    isCheckedIn: false,
    checkIn: jest.fn(() => Promise.resolve({ id: 'presence-1' })),
    checkingIn: false,
    getTimeRemaining: jest.fn(() => '2h 30m'),
  })),
  useGyms: jest.fn(() => ({
    gyms: mockGyms,
    loading: false,
    ensureGymsExist: jest.fn(),
  })),
  useLocation: jest.fn(() => ({
    getCurrentLocation: jest.fn(() => Promise.resolve({ latitude: 30.4692, longitude: -97.5963 })),
    loading: false,
  })),
}));

describe('CheckInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Check Into a Gym')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText("Let others know you're here to play")).toBeTruthy();
  });

  it('renders the gym selection label', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Select Gym:')).toBeTruthy();
  });

  it('renders the Check In button', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Check In')).toBeTruthy();
  });

  it('renders the Back to Home button', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Back to Home')).toBeTruthy();
  });

  it('navigates to Home when Back to Home is pressed', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Back to Home'));

    expect(mockParentNavigate).toHaveBeenCalledWith('Home');
  });

  it('renders info box about expiry', () => {
    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText(/automatically expire after 3 hours/)).toBeTruthy();
  });

  it('shows loading state when gyms are loading', () => {
    // Override mock for this test
    const hooks = require('../../hooks');
    hooks.useGyms.mockReturnValue({ gyms: [], loading: true, ensureGymsExist: jest.fn() });
    hooks.usePresence.mockReturnValue({
      presence: null,
      loading: true,
      isCheckedIn: false,
      checkIn: jest.fn(),
      checkingIn: false,
      getTimeRemaining: jest.fn(),
    });

    const { getByText } = renderWithTheme(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Loading gyms...')).toBeTruthy();

    // Reset mocks
    hooks.useGyms.mockReturnValue({ gyms: mockGyms, loading: false, ensureGymsExist: jest.fn() });
    hooks.usePresence.mockReturnValue({
      presence: null,
      loading: false,
      isCheckedIn: false,
      checkIn: jest.fn(),
      checkingIn: false,
      getTimeRemaining: jest.fn(),
    });
  });
});
