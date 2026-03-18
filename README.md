# RunCheck

A React Native mobile app that helps basketball players find and join pickup games nearby in real time. Check in to gyms, see who's playing, post highlight clips, earn rank points, and build your reputation.

## Features

- **Live Presence** - See who's currently at each gym in real time with run energy labels
- **GPS Check-In** - Validated check-in so players know you're actually there
- **Start & Join Runs** - Organize group runs at any gym; others can join with one tap
- **Plan Visits** - Schedule future gym visits and browse community runs being planned
- **Clip Posting** - Record or upload highlight clips (up to 10s), trim on-device, and post to the gym feed
- **Player Tagging** - Tag up to 5 friends in your clips; tagged users can approve clips to appear on their profile
- **Reliability Score** - Build your reputation (0–100) by showing up when you say you will
- **Rank System** - Six tiers (Bronze → Legend) with perks, tracked via all-time and weekly leaderboards
- **Weekly Winners** - Automated top-3 podium every Monday with a 24-hour celebration card
- **Player Reviews** - Rate gyms after attending a run or checking in; "Verified Run" badge for run completers
- **Gym Requests** - Request new gyms to be added; track your request status in-app
- **Reporting & Moderation** - Report clips, players, runs, and gyms; auto-moderation triggers at thresholds
- **Admin Dashboards** - Admin tools for managing reports, suspended users, hidden clips, and gym requests
- **RunCheck Premium** - UI teaser for future premium features ($4.99/mo or $29.99/yr)
- **Dark Mode** - Full dark/light theme support

## Tech Stack

- **React Native 0.81** with **Expo SDK 54** + React 19
- **Firebase v12** — Firestore, Auth, Storage, Cloud Functions v2
- **React Navigation v7** — native stack + bottom tabs
- **React Native Maps** + **Expo Location** for GPS
- **expo-dev-client** — custom dev builds (not Expo Go)
- **video-trimmer** — local Expo native module (iOS: AVFoundation, Android: Media3)

## Getting Started

### Prerequisites

- Node.js v20+ (via nvm recommended)
- EAS CLI (`npm install -g eas-cli`)
- A Firebase project with Firestore, Auth, and Storage enabled
- iOS Simulator (Mac) or physical device via EAS build

### Installation

```bash
git clone https://github.com/your-username/runcheck.git
cd runcheck
npm install
```

### Environment Setup

Copy the example environment file and fill in your Firebase credentials:

```bash
cp .env.example .env
```

Then edit `.env` with your Firebase project values:

```
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

Set `EXPO_PUBLIC_DEV_SKIP_GPS=true` to use a fake location during development.

### Running the App

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
```

### Backend (Cloud Functions)

The backend lives in a separate repo (`runcheck-backend`). Deploy functions with:

```bash
cd ~/Desktop/runcheck-backend
firebase deploy --only functions
```

Deploy Firestore rules:

```bash
firebase deploy --only firestore:rules
```

## Testing

```bash
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Project Structure

```
├── screens/           # App screens (Home, Profile, RunDetails, ClipPlayer, Admin, etc.)
├── components/        # Reusable UI components (Button, Card, PresenceList, ReportModal, etc.)
├── services/          # Business logic (gym, presence, schedule, reliability, points, runs, reviews)
├── hooks/             # Custom React hooks (useAuth, usePresence, useTaggedClips, useIsAdmin, etc.)
├── contexts/          # React Context providers (Theme)
├── config/            # Firebase config, rank tiers, point values, perk definitions
├── constants/         # Theme tokens, branding, gym assets
├── utils/             # Rank helpers, perk helpers, location, maps
├── modules/           # Local Expo native modules (video-trimmer)
├── scripts/           # Admin scripts (weekly reset, seed gyms, migrations)
├── assets/            # Images, icons, splash screen
└── __tests__/         # Test files
```

## Documentation

- `PROJECT_MEMORY.md` — Full project context, features, and recent changes
- `BACKEND_MEMORY.md` — Firestore schema, services, hooks, Cloud Functions, business rules
- `ARCHITECTURE_MAP.md` — File-to-zone mapping for safe, scoped changes
- `CLAUDE_WORKFLOW.md` — Development workflow rules and constraints
- `DEV_TASKS.md` — Known issues and upcoming tasks
 