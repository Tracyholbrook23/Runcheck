import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ImageBackground,
} from 'react-native';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS, SKILL_LEVEL_COLORS } from '../constants/theme';
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
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

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
    <ImageBackground
      source={require('../assets/images/court-bg.jpg')}
      style={styles.bgImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Button
          title="← Back to Login"
          variant="ghost"
          size="sm"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        />

        <View style={styles.brandSection}>
          <Logo size="medium" style={{ marginBottom: SPACING.sm }} />
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.tagline}>Join the RunCheck community</Text>
        </View>

        <View style={styles.formCard}>
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
    </ImageBackground>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  bgImage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  container: {
    flexGrow: 1,
    padding: SPACING.lg,
    paddingTop: SPACING.xxl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.extraBold,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
  },
  tagline: {
    fontSize: FONT_SIZES.body,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fieldLabel: {
    fontSize: FONT_SIZES.small,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 6,
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  skillPill: {
    width: '48%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  skillPillText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(255,255,255,0.75)',
  },
});
