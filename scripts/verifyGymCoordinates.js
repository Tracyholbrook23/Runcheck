/**
 * Verify Gym Coordinates
 *
 * This script checks if the gym coordinates in the database match
 * the expected Cowboys Fit location in Pflugerville, TX.
 */

const EXPECTED_COORDS = {
  name: 'Cowboys Fit - Pflugerville',
  address: '1401 Town Center Dr, Pflugerville, TX 78660',
  latitude: 30.4692,
  longitude: -97.5963,
};

console.log('🏀 COWBOYS FIT COORDINATE VERIFICATION');
console.log('═══════════════════════════════════════');
console.log('');
console.log('Expected Location:');
console.log('  Name:', EXPECTED_COORDS.name);
console.log('  Address:', EXPECTED_COORDS.address);
console.log('  Coordinates:', EXPECTED_COORDS.latitude, ',', EXPECTED_COORDS.longitude);
console.log('');
console.log('Google Maps Link:');
console.log('  https://www.google.com/maps/search/?api=1&query=' + EXPECTED_COORDS.latitude + ',' + EXPECTED_COORDS.longitude);
console.log('');
console.log('Apple Maps Link:');
console.log('  http://maps.apple.com/?q=' + EXPECTED_COORDS.latitude + ',' + EXPECTED_COORDS.longitude);
console.log('');
console.log('═══════════════════════════════════════');
console.log('');
console.log('VERIFICATION STEPS:');
console.log('1. Copy one of the links above');
console.log('2. Open in browser or maps app');
console.log('3. Verify it points to Cowboys Fit gym');
console.log('');
console.log('If coordinates are WRONG:');
console.log('  - Look up correct address in Google Maps');
console.log('  - Click on location to get coordinates');
console.log('  - Update coordinates in services/gymService.js');
console.log('  - Run: npm start (restart app)');
console.log('  - Gym will auto-update from seedGyms()');
console.log('');
