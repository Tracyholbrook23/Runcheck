/**
 * Branding Constants
 *
 * Centralized logo asset references and size definitions.
 * All logo usage should reference these constants
 * rather than hardcoding asset paths or dimensions.
 */

export const LOGO_ASSETS = {
  full: require('../assets/logo/runcheck-logo-full.png'),
  transparent: require('../assets/logo/runcheck-logo-transparent.png'),
};

/**
 * Logo size variants (1:1 aspect ratio — logo is 1024x1024)
 */
export const LOGO_SIZES = {
  small: { width: 60, height: 60 },
  medium: { width: 120, height: 120 },
  large: { width: 180, height: 180 },
};

/**
 * Minimum clear space around logo per size variant
 */
export const LOGO_CLEAR_SPACE = {
  small: 4,
  medium: 8,
  large: 16,
};

export const BRAND_COLORS = {
  orange: '#E8622A',
  blue: '#2563EB',
  white: '#FFFFFF',
  darkBackground: '#1A1A2E',
};
