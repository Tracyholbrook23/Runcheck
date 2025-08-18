import React, { useState, useCallback } from 'react';
import { COLORS, FONT_SIZES, SPACING, BUTTON } from '../constants/theme';

import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

export default function CheckInScreen({ navigation }) {
  const [name, setName] = useState('');

  // Dropdown state
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(null);
  const [items, setItems] = useState([
    { label: 'LA Fitness - Southside', value: 'LA Fitness - Southside' },
    { label: 'YMCA - Midtown', value: 'YMCA - Midtown' },
    { label: 'Outdoor Park - Rivertown', value: 'Outdoor Park - Rivertown' },
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.innerContainer}>
          <Text style={styles.title}>Check Into a Run</Text>

          <TextInput
            style={styles.input}
            placeholder="Your Name"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Select Location:</Text>

          <DropDownPicker
            open={open}
            value={location}
            items={items}
            setOpen={setOpen}
            setValue={setLocation}
            setItems={setItems}
            placeholder="Choose a location"
            containerStyle={{ marginBottom: open ? 150 : 20 }}
            style={styles.dropdown}
            dropDownContainerStyle={styles.dropdownContainer}
            zIndex={5000}
            zIndexInverse={1000}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.button}>
            <Button title="Check In" onPress={() => {}} />
          </View>
          <View style={styles.button}>
            <Button title="Back to Home" onPress={() => navigation.navigate('Home')} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  innerContainer: {
    padding: 24,
    zIndex: 1000,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
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
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  dropdown: {
    borderColor: '#ccc',
    borderRadius: 6,
  },
  dropdownContainer: {
    borderColor: '#ccc',
    borderRadius: 6,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  button: {
    marginBottom: 12,
  },
});
