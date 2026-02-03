import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RunDetailsScreen from '../../screens/RunDetailsScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

// Mock gym data
const mockGym = {
  id: 'gym-1',
  name: 'Test Gym - Downtown',
  address: '123 Test St',
  currentPresenceCount: 3,
};

// Mock presences data
const mockPresences = [
  {
    id: 'presence-1',
    userName: 'John',
    checkedInAt: { toDate: () => new Date(Date.now() - 30 * 60000) }, // 30 mins ago
  },
  {
    id: 'presence-2',
    userName: 'Jane',
    checkedInAt: { toDate: () => new Date(Date.now() - 5 * 60000) }, // 5 mins ago
  },
];

// Mock services
jest.mock('../../services/gymService', () => ({
  subscribeToGym: jest.fn((gymId, callback) => {
    setTimeout(() => callback(mockGym), 0);
    return jest.fn();
  }),
}));

jest.mock('../../services/presenceService', () => ({
  subscribeToGymPresences: jest.fn((gymId, callback) => {
    setTimeout(() => callback(mockPresences), 0);
    return jest.fn();
  }),
}));

jest.mock('../../services/scheduleService', () => ({
  subscribeToGymSchedules: jest.fn((gymId, callback) => {
    setTimeout(() => callback([], {}), 0);
    return jest.fn();
  }),
}));

describe('RunDetailsScreen', () => {
  const mockRoute = {
    params: {
      gymId: 'gym-1',
      gymName: 'Test Gym - Downtown',
      players: 3,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('Loading...')).toBeTruthy();
  });

  it('renders the gym name as title', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Test Gym - Downtown')).toBeTruthy();
    });
  });

  it('displays the gym address', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('123 Test St')).toBeTruthy();
    });
  });

  it('displays the player count', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('3')).toBeTruthy();
      expect(getByText('Players Here')).toBeTruthy();
    });
  });

  it('displays the section title', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText("Who's Here Now")).toBeTruthy();
    });
  });

  it('displays checked in players', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('John')).toBeTruthy();
      expect(getByText('Jane')).toBeTruthy();
    });
  });

  it('renders Check In Here button', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Check In Here')).toBeTruthy();
    });
  });

  it('navigates to CheckIn when button is pressed', async () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Check In Here')).toBeTruthy();
    });

    fireEvent.press(getByText('Check In Here'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('CheckIn');
  });
});
