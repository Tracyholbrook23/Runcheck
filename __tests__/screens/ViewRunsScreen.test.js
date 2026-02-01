import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ViewRunsScreen from '../../screens/ViewRunsScreen';

// Mock Firestore
const mockRuns = [
  { id: '1', location: '24 Hour Fitness - Midtown', time: '6:30 PM', players: 8 },
  { id: '2', location: 'LA Fitness - Buckhead', time: '7:15 PM', players: 10 },
  { id: '3', location: 'YMCA - West End', time: '8:00 PM', players: 5 },
];

const mockUnsubscribe = jest.fn();
let snapshotCallback = null;

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn((query, callback) => {
    snapshotCallback = callback;
    // Simulate async data fetch
    setTimeout(() => {
      callback({
        docs: mockRuns.map(run => ({
          id: run.id,
          data: () => run,
        })),
      });
    }, 0);
    return mockUnsubscribe;
  }),
}));

jest.mock('../../config/firebase', () => ({
  db: {},
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
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Loading runs...')).toBeTruthy();
  });

  it('renders the title after loading', async () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Open Runs Near You')).toBeTruthy();
    });
  });

  it('renders all runs from Firestore', async () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('24 Hour Fitness - Midtown')).toBeTruthy();
      expect(getByText('LA Fitness - Buckhead')).toBeTruthy();
      expect(getByText('YMCA - West End')).toBeTruthy();
    });
  });

  it('displays run times', async () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText(/6:30 PM/)).toBeTruthy();
      expect(getByText(/7:15 PM/)).toBeTruthy();
      expect(getByText(/8:00 PM/)).toBeTruthy();
    });
  });

  it('displays player counts', async () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText(/8 players/)).toBeTruthy();
      expect(getByText(/10 players/)).toBeTruthy();
      expect(getByText(/5 players/)).toBeTruthy();
    });
  });

  it('navigates to RunDetails with correct params when a run is pressed', async () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('24 Hour Fitness - Midtown')).toBeTruthy();
    });

    fireEvent.press(getByText('24 Hour Fitness - Midtown'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      runId: '1',
      location: '24 Hour Fitness - Midtown',
      time: '6:30 PM',
      players: 8,
    });
  });

  it('cleans up subscription on unmount', async () => {
    const { unmount, getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Open Runs Near You')).toBeTruthy();
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
