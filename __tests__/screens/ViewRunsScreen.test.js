import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import ViewRunsScreen from '../../screens/ViewRunsScreen';

// Mock gym data
const mockGyms = [
  {
    id: 'gym-1',
    name: 'LA Fitness - Southside',
    address: '123 Southside Ave',
    currentPresenceCount: 5,
  },
  {
    id: 'gym-2',
    name: 'YMCA - Midtown',
    address: '456 Midtown Blvd',
    currentPresenceCount: 0,
  },
  {
    id: 'gym-3',
    name: 'Outdoor Park',
    address: '789 Park Rd',
    currentPresenceCount: 12,
  },
];

// Mock the gym service
jest.mock('../../services/gymService', () => ({
  subscribeToGyms: jest.fn((callback) => {
    setTimeout(() => callback(mockGyms), 0);
    return jest.fn(); // unsubscribe function
  }),
  seedGyms: jest.fn(),
  getAllGyms: jest.fn(() => Promise.resolve(mockGyms)),
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('ViewRunsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Loading gyms...')).toBeTruthy();
  });

  it('renders the title after loading', async () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Find a Run')).toBeTruthy();
    });
  });

  it('renders all gyms from service', async () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('LA Fitness - Southside')).toBeTruthy();
      expect(getByText('YMCA - Midtown')).toBeTruthy();
      expect(getByText('Outdoor Park')).toBeTruthy();
    });
  });

  it('displays player counts', async () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('5/15')).toBeTruthy();
      expect(getByText('0/15')).toBeTruthy();
      expect(getByText('12/15')).toBeTruthy();
    });
  });

  it('displays activity badges', async () => {
    const { getAllByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      // Check that badges exist (using getAllByText since there could be multiple)
      expect(getAllByText('Active').length).toBeGreaterThan(0); // 5 players (5-9 = Active)
      expect(getAllByText('Empty').length).toBeGreaterThan(0); // 0 players
      expect(getAllByText('Busy').length).toBeGreaterThan(0); // 12 players (10+ = Busy)
    });
  });

  it('navigates to RunDetails with correct params when a gym is pressed', async () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('LA Fitness - Southside')).toBeTruthy();
    });

    fireEvent.press(getByText('LA Fitness - Southside'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      gymId: 'gym-1',
      gymName: 'LA Fitness - Southside',
      players: 5,
    });
  });
});
