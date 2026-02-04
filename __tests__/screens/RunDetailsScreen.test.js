import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RunDetailsScreen from '../../screens/RunDetailsScreen';

// Mock navigation (RunDetailsScreen uses navigation.getParent()?.navigate for tab switching)
const mockParentNavigate = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  getParent: () => ({ navigate: mockParentNavigate }),
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

// Mock hooks
jest.mock('../../hooks', () => ({
  useGym: jest.fn(() => ({
    gym: mockGym,
    loading: false,
  })),
  useGymPresences: jest.fn(() => ({
    presences: mockPresences,
    loading: false,
    count: mockPresences.length,
  })),
  useGymSchedules: jest.fn(() => ({
    schedules: [],
    schedulesBySlot: {},
    loading: false,
    count: 0,
  })),
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

  it('renders the gym name as title', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('Test Gym - Downtown')).toBeTruthy();
  });

  it('displays the gym address', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('123 Test St')).toBeTruthy();
  });

  it('displays the player count', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('3')).toBeTruthy();
    expect(getByText('Players Here')).toBeTruthy();
  });

  it('displays the section title', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText("Who's Here Now")).toBeTruthy();
  });

  it('displays checked in players', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('John')).toBeTruthy();
    expect(getByText('Jane')).toBeTruthy();
  });

  it('renders Check In Here button', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('Check In Here')).toBeTruthy();
  });

  it('navigates to CheckIn when button is pressed', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Check In Here'));

    expect(mockParentNavigate).toHaveBeenCalledWith('CheckIn');
  });

  it('renders loading state when hooks are loading', () => {
    // Override mock for this test
    const hooks = require('../../hooks');
    hooks.useGym.mockReturnValue({ gym: null, loading: true });
    hooks.useGymPresences.mockReturnValue({ presences: [], loading: true, count: 0 });
    hooks.useGymSchedules.mockReturnValue({ schedules: [], schedulesBySlot: {}, loading: true, count: 0 });

    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} navigation={mockNavigation} />
    );

    expect(getByText('Loading...')).toBeTruthy();

    // Reset mocks
    hooks.useGym.mockReturnValue({ gym: mockGym, loading: false });
    hooks.useGymPresences.mockReturnValue({ presences: mockPresences, loading: false, count: mockPresences.length });
    hooks.useGymSchedules.mockReturnValue({ schedules: [], schedulesBySlot: {}, loading: false, count: 0 });
  });
});
