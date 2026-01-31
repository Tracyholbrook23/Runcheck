import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ViewRunsScreen from '../../screens/ViewRunsScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('ViewRunsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('Open Runs Near You')).toBeTruthy();
  });

  it('renders all fake runs', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText('24 Hour Fitness - Midtown')).toBeTruthy();
    expect(getByText('LA Fitness - Buckhead')).toBeTruthy();
    expect(getByText('YMCA - West End')).toBeTruthy();
  });

  it('displays run times', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText(/6:30 PM/)).toBeTruthy();
    expect(getByText(/7:15 PM/)).toBeTruthy();
    expect(getByText(/8:00 PM/)).toBeTruthy();
  });

  it('displays player counts', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    expect(getByText(/8 players/)).toBeTruthy();
    expect(getByText(/10 players/)).toBeTruthy();
    expect(getByText(/5 players/)).toBeTruthy();
  });

  it('navigates to RunDetails with correct params when a run is pressed', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('24 Hour Fitness - Midtown'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      location: '24 Hour Fitness - Midtown',
      time: '6:30 PM',
      players: 8,
    });
  });

  it('navigates to RunDetails with different params for second run', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('LA Fitness - Buckhead'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      location: 'LA Fitness - Buckhead',
      time: '7:15 PM',
      players: 10,
    });
  });

  it('navigates to RunDetails with different params for third run', () => {
    const { getByText } = render(
      <ViewRunsScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('YMCA - West End'));

    expect(mockNavigate).toHaveBeenCalledWith('RunDetails', {
      location: 'YMCA - West End',
      time: '8:00 PM',
      players: 5,
    });
  });
});
