/**
 * Open Maps Directions Utility
 *
 * Opens the device's native maps app with directions to a given location.
 * iOS: Apple Maps (or Google Maps if installed, via ActionSheet choice)
 * Android: geo: URI triggers OS app chooser
 */

import { Platform, Linking, Alert, ActionSheetIOS } from 'react-native';

export const openDirections = async (location, label) => {
  if (!location || !location.latitude || !location.longitude) {
    Alert.alert('Directions Unavailable', 'This gym does not have location data.');
    return;
  }

  const { latitude, longitude } = location;
  const encodedLabel = encodeURIComponent(label);

  if (Platform.OS === 'ios') {
    const appleUrl = `maps://app?daddr=${latitude},${longitude}&q=${encodedLabel}`;
    const googleAppUrl = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
    const googleWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    const googleMapsInstalled = await Linking.canOpenURL('comgooglemaps://');

    if (googleMapsInstalled) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Apple Maps', 'Google Maps', 'Cancel'],
          cancelButtonIndex: 2,
          title: `Get Directions to ${label}`,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) Linking.openURL(appleUrl);
          else if (buttonIndex === 1) Linking.openURL(googleAppUrl);
        }
      );
    } else {
      Linking.openURL(appleUrl).catch(() => Linking.openURL(googleWebUrl));
    }
  } else {
    const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;

    const supported = await Linking.canOpenURL(geoUrl);
    if (supported) {
      Linking.openURL(geoUrl);
    } else {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
      );
    }
  }
};

export default openDirections;
