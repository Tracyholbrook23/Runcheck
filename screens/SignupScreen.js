import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, SKILL_LEVEL_COLORS } from '../constants/theme';
import { useTheme } from '../contexts';
import { Logo, Button, Input } from '../components';
import { auth, db } from '../config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';

const SKILL_OPTIONS = ['Beginner', 'Intermediate', 'Advanced', 'Pro'];

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
      <Button
        title="← Back to Login"
        variant="ghost"
        size="sm"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      />

      <Logo size="medium" style={{ marginBottom: SPACING.sm }} />
      <Text style={styles.title}>Create Your Account</Text>
      <Text style={styles.subtitle}>Join the RunCheck community</Text>

      <View style={styles.form}>
        <Input label="Full Name" placeholder="Your name" value={name} onChangeText={setName} />
        <Input label="Age" placeholder="Your age" keyboardType="numeric" value={age} onChangeText={setAge} />

        <Text style={styles.fieldLabel}>Skill Level</Text>
        <View style={styles.skillRow}>
          {SKILL_OPTIONS.map((level) => {
            const selected = skillLevel === level;
            const skillColors = SKILL_LEVEL_COLORS[level];
            return (
              <TouchableOpacity
                key={level}
                style={[
                  styles.skillPill,
                  selected && { backgroundColor: skillColors.bg, borderColor: skillColors.text },
                ]}
                onPress={() => setSkillLevel(level)}
              >
                <Text
                  style={[
                    styles.skillPillText,
                    selected && { color: skillColors.text },
                  ]}
                >
                  {level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input
          label="Email"
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label="Password"
          placeholder="Create a password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Button
          title="Create Account"
          variant="primary"
          size="lg"
          onPress={handleSignup}
          loading={loading}
          testID="signup-button"
          style={{ marginTop: SPACING.sm }}
        />
      </View>
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: SPACING.lg,
    paddingTop: SPACING.xxl,
    backgroundColor: colors.background,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  form: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: FONT_SIZES.small,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  skillPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  skillPillText: {
    fontSize: FONT_SIZES.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
