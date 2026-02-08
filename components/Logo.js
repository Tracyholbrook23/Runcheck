/**
 * Logo Component
 *
 * Reusable RunCheck logo with size variants.
 *
 * USAGE:
 *   <Logo />                  // Default medium
 *   <Logo size="small" />     // Small variant
 *   <Logo size="large" />     // Large variant
 *   <Logo style={{ marginTop: 20 }} />
 */

import React, { useMemo } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LOGO_ASSETS, LOGO_SIZES, LOGO_CLEAR_SPACE } from '../constants/branding';
import { useTheme } from '../contexts';

const Logo = ({ size = 'medium', style }) => {
  const { isDark } = useTheme();
  const dimensions = LOGO_SIZES[size] || LOGO_SIZES.medium;
  const clearSpace = LOGO_CLEAR_SPACE[size] || LOGO_CLEAR_SPACE.medium;

  // Transparent logo has white "CHECK" text — only readable on dark backgrounds
  const source = isDark ? LOGO_ASSETS.transparent : LOGO_ASSETS.full;

  const containerStyle = useMemo(
    () => [styles.container, { padding: clearSpace }, style],
    [clearSpace, style]
  );

  return (
    <View style={containerStyle}>
      <Image
        source={source}
        style={{ width: dimensions.width, height: dimensions.height }}
        resizeMode="contain"
        accessibilityLabel="RunCheck logo"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { Logo };
export default Logo;
