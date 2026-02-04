import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import ViewRunsScreen from '../../screens/ViewRunsScreen';

// Mock gym data
const mockGyms = [
  {
    id: 'cowboys-fit-pflugerville',
    name: 'Cowboys Fit - Pflugerville',
    address: '1401 Town Center Dr, Pflugerville, TX 78660',
    type: 'indoor',
    currentPresenceCount: 5,
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

  it('renders Cowboys Fit gym', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Cowboys Fit - Pflugerville')).toBeTruthy();
  });

  it('displays player count', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('5/15')).toBeTruthy();
  });

  it('displays activity badge', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Active')).toBeTruthy();
  });

  it('shows Indoor type for Cowboys Fit', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText(/^Indoor /)).toBeTruthy();
  });

  it('navigates to RunDetails with correct params when gym is pressed', () => {
    const { getByText } = renderWithTheme(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Cowboys Fit - Pflugerville'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      gymId: 'cowboys-fit-pflugerville',
      gymName: 'Cowboys Fit - Pflugerville',
      players: 5,
    });
  });
});
