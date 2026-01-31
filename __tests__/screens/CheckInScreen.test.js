import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CheckInScreen from '../../screens/CheckInScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('CheckInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title', () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Check Into a Run')).toBeTruthy();
  });

  it('renders the name input', () => {
    const { getByPlaceholderText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByPlaceholderText('Your Name')).toBeTruthy();
  });

  it('renders the location label', () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Select Location:')).toBeTruthy();
  });

  it('renders the Check In button', () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Check In')).toBeTruthy();
  });

  it('renders the Back to Home button', () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByText('Back to Home')).toBeTruthy();
  });

  it('updates name input when user types', () => {
    const { getByPlaceholderText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    const nameInput = getByPlaceholderText('Your Name');
    fireEvent.changeText(nameInput, 'John Doe');

    expect(nameInput.props.value).toBe('John Doe');
  });

  it('navigates to Home when Back to Home is pressed', () => {
    const { getByText } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Back to Home'));

    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });

  it('renders the dropdown picker', () => {
    const { getByTestId } = render(
      <CheckInScreen navigation={mockNavigation} />
    );

    expect(getByTestId('dropdown-picker')).toBeTruthy();
  });
});
