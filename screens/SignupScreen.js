import React from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import { COLORS, FONT_SIZES, SPACING, BUTTON } from '../constants/theme';
import { auth, db } from '../config/firebase';


export default function SignupScreen({ navigation }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Your RunCheck Account</Text>

      <TextInput style={styles.input} placeholder="Full Name" />
      <TextInput style={styles.input} placeholder="Age" keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Skill Level (e.g. Beginner, Pro)" />
      <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry />

      <View style={styles.buttonContainer}>
        <Button title="Sign Up" onPress={() => {}} />
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 12,
  },
});
