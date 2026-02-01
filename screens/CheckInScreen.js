import React, { useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { db, auth } from '../config/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

export default function CheckInScreen({ navigation }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Dropdown state
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(null);
  const [items, setItems] = useState([
    { label: 'LA Fitness - Southside', value: 'LA Fitness - Southside' },
    { label: 'YMCA - Midtown', value: 'YMCA - Midtown' },
    { label: 'Outdoor Park - Rivertown', value: 'Outdoor Park - Rivertown' },
  ]);

  const handleCheckIn = async () => {
    if (!name || !location) {
      alert('Please enter your name and select a location');
      return;
    }

    setLoading(true);

    try {
      // Check if a run already exists at this location
      const runsRef = collection(db, 'runs');
      const q = query(runsRef, where('location', '==', location));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // Create new run
        await addDoc(runsRef, {
          location,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          players: 1,
          checkedInUsers: [{ name, odId: auth.currentUser?.uid }],
          createdAt: serverTimestamp(),
        });
      } else {
        // Update existing run - increment players
        const runDoc = querySnapshot.docs[0];
        const runData = runDoc.data();
        await updateDoc(doc(db, 'runs', runDoc.id), {
          players: (runData.players || 0) + 1,
          checkedInUsers: [...(runData.checkedInUsers || []), { name, odId: auth.currentUser?.uid }],
        });
      }

      alert('Checked in successfully!');
      navigation.navigate('ViewRuns');
    } catch (error) {
      console.error('Check-in error:', error);
      alert('Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
            {loading ? (
              <ActivityIndicator size="small" color="#0000ff" />
            ) : (
              <Button title="Check In" onPress={handleCheckIn} />
            )}
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
