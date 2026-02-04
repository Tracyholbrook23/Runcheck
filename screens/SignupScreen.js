import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { FONT_SIZES, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../contexts';
import { auth, db } from '../config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';

export default function SignupScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleSignup = async () => {
    if (!name || !email || !password || !age || !skillLevel) {
      alert('Please fill out all fields');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        name,
        age,
        skillLevel,
        email,
      });

      alert('Signup successful!');
      navigation.navigate('Main');
    } catch (error) {
      console.error('Signup error:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Your RunCheck Account</Text>

      <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Age" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={age} onChangeText={setAge} />
      <TextInput style={styles.input} placeholder="Skill Level (e.g. Beginner, Pro)" placeholderTextColor={colors.textMuted} value={skillLevel} onChangeText={setSkillLevel} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />

      <View style={styles.buttonContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} testID="loading-indicator" />
        ) : (
          <TouchableOpacity style={styles.signupButton} onPress={handleSignup} testID="signup-button">
            <Text style={styles.signupButtonText}>Sign Up</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    color: colors.textPrimary,
  },
  input: {
    width: '100%',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 12,
  },
  signupButton: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
});
