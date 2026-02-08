import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { FONT_SIZES, SPACING } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button, Input } from '../components';
import { auth } from '../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Please enter both email and password');
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigation.navigate('Main');
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. Please try again.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Logo size="large" style={{ marginBottom: SPACING.md }} />
      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.subtitle}>Log in to your RunCheck account</Text>

      <View style={styles.form}>
        <Input
          label="Email"
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          testID="email-input"
        />
        <Input
          label="Password"
          placeholder="Enter your password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          testID="password-input"
        />

        <Button
          title="Log In"
          variant="primary"
          size="lg"
          onPress={handleLogin}
          loading={loading}
          testID="login-button"
          style={{ marginTop: SPACING.sm }}
        />

        <Button
          title="Create Account"
          variant="outline"
          size="lg"
          onPress={() => navigation.navigate('Signup')}
          style={{ marginTop: SPACING.sm }}
        />
      </View>
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.xxl,
  },
  form: {
    width: '100%',
  },
});
