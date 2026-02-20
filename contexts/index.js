/**
 * contexts/index.js — Contexts Barrel Export
 *
 * Re-exports every public symbol from the contexts directory so
 * consumers can import from the folder root:
 *
 *   import { ThemeProvider, useTheme } from '../contexts';
 *
 * Add future context exports here to keep all context imports consistent.
 */

export { ThemeProvider, useTheme } from './ThemeContext';
