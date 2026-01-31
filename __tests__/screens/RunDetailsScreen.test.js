import React from 'react';
import { render } from '@testing-library/react-native';
import RunDetailsScreen from '../../screens/RunDetailsScreen';

describe('RunDetailsScreen', () => {
  const mockRoute = {
    params: {
      location: 'Test Gym - Downtown',
      time: '5:00 PM',
      players: 7,
    },
  };

  it('renders the location as title', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} />
    );

    expect(getByText('Test Gym - Downtown')).toBeTruthy();
  });

  it('displays the time', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} />
    );

    expect(getByText(/Time: 5:00 PM/)).toBeTruthy();
  });

  it('displays the player count', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} />
    );

    expect(getByText(/Players: 7/)).toBeTruthy();
  });

  it('displays the coming soon note', () => {
    const { getByText } = render(
      <RunDetailsScreen route={mockRoute} />
    );

    expect(getByText('More details and RSVP features coming soon!')).toBeTruthy();
  });

  it('renders with different route params', () => {
    const differentRoute = {
      params: {
        location: 'LA Fitness - Buckhead',
        time: '8:30 PM',
        players: 12,
      },
    };

    const { getByText } = render(
      <RunDetailsScreen route={differentRoute} />
    );

    expect(getByText('LA Fitness - Buckhead')).toBeTruthy();
    expect(getByText(/Time: 8:30 PM/)).toBeTruthy();
    expect(getByText(/Players: 12/)).toBeTruthy();
  });
});
