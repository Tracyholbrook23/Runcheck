/**
 * Open Maps Directions Utility
 *
 * Opens the device's native maps app with directions to a given location.
 * iOS: Apple Maps (or Google Maps if installed, via ActionSheet choice)
 * Android: geo: URI triggers OS app chooser
 */

import { Platform, Linking, Alert, ActionSheetIOS } from 'react-native';

export const openDirections = async (location, label) => {
  console.log('🗺️ [DIRECTIONS] Opening directions...');
  console.log('🗺️ [DIRECTIONS] Label:', label);
  console.log('🗺️ [DIRECTIONS] Location object:', location);

  if (!location || !location.latitude || !location.longitude) {
    console.error('❌ [DIRECTIONS] Invalid location:', location);
    Alert.alert('Directions Unavailable', 'This gym does not have location data.');
    return;
  }

  const { latitude, longitude } = location;
  console.log('🗺️ [DIRECTIONS] GPS Coordinates:', { latitude, longitude });
  console.log('🗺️ [DIRECTIONS] Platform:', Platform.OS);

  const encodedLabel = encodeURIComponent(label);
  console.log('🗺️ [DIRECTIONS] Encoded label:', encodedLabel);

  if (Platform.OS === 'ios') {
    // Apple Maps: Use coordinate-only format to avoid address search conflicts
    // Format: maps://?daddr=lat,lng&dirflg=d
    // The label is NOT included to prevent Apple Maps from searching by name
    const appleUrl = `maps://?daddr=${latitude},${longitude}&dirflg=d`;

    // Google Maps: Use coordinate destination with driving mode
    const googleAppUrl = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
    const googleWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    console.log('🗺️ [DIRECTIONS] iOS URLs generated:');
    console.log('🗺️ [DIRECTIONS] Apple Maps (coord-only):', appleUrl);
    console.log('🗺️ [DIRECTIONS] Google Maps App:', googleAppUrl);
    console.log('🗺️ [DIRECTIONS] Google Maps Web:', googleWebUrl);

    const googleMapsInstalled = await Linking.canOpenURL('comgooglemaps://');

    if (googleMapsInstalled) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Apple Maps', 'Google Maps', 'Cancel'],
          cancelButtonIndex: 2,
          title: `Get Directions to ${label}`,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            console.log('✅ [DIRECTIONS] Opening Apple Maps:', appleUrl);
            Linking.openURL(appleUrl);
          } else if (buttonIndex === 1) {
            console.log('✅ [DIRECTIONS] Opening Google Maps:', googleAppUrl);
            Linking.openURL(googleAppUrl);
          }
        }
      );
    } else {
      console.log('✅ [DIRECTIONS] No Google Maps - Opening Apple Maps:', appleUrl);
      Linking.openURL(appleUrl).catch((err) => {
        console.warn('⚠️ [DIRECTIONS] Apple Maps failed, trying Google Web:', err);
        Linking.openURL(googleWebUrl);
      });
    }
  } else {
    // Android
    const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;
    console.log('🗺️ [DIRECTIONS] Android geo URL:', geoUrl);

    const supported = await Linking.canOpenURL(geoUrl);
    if (supported) {
      console.log('✅ [DIRECTIONS] Opening geo URL');
      Linking.openURL(geoUrl);
    } else {
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      console.log('✅ [DIRECTIONS] Opening Google Maps web:', webUrl);
      Linking.openURL(webUrl);
    }
  }
};

export default openDirections;
