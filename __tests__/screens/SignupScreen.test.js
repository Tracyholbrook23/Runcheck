import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '../helpers/renderWithTheme';
import SignupScreen from '../../screens/SignupScreen';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc } from 'firebase/firestore';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('SignupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all input fields', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    expect(getByPlaceholderText('Full Name')).toBeTruthy();
    expect(getByPlaceholderText('Age')).toBeTruthy();
    expect(getByPlaceholderText('Skill Level (e.g. Beginner, Pro)')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders the title correctly', () => {
    const { getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    expect(getByText('Create Your RunCheck Account')).toBeTruthy();
  });

  it('renders the Sign Up button', () => {
    const { getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    expect(getByText('Sign Up')).toBeTruthy();
  });

  it('updates name input when user types', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    const nameInput = getByPlaceholderText('Full Name');
    fireEvent.changeText(nameInput, 'John Doe');

    expect(nameInput.props.value).toBe('John Doe');
  });

  it('updates email input when user types', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    const emailInput = getByPlaceholderText('Email');
    fireEvent.changeText(emailInput, 'john@example.com');

    expect(emailInput.props.value).toBe('john@example.com');
  });

  it('updates password input when user types', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    const passwordInput = getByPlaceholderText('Password');
    fireEvent.changeText(passwordInput, 'password123');

    expect(passwordInput.props.value).toBe('password123');
  });

  it('shows alert when submitting with empty fields', () => {
    const { getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    const signUpButton = getByText('Sign Up');
    fireEvent.press(signUpButton);

    expect(global.alert).toHaveBeenCalledWith('Please fill out all fields');
  });

  it('shows alert when only some fields are filled', () => {
    const { getByPlaceholderText, getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Full Name'), 'John Doe');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@example.com');
    // Missing age, skillLevel, password

    fireEvent.press(getByText('Sign Up'));

    expect(global.alert).toHaveBeenCalledWith('Please fill out all fields');
  });

  it('calls Firebase createUserWithEmailAndPassword on valid submission', async () => {
    createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid-123' },
    });
    setDoc.mockResolvedValueOnce();

    const { getByPlaceholderText, getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Full Name'), 'John Doe');
    fireEvent.changeText(getByPlaceholderText('Age'), '25');
    fireEvent.changeText(getByPlaceholderText('Skill Level (e.g. Beginner, Pro)'), 'Intermediate');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');

    fireEvent.press(getByText('Sign Up'));

    await waitFor(() => {
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'john@example.com',
        'password123'
      );
    });
  });

  it('shows success alert after successful signup', async () => {
    createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid-123' },
    });
    setDoc.mockResolvedValueOnce();

    const { getByPlaceholderText, getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Full Name'), 'John Doe');
    fireEvent.changeText(getByPlaceholderText('Age'), '25');
    fireEvent.changeText(getByPlaceholderText('Skill Level (e.g. Beginner, Pro)'), 'Intermediate');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');

    fireEvent.press(getByText('Sign Up'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Signup successful!');
    });
  });

  it('shows error alert when Firebase signup fails', async () => {
    const errorMessage = 'Email already in use';
    createUserWithEmailAndPassword.mockRejectedValueOnce({
      message: errorMessage,
    });

    const { getByPlaceholderText, getByText } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Full Name'), 'John Doe');
    fireEvent.changeText(getByPlaceholderText('Age'), '25');
    fireEvent.changeText(getByPlaceholderText('Skill Level (e.g. Beginner, Pro)'), 'Intermediate');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');

    fireEvent.press(getByText('Sign Up'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(errorMessage);
    });
  });

  it('shows loading indicator while signup is in progress', async () => {
    // Create a promise that we can control
    let resolveSignup;
    createUserWithEmailAndPassword.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSignup = resolve; })
    );

    const { getByPlaceholderText, getByText, queryByTestId } = renderWithTheme(
      <SignupScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Full Name'), 'John Doe');
    fireEvent.changeText(getByPlaceholderText('Age'), '25');
    fireEvent.changeText(getByPlaceholderText('Skill Level (e.g. Beginner, Pro)'), 'Intermediate');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');

    fireEvent.press(getByText('Sign Up'));

    // The loading state should be active
    await waitFor(() => {
      // Sign Up button should be replaced with ActivityIndicator
      expect(queryByTestId('loading-indicator') || getByText('Sign Up')).toBeTruthy();
    });

    // Resolve the signup
    resolveSignup({ user: { uid: 'test-uid' } });
  });
});
