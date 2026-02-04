import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import ViewRunsScreen from '../../screens/ViewRunsScreen';

// Mock gym data
const mockGyms = [
  {
    id: 'gym-1',
    name: 'Cowboys Fit - Pflugerville',
    address: '1401 Town Center Dr, Pflugerville, TX 78660',
    type: 'indoor',
    currentPresenceCount: 5,
  },
  {
    id: 'gym-2',
    name: 'Pflugerville Recreation Center',
    address: '400 Immanuel Rd, Pflugerville, TX 78660',
    type: 'indoor',
    currentPresenceCount: 0,
  },
  {
    id: 'gym-3',
    name: 'Pfluger Park',
    address: '515 City Park Rd, Pflugerville, TX 78660',
    type: 'outdoor',
    currentPresenceCount: 12,
  },
];

const mockEnsureGymsExist = jest.fn();
const mockUseGyms = jest.fn();

// Mock the hooks module
jest.mock('../../hooks', () => ({
  useGyms: (...args) => mockUseGyms(...args),
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('ViewRunsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGyms.mockReturnValue({
      gyms: mockGyms,
      loading: false,
      ensureGymsExist: mockEnsureGymsExist,
    });
  });

  it('renders loading state when loading is true', () => {
    mockUseGyms.mockReturnValue({
      gyms: [],
      loading: true,
      ensureGymsExist: mockEnsureGymsExist,
    });

    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Loading gyms...')).toBeTruthy();
  });

  it('renders the title', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Find a Run')).toBeTruthy();
  });

  it('renders all gyms from hook', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Cowboys Fit - Pflugerville')).toBeTruthy();
    expect(getByText('Pflugerville Recreation Center')).toBeTruthy();
    expect(getByText('Pfluger Park')).toBeTruthy();
  });

  it('displays player counts', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('5/15')).toBeTruthy();
    expect(getByText('0/15')).toBeTruthy();
    expect(getByText('12/15')).toBeTruthy();
  });

  it('displays activity badges', () => {
    const { getAllByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getAllByText('Active').length).toBeGreaterThan(0);
    expect(getAllByText('Empty').length).toBeGreaterThan(0);
    expect(getAllByText('Busy').length).toBeGreaterThan(0);
  });

  it('shows Indoor/Outdoor type per gym', () => {
    const { getAllByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    // Two indoor gyms, one outdoor
    const indoorElements = getAllByText(/^Indoor /);
    const outdoorElements = getAllByText(/^Outdoor /);
    expect(indoorElements.length).toBe(2);
    expect(outdoorElements.length).toBe(1);
  });

  it('navigates to RunDetails with correct params when a gym is pressed', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Cowboys Fit - Pflugerville'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      gymId: 'gym-1',
      gymName: 'Cowboys Fit - Pflugerville',
      players: 5,
    });
  });
});
