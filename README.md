# RunCheck

A React Native mobile app that helps basketball players find and join pickup games nearby in real time.

## Features

- **Find Nearby Games** - Discover pickup basketball games at gyms around you using GPS
- **Check In** - GPS-validated check-in (within 50m) so players know you're actually there
- **Live Presence** - See who's currently at each gym in real time
- **Reliability Score** - Build your reputation by showing up when you say you will
- **Plan Visits** - Schedule your intent to visit a gym so others know to expect you
- **Map View** - Browse gym locations on an interactive map with directions

## Tech Stack

- **React Native** with **Expo** (SDK 54)
- **Firebase** for auth, database, and backend
- **React Navigation** (native stack + bottom tabs)
- **React Native Maps** + **Expo Location** for GPS and maps

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A Firebase project with Firestore and Authentication enabled
- iOS Simulator (Mac) or Android Emulator, or the Expo Go app on your phone

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
npm run web        # Run in the browser
```

## Testing

```bash
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Project Structure

```
├── screens/        # App screens (Home, Login, Signup, CheckIn, etc.)
├── components/     # Reusable UI components (Button, Card, Input, etc.)
├── services/       # Business logic (gym, presence, schedule, reliability)
├── hooks/          # Custom React hooks (useAuth, useLocation, usePresence, etc.)
├── contexts/       # React Context providers (Theme)
├── config/         # Firebase and environment configuration
├── constants/      # Theme and branding constants
├── utils/          # Utility functions (location helpers, maps directions)
├── assets/         # Images, icons, and splash screen
└── __tests__/      # Test files
```
