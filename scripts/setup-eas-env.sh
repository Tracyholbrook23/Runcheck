#!/bin/bash
# setup-eas-env.sh
# Sets all required EXPO_PUBLIC_ environment variables in EAS for the production environment.
# Run this from the RunCheck project root before triggering a new EAS build.
#
# Usage:
#   chmod +x scripts/setup-eas-env.sh
#   ./scripts/setup-eas-env.sh

set -e

ENVIRONMENT="production"

echo "Setting EAS environment variables for: $ENVIRONMENT"
echo "----------------------------------------------------"

# Helper: create the var, or update it if it already exists
set_env_var() {
  local name=$1
  local value=$2
  echo -n "  $name ... "
  if eas env:create \
    --environment "$ENVIRONMENT" \
    --name "$name" \
    --value "$value" \
    --visibility plaintext \
    --non-interactive 2>/dev/null; then
    echo "created"
  else
    eas env:update \
      --environment "$ENVIRONMENT" \
      --name "$name" \
      --value "$value" \
      --non-interactive
    echo "updated"
  fi
}

set_env_var "EXPO_PUBLIC_FIREBASE_API_KEY"            "AIzaSyBPHNPB2k5YYoCnCsny2sp9YAB5Ss5pxWQ"
set_env_var "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"        "runcheck-567a3.firebaseapp.com"
set_env_var "EXPO_PUBLIC_FIREBASE_PROJECT_ID"         "runcheck-567a3"
set_env_var "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"     "runcheck-567a3.firebasestorage.app"
set_env_var "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" "1070301079584"
set_env_var "EXPO_PUBLIC_FIREBASE_APP_ID"             "1:1070301079584:web:6a304a79776bc6ca493445"
set_env_var "EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID"     "G-8XEHJJF8TY"
set_env_var "EXPO_PUBLIC_USE_EMULATORS"               "false"
set_env_var "EXPO_PUBLIC_DEV_SKIP_GPS"                "false"
set_env_var "EXPO_PUBLIC_GIPHY_API_KEY"               "TiA1KqavqjFzBGJGtw9rveEOfmh4g0bO"

echo ""
echo "All done. Verify with:"
echo "  eas env:list --environment production"
