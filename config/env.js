// Environment configuration
// In production, these should be loaded from environment variables
// For Expo, you can use expo-constants or react-native-dotenv

const ENV = {
  // Firebase configuration
  // Replace these with environment variables in production:
  // process.env.FIREBASE_API_KEY, etc.
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || 'YOUR_API_KEY',
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_MESSAGING_SENDER_ID',
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || 'YOUR_APP_ID',
  FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID || 'YOUR_MEASUREMENT_ID',
};

export default ENV;
