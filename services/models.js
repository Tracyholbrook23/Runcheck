/**
 * Data Models Documentation
 *
 * This file documents the Firestore collection schemas used by RunCheck.
 * These are not enforced by Firestore but serve as reference for developers.
 */

/**
 * USERS COLLECTION
 * Path: users/{odId}
 *
 * {
 *   odId: string,                    // Firebase Auth UID
 *   email: string,
 *   name: string,
 *   age: string,
 *   skillLevel: string,              // "Beginner" | "Intermediate" | "Advanced" | "Pro"
 *
 *   // Reliability tracking
 *   reliability: {
 *     score: number,                 // 0-100, starts at 100
 *     totalScheduled: number,        // Total sessions scheduled
 *     totalAttended: number,         // Sessions where user showed up
 *     totalNoShow: number,           // Sessions where user didn't show
 *     totalCancelled: number,        // Sessions cancelled (no penalty if 1hr+ before)
 *     lastUpdated: Timestamp
 *   },
 *
 *   // Current presence (denormalized for quick lookup)
 *   activePresence: {
 *     odId: string,
 *     gymId: string,
 *     gymName: string,
 *     checkedInAt: Timestamp,
 *     expiresAt: Timestamp
 *   } | null,
 *
 *   createdAt: Timestamp,
 *   updatedAt: Timestamp
 * }
 */

/**
 * GYMS COLLECTION
 * Path: gyms/{gymId}
 *
 * {
 *   name: string,
 *   address: string,
 *   city: string,                    // e.g. "Pflugerville"
 *   state: string,                   // e.g. "TX"
 *   type: string,                    // "indoor" | "outdoor"
 *   notes: string,                   // Additional info about the gym
 *
 *   // Location for GPS validation
 *   location: {
 *     latitude: number,
 *     longitude: number
 *   },
 *   checkInRadiusMeters: number,     // Max distance for valid check-in (default: 200)
 *
 *   // Counts (updated by services)
 *   currentPresenceCount: number,
 *
 *   // Scheduled sessions by time slot
 *   scheduleCounts: {
 *     "2024-02-01T18:00": number,
 *     // ... more time slots
 *   },
 *
 *   autoExpireMinutes: number,       // Default: 180 (3 hours)
 *
 *   createdAt: Timestamp,
 *   updatedAt: Timestamp
 * }
 */

/**
 * PRESENCE COLLECTION
 * Path: presence/{odId}_{gymId}
 *
 * Compound ID prevents duplicate active presence at same gym.
 *
 * {
 *   odId: string,
 *   userName: string,
 *
 *   gymId: string,
 *   gymName: string,
 *
 *   status: string,                  // "active" | "checked_out" | "expired"
 *
 *   // Location validation
 *   checkInLocation: {
 *     latitude: number,
 *     longitude: number
 *   },
 *   distanceFromGym: number,         // Meters at check-in time
 *
 *   checkedInAt: Timestamp,
 *   expiresAt: Timestamp,
 *   checkedOutAt: Timestamp | null,
 *
 *   // Link to schedule if this fulfilled one
 *   scheduleId: string | null,
 *
 *   createdAt: Timestamp
 * }
 */

/**
 * SCHEDULES COLLECTION
 * Path: schedules/{scheduleId}
 *
 * {
 *   odId: string,
 *   userName: string,
 *
 *   gymId: string,
 *   gymName: string,
 *
 *   status: string,                  // "scheduled" | "attended" | "no_show" | "cancelled"
 *
 *   scheduledTime: Timestamp,        // When user plans to arrive
 *   timeSlot: string,                // ISO hour string for grouping: "2024-02-01T18:00"
 *
 *   // Tracking
 *   createdAt: Timestamp,
 *   attendedAt: Timestamp | null,    // When user checked in (if attended)
 *   cancelledAt: Timestamp | null,
 *   markedNoShowAt: Timestamp | null,
 *
 *   // Link to presence if attended
 *   presenceId: string | null
 * }
 */

/**
 * REQUIRED FIRESTORE INDEXES
 *
 * 1. presence: odId ASC, status ASC
 * 2. presence: gymId ASC, status ASC, checkedInAt DESC
 * 3. presence: status ASC, expiresAt ASC
 * 4. schedules: odId ASC, status ASC, scheduledTime ASC
 * 5. schedules: gymId ASC, status ASC, scheduledTime ASC
 * 6. schedules: status ASC, scheduledTime ASC
 */

export const GYM_TYPE = {
  INDOOR: 'indoor',
  OUTDOOR: 'outdoor',
};

export const PRESENCE_STATUS = {
  ACTIVE: 'active',
  CHECKED_OUT: 'checked_out',
  EXPIRED: 'expired',
};

export const SCHEDULE_STATUS = {
  SCHEDULED: 'scheduled',
  ATTENDED: 'attended',
  NO_SHOW: 'no_show',
  CANCELLED: 'cancelled',
};

export const DEFAULT_CHECK_IN_RADIUS_METERS = 200;
export const DEFAULT_EXPIRE_MINUTES = 180; // 3 hours
export const SCHEDULE_GRACE_PERIOD_MINUTES = 60; // 1 hour window to check in
export const CANCEL_PENALTY_THRESHOLD_MINUTES = 60; // No penalty if cancelled 1hr+ before
