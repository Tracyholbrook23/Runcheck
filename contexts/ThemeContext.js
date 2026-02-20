/**
 * ThemeContext.js — App-wide Theme Management
 *
 * Provides dark/light mode state and the full design token system to every
 * component in the tree. Preference is persisted to AsyncStorage under the
 * key `@runcheck_theme` so the user's choice survives app restarts.
 *
 * Consumers call `useTheme()` to receive:
 *   - `isDark`       — boolean indicating the current mode
 *   - `colors`       — full color palette for the active theme
 *   - `shadows`      — shared shadow definitions (mode-agnostic)
 *   - `skillColors`  — skill-level badge colors for the active theme
 *   - `themeStyles`  — pre-computed stylesheet helpers (e.g., NAV_HEADER)
 *   - `toggleTheme`  — function to flip between dark and light
 *   - `isLoaded`     — true once the stored preference has been read
 *
 * The context value is memoized so downstream components only re-render
 * when `isDark` or `isLoaded` actually changes.
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COLORS, COLORS_DARK, SHADOWS, getThemeStyles,
  SKILL_LEVEL_COLORS, SKILL_LEVEL_COLORS_DARK,
} from '../constants/theme';

/** AsyncStorage key used to persist the user's theme preference. */
const THEME_KEY = '@runcheck_theme';

const ThemeContext = createContext(undefined);

/**
 * ThemeProvider — Context provider that manages the active theme.
 *
 * On mount it reads the stored preference from AsyncStorage and sets
 * `isDark` accordingly. While that async read is in flight, `isLoaded`
 * remains false so screens can optionally delay rendering to avoid a
 * flash of the wrong theme.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children — Components that will have theme access.
 * @returns {JSX.Element} ThemeContext.Provider wrapping all children.
 */
export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // Read persisted preference on first mount.
  // Defaults to dark mode if no preference is stored.
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((value) => {
        if (value === 'dark') setIsDark(true);
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  /**
   * toggleTheme — Flips between dark and light mode.
   *
   * Uses the functional form of setState to guarantee the correct
   * previous value and writes the new preference to AsyncStorage
   * in the same callback so the state update and persistence are atomic.
   */
  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  };

  // Derive design tokens from the current mode
  const colors = isDark ? COLORS_DARK : COLORS;
  const shadows = SHADOWS;
  const skillColors = isDark ? SKILL_LEVEL_COLORS_DARK : SKILL_LEVEL_COLORS;

  // Re-compute nav/stylesheet helpers only when the mode changes, not on every render
  const themeStyles = useMemo(() => getThemeStyles(colors), [isDark]);

  // Memoize the full context value so consumers skip unnecessary re-renders
  const value = useMemo(() => ({
    isDark,
    colors,
    shadows,
    skillColors,
    themeStyles,
    toggleTheme,
    isLoaded,
  }), [isDark, isLoaded]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme — Custom hook to consume the ThemeContext.
 *
 * Must be called from a component that is a descendant of ThemeProvider.
 * Throws a descriptive error if used outside the provider to make
 * misconfiguration obvious during development.
 *
 * @returns {{
 *   isDark: boolean,
 *   colors: object,
 *   shadows: object,
 *   skillColors: object,
 *   themeStyles: object,
 *   toggleTheme: () => void,
 *   isLoaded: boolean
 * }} The current theme state and helpers.
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
