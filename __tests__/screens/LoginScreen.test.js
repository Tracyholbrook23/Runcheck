import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../../screens/LoginScreen';
import { signInWithEmailAndPassword } from 'firebase/auth';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title correctly', () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    expect(getByText('Log Into Your RunCheck Account')).toBeTruthy();
  });

  it('renders email and password inputs', () => {
    const { getByPlaceholderText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders all navigation buttons', () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    expect(getByText('Login')).toBeTruthy();
    expect(getByText('Go to Signup')).toBeTruthy();
    expect(getByText('Back to Home')).toBeTruthy();
  });

  it('updates email input when user types', () => {
    const { getByTestId } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    const emailInput = getByTestId('email-input');
    fireEvent.changeText(emailInput, 'test@example.com');

    expect(emailInput.props.value).toBe('test@example.com');
  });

  it('updates password input when user types', () => {
    const { getByTestId } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    const passwordInput = getByTestId('password-input');
    fireEvent.changeText(passwordInput, 'mypassword');

    expect(passwordInput.props.value).toBe('mypassword');
  });

  it('shows alert when submitting with empty fields', () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Login'));

    expect(global.alert).toHaveBeenCalledWith('Please enter both email and password');
  });

  it('shows alert when only email is provided', () => {
    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.press(getByText('Login'));

    expect(global.alert).toHaveBeenCalledWith('Please enter both email and password');
  });

  it('shows alert when only password is provided', () => {
    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    expect(global.alert).toHaveBeenCalledWith('Please enter both email and password');
  });

  it('calls Firebase signInWithEmailAndPassword on valid submission', async () => {
    signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid' },
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123'
      );
    });
  });

  it('navigates to Home after successful login', async () => {
    signInWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'test-uid' },
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Main');
    });
  });

  it('shows error for user not found', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/user-not-found',
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'nonexistent@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('No account found with this email.');
    });
  });

  it('shows error for wrong password', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/wrong-password',
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'wrongpassword');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Incorrect password.');
    });
  });

  it('shows error for invalid email', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/invalid-email',
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'invalid-email');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Please enter a valid email address.');
    });
  });

  it('shows error for too many requests', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/too-many-requests',
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Too many failed attempts. Please try again later.');
    });
  });

  it('shows generic error for unknown errors', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce({
      code: 'auth/unknown-error',
    });

    const { getByTestId, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Login failed. Please try again.');
    });
  });

  it('navigates to Signup when Go to Signup is pressed', () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Go to Signup'));

    expect(mockNavigate).toHaveBeenCalledWith('Signup');
  });

  it('navigates to Home when Back to Home is pressed', () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.press(getByText('Back to Home'));

    expect(mockNavigate).toHaveBeenCalledWith('Main');
  });

  it('shows loading indicator while login is in progress', async () => {
    let resolveLogin;
    signInWithEmailAndPassword.mockImplementationOnce(
      () => new Promise((resolve) => { resolveLogin = resolve; })
    );

    const { getByTestId, getByText, queryByTestId } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeTruthy();
    });

    resolveLogin({ user: { uid: 'test-uid' } });
  });
});
