/**
 * Services Index
 *
 * Central export for all service modules.
 *
 * ARCHITECTURE:
 *
 * ┌─────────────────┐     ┌──────────────────┐
 * │ presenceService │────>│ scheduleService  │
 * │   (check-in)    │     │  (scheduling)    │
 * └─────────────────┘     └──────────────────┘
 *         │                       │
 *         └───────────┬───────────┘
 *                     ▼
 *              ┌─────────────┐
 *              │ gymService  │
 *              │  (gyms)     │
 *              └─────────────┘
 *
 *  reliabilityService — READ-ONLY on the client.
 *  All reliability writes are handled by Cloud Functions (backend).
 *
 * DEPENDENCIES:
 * - presenceService depends on scheduleService (to mark schedules attended)
 * - All services depend on gymService for gym data
 */

// Data models and constants
export * from './models';

// Core services
export * from './gymService';
export * from './presenceService';
export * from './scheduleService';
export * from './reliabilityService';

// Legacy intent service (deprecated, use scheduleService instead)
// export * from './intentService';
