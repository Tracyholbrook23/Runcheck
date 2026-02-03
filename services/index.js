/**
 * Services Index
 *
 * Central export for all service modules.
 *
 * ARCHITECTURE:
 *
 * ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
 * │ presenceService │────>│ scheduleService  │────>│ reliabilityService  │
 * │   (check-in)    │     │  (scheduling)    │     │    (scoring)        │
 * └─────────────────┘     └──────────────────┘     └─────────────────────┘
 *         │                       │
 *         └───────────┬───────────┘
 *                     ▼
 *              ┌─────────────┐
 *              │ gymService  │
 *              │  (gyms)     │
 *              └─────────────┘
 *
 * DEPENDENCIES:
 * - presenceService depends on scheduleService (to mark schedules attended)
 * - scheduleService depends on reliabilityService (to update scores)
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
