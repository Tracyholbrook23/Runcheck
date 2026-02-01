import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CheckInScreen from '../../screens/CheckInScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

// Mock firebase auth
jest.mock('../../config/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
}));

// Mock gyms data
const mockGyms = [
  { id: 'gym-1', name: 'LA Fitness', currentPresenceCount: 3 },
  { id: 'gym-2', name: 'YMCA', currentPresenceCount: 0 },
];

// Mock services
jest.mock('../../services/gymService', () => ({
  getAllGyms: jest.fn(() => Promise.resolve(mockGyms)),
  seedGyms: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/presenceService', () => ({
  getActivePresence: jest.fn(() => Promise.resolve(null)),
  checkIn: jest.fn(() => Promise.resolve({ id: 'presence-1' })),
}));

describe('CheckInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Loading gyms...')).toBeTruthy();
  });

  it('renders the title after loading', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Check Into a Gym')).toBeTruthy();
    });
  });

  it('renders the subtitle', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText("Let others know you're here to play")).toBeTruthy();
    });
  });

  it('renders the gym selection label', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Select Gym:')).toBeTruthy();
    });
  });

  it('renders the Check In button', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Check In')).toBeTruthy();
    });
  });

  it('renders the Back to Home button', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Back to Home')).toBeTruthy();
    });
  });

  it('navigates to Home when Back to Home is pressed', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Back to Home')).toBeTruthy();
    });

    fireEvent.press(getByText('Back to Home'));

    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });

  it('renders info box about expiry', async () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText(/automatically expire after 3 hours/)).toBeTruthy();
    });
  });
});
