import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import HomeScreen from '../../screens/HomeScreen';

// Mock navigation (HomeScreen uses navigation.getParent()?.navigate for tab switching)
const mockParentNavigate = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  getParent: () => ({ navigate: mockParentNavigate }),
};

// Mock the image require
jest.mock('../../assets/hoop-icon.png', () => 'hoop-icon.png');

// Mock firebase auth
jest.mock('../../config/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
}));

// Mock presence service
const mockUnsubscribe = jest.fn();
jest.mock('../../services/presenceService', () => ({
  subscribeToUserPresence: jest.fn((odId, callback) => {
    setTimeout(() => callback(null), 0);
    return mockUnsubscribe;
  }),
  checkOut: jest.fn(() => Promise.resolve()),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the app logo', async () => {
    const { getByLabelText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByLabelText('RunCheck logo')).toBeTruthy();
    });
  });

  it('renders the subtitle', async () => {
    const { getByText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Find or join a pickup run near you')).toBeTruthy();
    });
  });

  it('renders Check Into a Run button when not checked in', async () => {
    const { getByText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Check Into a Run')).toBeTruthy();
    });
  });

  it('renders Find Open Runs button', async () => {
    const { getByText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Find Open Runs')).toBeTruthy();
    });
  });

  it('renders footer text', async () => {
    const { getByText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Built for hoopers. Powered by community.')).toBeTruthy();
    });
  });

  it('navigates to CheckIn when Check Into a Run is pressed', async () => {
    const { getByText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Check Into a Run')).toBeTruthy();
    });

    fireEvent.press(getByText('Check Into a Run'));

    expect(mockParentNavigate).toHaveBeenCalledWith('CheckIn');
  });

  it('navigates to ViewRuns when Find Open Runs is pressed', async () => {
    const { getByText } = renderWithTheme(
      <HomeScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByText('Find Open Runs')).toBeTruthy();
    });

    fireEvent.press(getByText('Find Open Runs'));

    expect(mockParentNavigate).toHaveBeenCalledWith('Runs');
  });
});
