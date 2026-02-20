import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';

let MapView, Marker, Callout;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Callout = Maps.Callout;
}
import { useTheme } from '../contexts';
import { useGyms, useLocation } from '../hooks';
import { GYM_TYPE } from '../services/models';

const PFLUGERVILLE_CENTER = {
  latitude: 30.4583,
  longitude: -97.6200,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function GymMapScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { gyms, loading } = useGyms();
  const { location } = useLocation();

  useEffect(() => {
    navigation.setOptions({ title: 'Nearby Courts' });
  }, [navigation]);

  const initialRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : PFLUGERVILLE_CENTER;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Map view is not available on web. Please use the mobile app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        testID="gym-map"
      >
        {gyms.map((gym) => {
          if (!gym.location) return null;
          const isOutdoor = gym.type === GYM_TYPE.OUTDOOR;

          return (
            <Marker
              key={gym.id}
              coordinate={{
                latitude: gym.location.latitude,
                longitude: gym.location.longitude,
              }}
              pinColor={isOutdoor ? 'green' : 'orange'}
              testID={`marker-${gym.id}`}
            >
              <Callout
                onPress={() =>
                  navigation.navigate('RunDetails', {
                    gymId: gym.id,
                    gymName: gym.name,
                    players: gym.currentPresenceCount || 0,
                  })
                }
              >
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{gym.name}</Text>
                  <Text style={styles.calloutType}>
                    {isOutdoor ? 'Outdoor' : 'Indoor'}
                  </Text>
                  <Text style={styles.calloutAddress}>{gym.address}</Text>
                  <Text style={styles.calloutTap}>Tap for details</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </SafeAreaView>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: SPACING.md,
      fontSize: FONT_SIZES.body,
      color: colors.textSecondary,
    },
    map: {
      flex: 1,
    },
    callout: {
      minWidth: 180,
      padding: SPACING.xs,
    },
    calloutTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
    calloutType: {
      fontSize: FONT_SIZES.small,
      color: colors.primary,
      fontWeight: FONT_WEIGHTS.medium,
      marginTop: 2,
      letterSpacing: 0.2,
    },
    calloutAddress: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    calloutTap: {
      fontSize: FONT_SIZES.xs,
      color: colors.primary,
      marginTop: SPACING.xs,
      fontStyle: 'italic',
    },
  });
