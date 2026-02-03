/**
 * Custom Hooks Index
 *
 * Central export for all custom hooks.
 * These hooks wrap Firebase services so screens never call Firebase directly.
 *
 * ARCHITECTURE:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                          SCREENS                                │
 * │  (HomeScreen, CheckInScreen, ViewRunsScreen, etc.)             │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        CUSTOM HOOKS                             │
 * │  useAuth, usePresence, useSchedules, useGyms, useLocation, etc.│
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                         SERVICES                                │
 * │  presenceService, scheduleService, reliabilityService, etc.    │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      FIREBASE/FIRESTORE                         │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * AVAILABLE HOOKS:
 *
 * Authentication:
 * - useAuth: User authentication state
 *
 * Presence (Check-in/out):
 * - usePresence: Current user's presence state and actions
 * - useGymPresences: Real-time presences at a specific gym
 *
 * Scheduling:
 * - useSchedules: Current user's scheduled sessions
 * - useGymSchedules: Real-time schedules at a specific gym
 *
 * Reliability:
 * - useReliability: User's reliability score and stats
 *
 * Gyms:
 * - useGyms: All gyms list with real-time updates
 * - useGym: Single gym with real-time updates
 *
 * Location:
 * - useLocation: GPS location and permissions
 */

// Authentication
export { useAuth } from './useAuth';

// Presence (Check-in/out)
export { usePresence } from './usePresence';
export { useGymPresences } from './useGymPresences';

// Scheduling
export { useSchedules } from './useSchedules';
export { useGymSchedules } from './useGymSchedules';

// Reliability
export { useReliability } from './useReliability';

// Gyms
export { useGyms } from './useGyms';
export { useGym } from './useGym';

// Location
export { useLocation } from './useLocation';
