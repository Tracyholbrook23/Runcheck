import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COLORS, COLORS_DARK, SHADOWS, getThemeStyles,
  SKILL_LEVEL_COLORS, SKILL_LEVEL_COLORS_DARK,
} from '../constants/theme';

const THEME_KEY = '@runcheck_theme';

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((value) => {
        if (value === 'dark') setIsDark(true);
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  };

  const colors = isDark ? COLORS_DARK : COLORS;
  const shadows = SHADOWS;
  const skillColors = isDark ? SKILL_LEVEL_COLORS_DARK : SKILL_LEVEL_COLORS;
  const themeStyles = useMemo(() => getThemeStyles(colors), [isDark]);

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

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
