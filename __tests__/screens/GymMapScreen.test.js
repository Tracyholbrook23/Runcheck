import React from 'react';
import { renderWithTheme } from '../helpers/renderWithTheme';
import GymMapScreen from '../../screens/GymMapScreen';

const mockGyms = [
  {
    id: 'cowboys-fit-pflugerville',
    name: 'Cowboys Fit - Pflugerville',
    address: '1401 Town Center Dr, Pflugerville, TX 78660',
    type: 'indoor',
    location: { latitude: 30.4692, longitude: -97.5963 },
    currentPresenceCount: 3,
  },
];

jest.mock('../../hooks', () => ({
  useGyms: () => ({
    gyms: mockGyms,
    loading: false,
    ensureGymsExist: jest.fn(),
  }),
  useLocation: () => ({
    location: null,
    loading: false,
    error: null,
  }),
}));

jest.mock('../../services/models', () => ({
  GYM_TYPE: {
    INDOOR: 'indoor',
    OUTDOOR: 'outdoor',
  },
}));

const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('GymMapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the map', () => {
    const { getByTestId } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByTestId('gym-map')).toBeTruthy();
  });

  it('renders marker for Cowboys Fit', () => {
    const { getByTestId } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByTestId('marker-cowboys-fit-pflugerville')).toBeTruthy();
  });

  it('displays gym name in callout', () => {
    const { getByText } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByText('Cowboys Fit - Pflugerville')).toBeTruthy();
  });

  it('displays Indoor type label', () => {
    const { getByText } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByText('Indoor')).toBeTruthy();
  });
});
