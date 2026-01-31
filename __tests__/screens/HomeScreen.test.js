import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HomeScreen from '../../screens/HomeScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

// Mock the image require
jest.mock('../../assets/hoop-icon.png', () => 'hoop-icon.png');

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the app title', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    expect(getByText(/RunCheck/)).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    expect(getByText('Find or join a pickup run near you')).toBeTruthy();
  });

  it('renders Check Into a Run button', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    expect(getByText('Check Into a Run')).toBeTruthy();
  });

  it('renders Find Open Runs button', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    expect(getByText('Find Open Runs')).toBeTruthy();
  });

  it('renders footer text', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    expect(getByText('Built for hoopers. Powered by community.')).toBeTruthy();
  });

  it('navigates to CheckIn when Check Into a Run is pressed', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Check Into a Run'));

    expect(mockNavigate).toHaveBeenCalledWith('CheckIn');
  });

  it('navigates to ViewRuns when Find Open Runs is pressed', () => {
    const { getByText } = render(
      <HomeScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Find Open Runs'));

    expect(mockNavigate).toHaveBeenCalledWith('ViewRuns');
  });
});
