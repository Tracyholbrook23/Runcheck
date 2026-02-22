import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import ProfileScreen from '../../screens/ProfileScreen';
import { getDoc } from 'firebase/firestore';

// Mock navigation
const mockReset = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  getParent: () => ({
    getParent: () => ({ reset: mockReset }),
  }),
};

// Mock hooks
jest.mock('../../hooks', () => ({
  useAuth: jest.fn(() => ({
    user: { uid: 'user-123', email: 'player@test.com' },
    loading: false,
  })),
  useReliability: jest.fn(() => ({
    score: 85,
    tier: { tier: 'good', label: 'Good', color: '#8bc34a' },
    stats: {
      totalScheduled: 10,
      totalAttended: 8,
      totalNoShow: 1,
      totalCancelled: 1,
      attendanceRate: 80,
    },
    loading: false,
  })),
  useSchedules: jest.fn(() => ({
    schedules: [{ id: 's1' }, { id: 's2' }],
    count: 2,
    loading: false,
  })),
  usePresence: jest.fn(() => ({
    presence: null,
    isCheckedIn: false,
    loading: false,
  })),
}));

// Mock Firestore getDoc to return user profile
beforeEach(() => {
  jest.clearAllMocks();
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({
      name: 'Tracy',
      age: '25',
      skillLevel: 'Competitive',
      email: 'player@test.com',
    }),
  });
});

describe('ProfileScreen', () => {
  it('renders user name and email', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Tracy')).toBeTruthy();
    });
    expect(getByText('player@test.com')).toBeTruthy();
  });

  it('displays skill level badge', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Competitive')).toBeTruthy();
    });
  });

  it('displays reliability score and tier', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('85')).toBeTruthy();
    });
    expect(getByText('/100')).toBeTruthy();
    expect(getByText('Good')).toBeTruthy();
  });

  it('displays session stats', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('10')).toBeTruthy();
    });
    expect(getByText('8')).toBeTruthy();
    expect(getByText('Scheduled')).toBeTruthy();
    expect(getByText('Attended')).toBeTruthy();
    expect(getByText('No-Shows')).toBeTruthy();
    expect(getByText('Cancelled')).toBeTruthy();
  });

  it('displays attendance rate when sessions exist', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Attendance Rate')).toBeTruthy();
    });
    expect(getByText('80%')).toBeTruthy();
  });

  it('displays upcoming session count', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('2 upcoming sessions')).toBeTruthy();
    });
  });

  it('shows "Not checked in" when user is not at a gym', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Not checked in')).toBeTruthy();
    });
  });

  it('shows checked-in status when user is at a gym', async () => {
    const hooks = require('../../hooks');
    hooks.usePresence.mockReturnValue({
      presence: { gymName: 'Cowboys Fit' },
      isCheckedIn: true,
      loading: false,
    });

    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Cowboys Fit')).toBeTruthy();
    });

    // Reset
    hooks.usePresence.mockReturnValue({
      presence: null,
      isCheckedIn: false,
      loading: false,
    });
  });

  it('has a dark mode toggle', async () => {
    const { getByTestId } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByTestId('dark-mode-toggle')).toBeTruthy();
    });
  });

  it('shows sign out button', async () => {
    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Sign Out')).toBeTruthy();
    });
  });

  it('shows confirmation alert on sign out press', async () => {
    jest.spyOn(Alert, 'alert');

    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Sign Out')).toBeTruthy();
    });

    fireEvent.press(getByText('Sign Out'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Sign Out',
      'Are you sure you want to sign out?',
      expect.any(Array)
    );
  });

  it('shows fallback name when profile fails to load', async () => {
    getDoc.mockResolvedValue({
      exists: () => false,
      data: () => null,
    });

    const { getByText } = renderWithTheme(
      <ProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Player')).toBeTruthy();
    });
  });
});
