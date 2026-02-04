import React from 'react';
import { renderWithTheme } from '../helpers/renderWithTheme';
import GymMapScreen from '../../screens/GymMapScreen';

const mockGyms = [
  {
    id: 'cowboys-fit',
    name: 'Cowboys Fit - Pflugerville',
    address: '1401 Town Center Dr, Pflugerville, TX 78660',
    type: 'indoor',
    location: { latitude: 30.4692, longitude: -97.5963 },
    currentPresenceCount: 3,
  },
  {
    id: 'pfluger-park',
    name: 'Pfluger Park',
    address: '515 City Park Rd, Pflugerville, TX 78660',
    type: 'outdoor',
    location: { latitude: 30.4469, longitude: -97.6219 },
    currentPresenceCount: 0,
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

  it('renders markers for each gym', () => {
    const { getByTestId } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByTestId('marker-cowboys-fit')).toBeTruthy();
    expect(getByTestId('marker-pfluger-park')).toBeTruthy();
  });

  it('displays gym names in callouts', () => {
    const { getByText } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByText('Cowboys Fit - Pflugerville')).toBeTruthy();
    expect(getByText('Pfluger Park')).toBeTruthy();
  });

  it('displays gym type labels', () => {
    const { getByText } = renderWithTheme(
      <GymMapScreen navigation={mockNavigation} />
    );

    expect(getByText('Indoor')).toBeTruthy();
    expect(getByText('Outdoor')).toBeTruthy();
  });
});
