/**
 * seedProductionGyms.js — Single canonical admin seed script for gym data.
 *
 * This is the ONLY script that should write gym documents to Firestore.
 * The client app is read-only — it subscribes to gyms via real-time listeners
 * and never creates, updates, or deletes gym documents.
 *
 * Usage:
 *   node seedProductionGyms.js              # Validate + seed
 *   node seedProductionGyms.js --validate   # Validate only (dry run, no Firestore writes)
 *
 * Behavior:
 *   - Uses `set(data, { merge: true })` so it is safe to re-run at any time.
 *   - Creates missing gym documents.
 *   - Updates fields on existing documents without deleting any data.
 *   - Never deletes gym documents — to remove a gym, delete it manually in
 *     the Firebase console or set its `status` to 'hidden' or 'archived'.
 *   - Sets `createdAt` only on first creation (document does not yet exist).
 *   - Sets `updatedAt` on every run.
 *   - Does NOT include system-managed fields (currentPresenceCount, scheduleCounts)
 *     because merge:true would overwrite live data.
 *
 * To add a new gym:
 *   1. Add a new entry to the `gyms` array below.
 *   2. Get coordinates by right-clicking the exact building/court in Google Maps
 *      → "What's here?" → copy latitude/longitude. Do NOT use an address geocoder
 *      — it returns parcel centroids, not building-level pins.
 *   3. Run `node seedProductionGyms.js --validate` to check for errors.
 *   4. Run `node seedProductionGyms.js` to seed.
 *   5. The client app will pick it up automatically via the Firestore listener.
 *   6. If the gym needs a local image override, also add an entry in
 *      `constants/gymAssets.js`.
 *
 * Requires:
 *   - `serviceAccountKey.json` in the project root (firebase-admin credential)
 *
 * @since 2026-03-15 — Promoted to single source of truth for gym data.
 * @updated 2026-03-15 — Phase 1: added validation, status field, timestamps,
 *          removed system-managed fields from seed data.
 */

const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const VALID_TYPES = ['indoor', 'outdoor'];
const VALID_ACCESS_TYPES = ['paid', 'free'];
const VALID_STATUSES = ['active', 'hidden', 'archived'];
const GYM_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// System-managed fields that should NEVER appear in seed data.
// merge:true would overwrite live values if these were included.
const SYSTEM_MANAGED_FIELDS = ['currentPresenceCount', 'scheduleCounts'];

// Current launch region (central Texas). Coordinates outside this box produce
// a warning, NOT a hard failure — this allows future expansion to other regions.
const LAUNCH_REGION = {
  label: 'Central Texas',
  latMin: 29.0,
  latMax: 32.0,
  lngMin: -99.0,
  lngMax: -96.0,
};

// ---------------------------------------------------------------------------
// Gym data — admin-managed fields only
// ---------------------------------------------------------------------------

const gyms = [
  {
    id: 'cowboys-fit-pflugerville',
    name: 'Cowboys Fit - Pflugerville',
    address: '1401 Town Center Dr, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: '57,000 sq ft facility with indoor basketball court, pool, and recovery lounge',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/cowboys-fit-pflugerville/1.jpg',
    placeId: 'ChIJlXzU6xDFRIYRDE03bEPoG1g',
    website: 'https://www.cowboysfit.com/',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/cowboys-fit-pflugerville/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/cowboys-fit-pflugerville/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/cowboys-fit-pflugerville/3.jpg',
    ],
    location: { latitude: 30.4656098, longitude: -97.60126939999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'clay-madsen-round-rock',
    name: 'Clay Madsen Recreation Center',
    address: '1600 Gattis School Rd, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: '55,000 sq ft facility with two full-size gymnasiums, basketball courts, pool, racquetball courts',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/clay-madsen-round-rock/1.jpg',
    placeId: 'ChIJqUajl9HRRIYRHcupOt6yV0w',
    website: 'http://www.roundrocktexas.gov/claymadsen',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/clay-madsen-round-rock/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/clay-madsen-round-rock/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/clay-madsen-round-rock/3.jpg',
    ],
    location: { latitude: 30.4971423, longitude: -97.66086279999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'pan-american-recreation-center',
    name: 'Pan American Recreation Center',
    address: '2100 E 3rd St, Austin, TX 78702',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: '',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/pan-american-recreation-center/1.jpg',
    placeId: 'ChIJi3dDkLW1RIYRaCg68Xni4mA',
    website: 'https://austintexas.gov/department/oswaldo-ab-cantupan-american-recreation-center',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/pan-american-recreation-center/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/pan-american-recreation-center/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/pan-american-recreation-center/3.jpg',
    ],
    location: { latitude: 30.258001000000004, longitude: -97.7208904 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'lifetime-austin-north',
    name: 'Life Time Austin North',
    address: '13725 Ranch Rd 620 N, Austin, TX 78717',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: '',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/lifetime-austin-north/1.jpg',
    placeId: 'ChIJe_Eb3H_NRIYRkKtd_qO5sR4',
    website: 'https://www.lifetime.life/locations/tx/austin-north.html',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/lifetime-austin-north/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/lifetime-austin-north/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/lifetime-austin-north/3.jpg',
    ],
    location: { latitude: 30.472531300000004, longitude: -97.7741003 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'golds-gym-hesters-crossing',
    name: "Gold's Gym Hester's Crossing",
    address: '2400 S I-35 Frontage Rd, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: '',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/golds-gym-hesters-crossing/1.jpg',
    placeId: 'ChIJ0XJHM-DRRIYRMfHwrKVYdfA',
    website: 'https://www.goldsgym.com/austinhesterscrossingtx/',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/golds-gym-hesters-crossing/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/golds-gym-hesters-crossing/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/golds-gym-hesters-crossing/3.jpg',
    ],
    location: { latitude: 30.4867225, longitude: -97.6792298 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'fitness-connection-austin-north',
    name: 'Fitness Connection',
    address: '12901 N Interstate Hwy 35 Suite 900, Austin, TX 78753',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: '',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/fitness-connection-austin-north/1.jpg',
    placeId: 'ChIJRVAlNMLORIYRIMmUrgtyaHA',
    website: 'https://fitnessconnection.com/gyms/tech-ridge/',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/fitness-connection-austin-north/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/fitness-connection-austin-north/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/fitness-connection-austin-north/3.jpg',
    ],
    location: { latitude: 30.412062000000002, longitude: -97.67153499999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'montopolis-rec-center-austin',
    name: 'Montopolis Recreation and Community Center',
    address: '1200 Montopolis Dr, Austin, TX 78741',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Community Center',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/montopolis-rec-center-austin/1.jpg',
    placeId: 'ChIJWT8ziR-0RIYRxvm7QgtVko0',
    website: 'https://www.austintexas.gov/department/montopolis-recreation-and-community-center',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/montopolis-rec-center-austin/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/montopolis-rec-center-austin/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/montopolis-rec-center-austin/3.jpg',
    ],
    location: { latitude: 30.2321918, longitude: -97.69986109999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
  id: 'house-of-gainz-austin',
  name: 'House of Gainz',
  address: '235 W Canyon Ridge Dr, Austin, TX 78753',
  city: 'Austin',
  state: 'TX',
  type: 'indoor',
  accessType: 'paid',
  status: 'active',
  notes: 'Private gym with basketball court (membership or day pass required)',
  imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/house-of-gainz-austin/1.jpg',
  placeId: 'ChIJSzyHR2bPRIYRDLB2KuvpSnU',
  website: 'https://houseofgainz.com/',
  photoGallery: [
    'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/house-of-gainz-austin/1.jpg',
    'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/house-of-gainz-austin/2.jpg',
    'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/house-of-gainz-austin/3.jpg',
  ],
  location: {
    latitude: 30.40131568563495,
    longitude: -97.67053283540336,
  },
  checkInRadiusMeters: 200,
  autoExpireMinutes: 120,
},
  {
    id: 'veterans-park-round-rock',
    name: 'Veterans Park',
    address: '600 N Lee St, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Outdoor basketball courts at Veterans Park',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/veterans-park-round-rock/1.jpg',
    placeId: 'ChIJMxtXE5LRRIYRXvjS53-3VjA',
    website: 'https://www.roundrocktexas.gov/park/veterans-park/',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/veterans-park-round-rock/1.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/veterans-park-round-rock/2.jpg',
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/veterans-park-round-rock/3.jpg',
    ],
    location: { latitude: 30.5123028, longitude: -97.68565 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 2 — Added 2026-03-29: YMCA branches, rec centers, LA Fitness, parks
  // placeId / website / imageUrl / photoGallery will be added via enrichment pipeline
  // ---------------------------------------------------------------------------

  {
    id: 'ymca-northwest-austin',
    name: 'YMCA of Austin - Northwest Branch',
    address: '12741 N Lamar Blvd, Austin, TX 78753',
    city: 'Austin',
    state: 'TX',
    zip: '78753',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed',
    // ⚠️ Archived 2026-03-30: address 12741 N Lamar Blvd is not a real YMCA
    // location. The correct Northwest Family YMCA is at 5807 McNeil Dr —
    // seeded as 'northwest-family-ymca-austin' in Batch 3.
    notes: 'Full-size indoor basketball courts, pool, fitness center',
    location: { latitude: 30.4460811, longitude: -97.7338527 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'ymca-downtown-austin',
    name: 'YMCA of Austin - Downtown',
    address: '1100 W Cesar Chavez St, Austin, TX 78703',
    city: 'Austin',
    state: 'TX',
    zip: '78703',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Downtown Austin YMCA with fitness center and courts',
    location: { latitude: 30.268846099999998, longitude: -97.7569609 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'ymca-round-rock',
    name: 'YMCA of Austin - Round Rock',
    address: '301 W Bagdad Ave, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed', // wrong location - 301 W Bagdad is not a YMCA; real Round Rock YMCA is Chasco at 1801 N IH-35
    notes: 'Round Rock YMCA branch with indoor courts and pool',
    location: { latitude: 30.5263004, longitude: -97.68809499999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'cedar-park-recreation-center',
    name: 'Cedar Park Recreation Center',
    address: '1435 Main St, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'City of Cedar Park rec center with indoor basketball, pool, and fitness equipment',
    location: { latitude: 30.5269428, longitude: -97.82585449999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'la-fitness-cedar-park',
    name: 'LA Fitness - Cedar Park',
    address: '1890 E Whitestone Blvd, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Full-size indoor basketball court, pool, racquetball',
    location: { latitude: 30.5193943, longitude: -97.8387542 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'dittmar-recreation-center',
    name: 'Dittmar Recreation Center',
    address: '1009 W Dittmar Rd, Austin, TX 78745',
    city: 'Austin',
    state: 'TX',
    zip: '78745',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin PARD facility with indoor basketball gym and fitness equipment',
    location: { latitude: 30.18505, longitude: -97.8020854 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'metz-recreation-center',
    name: 'Metz Recreation Center',
    address: '2407 Canterbury St, Austin, TX 78702',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin PARD facility in East Austin with basketball courts',
    location: { latitude: 30.2522763, longitude: -97.71826730000001 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'northwest-recreation-center-austin',
    name: 'Northwest Recreation Center',
    address: '2913 Northland Dr, Austin, TX 78757',
    city: 'Austin',
    state: 'TX',
    zip: '78757',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin PARD facility with indoor basketball and racquetball courts',
    location: { latitude: 30.3337018, longitude: -97.75191199999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'old-settlers-park-round-rock',
    name: 'Old Settlers Park',
    address: '3300 E Palm Valley Blvd, Round Rock, TX 78665',
    city: 'Round Rock',
    state: 'TX',
    zip: '78665',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Large city park with outdoor basketball courts',
    location: { latitude: 30.5363632, longitude: -97.6261296 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'la-fitness-south-austin',
    name: 'LA Fitness - South Austin',
    address: '4501 W William Cannon Dr, Austin, TX 78749',
    city: 'Austin',
    state: 'TX',
    zip: '78749',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed', // ⚠️ ARCHIVED 2026-03-30: wrong address; real south Austin LA Fitness is la-fitness-south-lamar
    notes: 'Indoor basketball court, pool, racquetball',
    location: { latitude: 30.2348134, longitude: -97.79176489999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 3 — Added 2026-03-30: UT facilities, YMCA branches, Austin PARD rec
  // centers, suburbs, and commercial gyms (36 gyms).
  // Duplicates removed: TownLake YMCA, Montopolis Rec, Clay Madsen, Round Rock
  // Rec Center, Cedar Park Rec Center, Life Time North Austin.
  // placeId / website / imageUrl / photoGallery pending enrichment pipeline.
  // ---------------------------------------------------------------------------

  // ── UT Austin ──
  {
    id: 'gregory-gymnasium-austin',
    name: 'Gregory Gymnasium',
    address: '2101 Speedway, Austin, TX 78712',
    city: 'Austin',
    state: 'TX',
    zip: '78712',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'UT Austin indoor basketball courts — UT students, staff, and RecSports members only',
    location: { latitude: 30.2842496, longitude: -97.7368011 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'ut-rec-sports-center-austin',
    name: 'UT Recreational Sports Center',
    address: '2001 San Jacinto Blvd, Austin, TX 78712',
    city: 'Austin',
    state: 'TX',
    zip: '78712',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'UT Austin main rec center with indoor basketball courts — RecSports membership required',
    location: { latitude: 30.281460300000003, longitude: -97.73282599999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── YMCA branches ──
  {
    id: 'east-communities-ymca-austin',
    name: 'YMCA - East Communities',
    address: '5315 Ed Bluestein Blvd, Austin, TX 78723',
    city: 'Austin',
    state: 'TX',
    zip: '78723',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball courts, fitness center',
    location: { latitude: 30.2919554, longitude: -97.6621041 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'southwest-family-ymca-austin',
    name: 'YMCA - Southwest Family',
    address: '6219 Oakclaire Dr, Austin, TX 78735',
    city: 'Austin',
    state: 'TX',
    zip: '78735',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym, pool, fitness center',
    location: { latitude: 30.236309799999997, longitude: -97.85362029999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'northwest-family-ymca-austin',
    name: 'YMCA - Northwest Family',
    address: '5807 McNeil Dr, Austin, TX 78729',
    city: 'Austin',
    state: 'TX',
    zip: '78729',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball courts, pool, fitness center',
    location: { latitude: 30.4460811, longitude: -97.7338527 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'north-austin-ymca',
    name: 'YMCA - North Austin',
    address: '1000 W Rundberg Ln, Austin, TX 78758',
    city: 'Austin',
    state: 'TX',
    zip: '78758',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym, fitness center',
    location: { latitude: 30.3649344, longitude: -97.70007009999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'cedar-park-ymca',
    name: 'YMCA - Cedar Park',
    address: '701 S Bell Blvd, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed', // ⚠️ ARCHIVED 2026-03-30: 701 S Bell matched to Twin Lakes; only Cedar Park YMCA is twin-lakes-ymca-cedar-park
    notes: 'Indoor basketball courts, pool, fitness center',
    location: { latitude: 30.493670200000004, longitude: -97.8096247 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'twin-lakes-ymca-cedar-park',
    name: 'YMCA - Twin Lakes',
    address: '204 E Little Elm Trail, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym, pool, fitness center',
    location: { latitude: 30.493670200000004, longitude: -97.8096247 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'ymca-hays-communities-buda',
    name: 'YMCA - Hays Communities',
    address: '465 Buda Sportsplex Dr, Buda, TX 78610',
    city: 'Buda',
    state: 'TX',
    zip: '78610',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym, pool, fitness center',
    location: { latitude: 30.101023100000003, longitude: -97.8809558 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Austin PARD Recreation Centers (free) ──
  {
    id: 'austin-recreation-center-shoal-creek',
    name: 'Austin Recreation Center',
    address: '1301 Shoal Creek Blvd, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball courts',
    location: { latitude: 30.2781438, longitude: -97.74897039999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'south-austin-recreation-center',
    name: 'South Austin Recreation Center',
    address: '1100 Cumberland Rd, Austin, TX 78704',
    city: 'Austin',
    state: 'TX',
    zip: '78704',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball gym',
    location: { latitude: 30.241666700000003, longitude: -97.7686111 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'givens-recreation-center-austin',
    name: 'Givens Recreation Center',
    address: '3811 E 12th St, Austin, TX 78721',
    city: 'Austin',
    state: 'TX',
    zip: '78721',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball courts',
    location: { latitude: 30.2766667, longitude: -97.69027779999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'gus-garcia-recreation-center',
    name: 'Gus Garcia Recreation Center',
    address: '1201 E Rundberg Ln, Austin, TX 78753',
    city: 'Austin',
    state: 'TX',
    zip: '78753',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball gym',
    location: { latitude: 30.352500000000003, longitude: -97.6819444 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'parque-zaragoza-recreation-center',
    name: 'Parque Zaragoza Recreation Center',
    address: '2608 Gonzales St, Austin, TX 78702',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball courts',
    location: { latitude: 30.2616879, longitude: -97.7115189 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'virginia-brown-recreation-center',
    name: 'Virginia L. Brown Recreation Center',
    address: '7508 Providence Ave, Austin, TX 78752',
    city: 'Austin',
    state: 'TX',
    zip: '78752',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball gym',
    location: { latitude: 30.332720000000002, longitude: -97.6935142 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'dottie-jordan-recreation-center',
    name: 'Dottie Jordan Recreation Center',
    address: '2803 Loyola Ln, Austin, TX 78723',
    city: 'Austin',
    state: 'TX',
    zip: '78723',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball courts',
    location: { latitude: 30.3141765, longitude: -97.67354279999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'turner-roberts-recreation-center',
    name: 'Turner Roberts Recreation Center',
    address: '7201 Colony Loop Dr, Austin, TX 78724',
    city: 'Austin',
    state: 'TX',
    zip: '78724',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball gym',
    location: { latitude: 30.300021399999995, longitude: -97.63668919999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'dove-springs-recreation-center',
    name: 'Dove Springs Recreation Center',
    address: '5801 Ainez Dr, Austin, TX 78744',
    city: 'Austin',
    state: 'TX',
    zip: '78744',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball gym',
    location: { latitude: 30.1875, longitude: -97.7383333 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'west-austin-recreation-center',
    name: 'West Austin Recreation Center',
    address: '1317 W 10th St, Austin, TX 78703',
    city: 'Austin',
    state: 'TX',
    zip: '78703',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball courts',
    location: { latitude: 30.2769829, longitude: -97.757459 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'rosewood-recreation-center-austin',
    name: 'Rosewood Recreation Center',
    address: '2300 Rosewood Ave, Austin, TX 78702',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Austin Parks & Recreation indoor basketball gym',
    location: { latitude: 30.2716274, longitude: -97.71436299999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'wells-branch-recreation-center',
    name: 'Wells Branch Recreation Center',
    address: '3000 Shoreline Dr, Austin, TX 78728',
    city: 'Austin',
    state: 'TX',
    zip: '78728',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball courts, fitness center',
    location: { latitude: 30.454947999999998, longitude: -97.683493 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'del-valle-recreation-center',
    name: 'Del Valle Recreation Center',
    address: '3518 FM 973, Del Valle, TX 78617',
    city: 'Del Valle',
    state: 'TX',
    zip: '78617',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym',
    location: { latitude: 30.199177199999998, longitude: -97.6425932 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Private / commercial gyms ──
  {
    id: 'austin-sports-center-central',
    name: 'Austin Sports Center - Central',
    address: '425 Woodward St, Austin, TX 78704',
    city: 'Austin',
    state: 'TX',
    zip: '78704',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'Multiple indoor basketball courts',
    location: { latitude: 30.227014299999997, longitude: -97.7558394 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'austin-sports-center-north',
    name: 'Austin Sports Center - North',
    address: '1420 Toro Grande Blvd, Austin, TX 78728',
    city: 'Austin',
    state: 'TX',
    zip: '78728',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'Indoor basketball courts',
    location: { latitude: 30.5437927, longitude: -97.7769388 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'lifetime-south-austin',
    name: 'Life Time Fitness - South Austin',
    address: '7101 MoPac Expy, Austin, TX 78731',
    city: 'Austin',
    state: 'TX',
    zip: '78731',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'Indoor basketball courts, pool, fitness center',
    location: { latitude: 30.2152239, longitude: -97.83926009999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: '24-hour-fitness-anderson-mill', // ⚠️ ARCHIVED 2026-03-30: location closed (bankruptcy 2020)
    name: '24 Hour Fitness - Anderson Mill',
    address: '13300 N Hwy 183, Austin, TX 78750',
    city: 'Austin',
    state: 'TX',
    zip: '78750',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court',
    location: { latitude: 30.397427600000004, longitude: -97.7478665 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: '24-hour-fitness-sport-austin', // ⚠️ ARCHIVED 2026-03-30: address unverified, enrichment matched wrong location
    name: '24 Hour Fitness Sport - Austin',
    address: '421 W 3rd St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court, downtown location',
    location: { latitude: 30.301342999999996, longitude: -97.7203279 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'la-fitness-south-lamar',
    name: 'LA Fitness - South Lamar',
    address: '4001 S Lamar Blvd, Austin, TX 78704',
    city: 'Austin',
    state: 'TX',
    zip: '78704',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court, pool, racquetball',
    location: { latitude: 30.2348134, longitude: -97.79176489999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'la-fitness-research-blvd',
    name: 'LA Fitness - Research Blvd',
    address: '10721 Research Blvd, Austin, TX 78759',
    city: 'Austin',
    state: 'TX',
    zip: '78759',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed', // ⚠️ ARCHIVED 2026-03-30: 10721 Research Blvd is now Orangetheory, not LA Fitness
    notes: 'Indoor basketball court, pool, racquetball',
    location: { latitude: 30.397427600000004, longitude: -97.7478665 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Suburbs ──
  {
    id: 'georgetown-recreation-center',
    name: 'Georgetown Recreation Center',
    address: '1003 N Austin Ave, Georgetown, TX 78626',
    city: 'Georgetown',
    state: 'TX',
    zip: '78626',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym, fitness center',
    location: { latitude: 30.651177999999998, longitude: -97.6735624 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'pflugerville-recreation-center',
    name: 'Pflugerville Recreation Center',
    address: '400 Immanuel Rd, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    zip: '78660',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball courts, fitness center',
    location: { latitude: 30.43266, longitude: -97.6125651 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'northeast-metro-park-rec-center',
    name: 'Northeast Metro Park Recreation Center',
    address: '15500 Sun Light Near Way, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    zip: '78660',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym',
    location: { latitude: 30.405827400000003, longitude: -97.59785509999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'brushy-creek-community-center',
    name: 'Brushy Creek Community Center',
    address: '16318 Great Oaks Dr, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    zip: '78681',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Brushy Creek MUD facility with indoor basketball courts',
    location: { latitude: 30.495760899999993, longitude: -97.73555590000001 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'kyle-recreation-center',
    name: 'Kyle Recreation Center',
    address: '1011 W Center St, Kyle, TX 78640',
    city: 'Kyle',
    state: 'TX',
    zip: '78640',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City of Kyle indoor basketball courts',
    location: { latitude: 29.986983499999997, longitude: -97.86214009999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'lakeway-activity-center',
    name: 'Lakeway Activity Center',
    address: '105 Cross Creek, Lakeway, TX 78734',
    city: 'Lakeway',
    state: 'TX',
    zip: '78734',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball gym, fitness center',
    location: { latitude: 30.3624844, longitude: -97.9812816 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'bee-cave-central-park-gym',
    name: 'Bee Cave Central Park Gymnasium',
    address: '13676 Bee Cave Pkwy, Bee Cave, TX 78738',
    city: 'Bee Cave',
    state: 'TX',
    zip: '78738',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City of Bee Cave indoor basketball courts',
    location: { latitude: 30.3144223, longitude: -97.95241569999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'ymca-four-points-austin',
    name: 'YMCA - Four Points',
    address: '8300 N FM 620, Austin, TX 78726',
    city: 'Austin',
    state: 'TX',
    zip: '78726',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball courts, pool, fitness center',
    location: { latitude: 30.4199279, longitude: -97.84884869999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 4 — Added 2026-03-30: Round Rock, Pflugerville, Hutto expansion (7 gyms).
  // Duplicates removed: Clay Madsen, Round Rock Rec Center (301 W Bagdad),
  // Brushy Creek, Pflugerville Rec Center, Georgetown Rec Center.
  // placeId / website / imageUrl / photoGallery pending enrichment pipeline.
  // ---------------------------------------------------------------------------

  {
    id: 'round-rock-sports-center',
    name: 'Round Rock Sports Center',
    address: '2400 Chisholm Trail Rd, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    zip: '78681',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'Large multi-court indoor basketball facility with tournaments and open play',
    location: { latitude: 30.5389854, longitude: -97.6974991 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'chasco-family-ymca-round-rock',
    name: 'CHASCO Family YMCA',
    address: '1801 N Interstate 35, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball courts, pool, fitness center',
    location: { latitude: 30.5263004, longitude: -97.68809499999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'la-fitness-aw-grimes-round-rock',
    name: 'LA Fitness - AW Grimes',
    address: '1000 N AW Grimes Blvd, Round Rock, TX 78665',
    city: 'Round Rock',
    state: 'TX',
    zip: '78665',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court, pool, racquetball',
    location: { latitude: 30.5205181, longitude: -97.6566544 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'la-fitness-rm620-round-rock',
    name: 'LA Fitness - RM 620',
    address: '16600 N RM 620 Rd, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    zip: '78681',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court, pool, racquetball',
    location: { latitude: 30.4982592, longitude: -97.7236748 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: '24-hour-fitness-round-rock', // ⚠️ ARCHIVED 2026-03-30: location closed, matched to Crunch by enrichment
    name: '24 Hour Fitness - Round Rock',
    address: '1201 S Interstate 35, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court',
    location: { latitude: 30.482542699999996, longitude: -97.6766154 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: '24-hour-fitness-pflugerville', // ⚠️ ARCHIVED 2026-03-30: location does not exist at FM 685
    name: '24 Hour Fitness - Pflugerville',
    address: '1900 FM 685, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    zip: '78660',
    type: 'indoor',
    accessType: 'paid',
    status: 'archived',
    defaultRunLevel: 'mixed',
    notes: 'Indoor basketball court',
    location: { latitude: 30.397427600000004, longitude: -97.7478665 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'hutto-family-ymca',
    name: 'Hutto Family YMCA',
    address: '200 Alliance Blvd, Hutto, TX 78634',
    city: 'Hutto',
    state: 'TX',
    zip: '78634',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'Full facility YMCA with indoor gymnasium and basketball programs',
    location: { latitude: 30.543512300000003, longitude: -97.56584099999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 5 — Added 2026-03-30: Outdoor courts — Austin city parks & rec centers
  // (9 courts). Coordinates geocoded via Google Maps API.
  // Note: Givens, South Austin Rec, Dottie Jordan, and Buttermilk share
  // addresses with existing indoor entries but are separate outdoor courts.
  // placeId / website / imageUrl / photoGallery pending enrichment pipeline.
  // ---------------------------------------------------------------------------

  {
    id: 'alamo-pocket-park',
    name: 'Alamo Pocket Park',
    address: '2100 Alamo St, Austin, TX 78702',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City park with outdoor basketball court',
    location: { latitude: 30.2825369, longitude: -97.7203072 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'shipe-neighborhood-park',
    name: 'Shipe Neighborhood Park',
    address: '4400 Avenue G, Austin, TX 78751',
    city: 'Austin',
    state: 'TX',
    zip: '78751',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Hyde Park neighborhood court with regular pickup runs',
    location: { latitude: 30.307414500000004, longitude: -97.7273694 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'northwest-district-park',
    name: 'Northwest District Park',
    address: '7000 Ardath St, Austin, TX 78757',
    city: 'Austin',
    state: 'TX',
    zip: '78757',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court in Northwest Austin',
    location: { latitude: 30.348682999999998, longitude: -97.7413284 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'hancock-rec-center-outdoor',
    name: 'Hancock Recreation Center (Outdoor Court)',
    address: '811 E 41st St, Austin, TX 78751',
    city: 'Austin',
    state: 'TX',
    zip: '78751',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at Hancock Recreation Center',
    location: { latitude: 30.2989817, longitude: -97.7244669 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'givens-rec-outdoor',
    name: 'Givens Recreation Center (Outdoor Courts)',
    address: '3811 E 12th St, Austin, TX 78721',
    city: 'Austin',
    state: 'TX',
    zip: '78721',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: '2 outdoor basketball courts — see also givens-recreation-center-austin for indoor courts',
    location: { latitude: 30.2766667, longitude: -97.69027779999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'buttermilk-neighborhood-park',
    name: 'Buttermilk Neighborhood Park',
    address: '7508 Providence Ave, Austin, TX 78752',
    city: 'Austin',
    state: 'TX',
    zip: '78752',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Multiple outdoor basketball courts',
    location: { latitude: 30.333315, longitude: -97.69588800000001 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'south-austin-rec-outdoor',
    name: 'South Austin Recreation Center (Outdoor Court)',
    address: '1100 Cumberland Rd, Austin, TX 78704',
    city: 'Austin',
    state: 'TX',
    zip: '78704',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court — see also south-austin-recreation-center for indoor',
    location: { latitude: 30.241666700000003, longitude: -97.7686111 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'dottie-jordan-outdoor',
    name: 'Dottie Jordan Neighborhood Park (Outdoor Court)',
    address: '2803 Loyola Ln, Austin, TX 78723',
    city: 'Austin',
    state: 'TX',
    zip: '78723',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Lighted outdoor basketball court',
    location: { latitude: 30.3141513, longitude: -97.67397179999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'eastwoods-park',
    name: 'Eastwoods Park',
    address: '3001 Harris Park Blvd, Austin, TX 78722',
    city: 'Austin',
    state: 'TX',
    zip: '78722',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court in East Austin',
    location: { latitude: 30.2905026, longitude: -97.7318253 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 6 — Added 2026-03-30: Outdoor park courts — Round Rock, Pflugerville,
  // Hutto, Cedar Park (17 courts). Coordinates geocoded via Google Maps API.
  // placeId / website / imageUrl / photoGallery pending enrichment pipeline.
  // ---------------------------------------------------------------------------

  // ── Round Rock parks ──
  {
    id: 'frontier-park-round-rock',
    name: 'Frontier Park',
    address: '810 Lasso Dr, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    zip: '78681',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.4912215, longitude: -97.6882187 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'lake-creek-park-round-rock',
    name: 'Lake Creek Park',
    address: '800 Deerfoot Dr, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Park includes outdoor basketball courts',
    location: { latitude: 30.5094624, longitude: -97.6678505 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'green-slopes-park-round-rock',
    name: 'Green Slopes Park',
    address: '1501 Catherine Ct, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.4956783, longitude: -97.6616328 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'dell-way-park-round-rock',
    name: 'Dell Way Park',
    address: '506 Dell Way, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.487135, longitude: -97.6674637 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'settlement-park-round-rock',
    name: 'Settlement Park',
    address: 'David Curry Dr, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    zip: '78664',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.5355230, longitude: -97.6721517 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'chandler-creek-park-round-rock',
    name: 'Chandler Creek Park',
    address: 'Chandler Creek Trail, Round Rock, TX 78665',
    city: 'Round Rock',
    state: 'TX',
    zip: '78665',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.530903, longitude: -97.65052209999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'cat-hollow-park-round-rock',
    name: 'Cat Hollow Park',
    address: "O'Connor Dr, Round Rock, TX 78681",
    city: 'Round Rock',
    state: 'TX',
    zip: '78681',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.5045781, longitude: -97.7316015 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'sendero-springs-park-round-rock',
    name: 'Sendero Springs Park',
    address: '3002 Luminoso Ln, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    zip: '78681',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.547091799999997, longitude: -97.7365198 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Pflugerville parks ──
  {
    id: 'pfluger-park-pflugerville',
    name: 'Pfluger Park',
    address: '203 Railroad Ave, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    zip: '78660',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Park includes outdoor basketball court',
    location: { latitude: 30.446904999999997, longitude: -97.621938 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'highland-park-pflugerville',
    name: 'Highland Park',
    address: '713 Lassen Volcanic Dr, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    zip: '78660',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.4668699, longitude: -97.61635249999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'heatherwilde-park-pflugerville',
    name: 'Heatherwilde Park',
    address: 'N Heatherwilde Blvd, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    zip: '78660',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.453649899999995, longitude: -97.63849139999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Hutto parks ──
  {
    id: 'hutto-community-park',
    name: 'Hutto Community Park',
    address: '401 Farley St, Hutto, TX 78634',
    city: 'Hutto',
    state: 'TX',
    zip: '78634',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.532342, longitude: -97.5550358 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'fritz-park-hutto',
    name: 'Fritz Park',
    address: '400 Park Ave, Hutto, TX 78634',
    city: 'Hutto',
    state: 'TX',
    zip: '78634',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.5471979, longitude: -97.5417877 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Cedar Park parks ──
  {
    id: 'brushy-creek-sports-park-cedar-park',
    name: 'Brushy Creek Sports Park',
    address: '2310 Brushy Creek Rd, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Confirmed outdoor basketball court at sports park',
    location: { latitude: 30.505499699999998, longitude: -97.77973089999999 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'milburn-park-cedar-park',
    name: 'Milburn Park',
    address: '1901 Sun Chase Blvd, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball courts at city park',
    location: { latitude: 30.4786814, longitude: -97.8418136 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'nelson-ranch-park-cedar-park',
    name: 'Nelson Ranch Park',
    address: '901 Nelson Ranch Rd, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.494561200000003, longitude: -97.8341032 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'creekside-park-cedar-park',
    name: 'Creekside Park',
    address: 'Buttercup Creek Blvd, Cedar Park, TX 78613',
    city: 'Cedar Park',
    state: 'TX',
    zip: '78613',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court at city park',
    location: { latitude: 30.4929336, longitude: -97.8407977 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 7 — Added 2026-04-02: Manually added HOA/community courts with
  // verified coordinates and real photos.
  // ---------------------------------------------------------------------------

  {
    id: 'hoa-harris-branch-basketball-court',
    name: 'HOA Harris Branch Basketball Court',
    address: '11401 Farmhaven Rd, Austin, TX 78754',
    city: 'Austin',
    state: 'TX',
    zip: '78754',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'Outdoor basketball court in the Harris Branch HOA community',
    imageUrl: 'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/hoa-harris-branch-basketball-court/1.jpg',
    photoGallery: [
      'https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/hoa-harris-branch-basketball-court/1.jpg',
    ],
    location: { latitude: 30.351231740052178, longitude: -97.61676429662909 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },

  // ---------------------------------------------------------------------------
  // Batch 8 — Added 2026-04-14: Lansing / East Lansing, Michigan
  // First non-Texas batch. 13 active gyms + 7 school gyms (hidden pending
  // open-gym access confirmation). placeId / website / imageUrl / photoGallery
  // pending enrichment pipeline.
  //
  // ⚠️  COORDINATE NOTICE: All Michigan coordinates are best-estimate based on
  // known addresses. Before going live, right-click each location in Google Maps
  // → "What's here?" and replace latitude / longitude with the exact building or
  // court pin. Do NOT rely solely on these estimates (see file header warning).
  //
  // ⚠️  LAUNCH_REGION: The seed script will print a non-blocking warning for
  // every Michigan gym because their coordinates fall outside the Central Texas
  // bounding box. This is expected and does not prevent seeding.
  // ---------------------------------------------------------------------------

  // ── Commercial Athletic Clubs ──────────────────────────────────────────────

  {
    id: 'court-one-east-lansing',
    name: 'Court One Athletic Club - East',
    address: '2291 Research Circle, Okemos, MI 48864',
    city: 'Okemos',
    state: 'MI',
    zip: '48864',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'Full-service athletic club in Okemos minutes from MSU — indoor basketball courts, fitness center, pool; membership or day pass required',
    location: { latitude: 42.7183, longitude: -84.4077 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'court-one-north-lansing',
    name: 'Court One Athletic Club - North',
    address: '1609 Lake Lansing Rd, Lansing, MI 48912',
    city: 'Lansing',
    state: 'MI',
    zip: '48912',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'Full-service athletic club next to Eastwood Towne Center — indoor basketball courts, tennis, pool; membership or day pass required',
    location: { latitude: 42.7620, longitude: -84.5276 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'aim-high-sports-complex',
    name: 'Aim High Sports Complex',
    address: '7977 Centerline Dr, Dimondale, MI 48821',
    city: 'Dimondale',
    state: 'MI',
    zip: '48821',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: '52,000 sq ft facility with 5 regulation basketball courts, hardwood floors, fitness center, seating for 3,000',
    location: { latitude: 42.6534, longitude: -84.6475 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Michigan State University ──────────────────────────────────────────────

  {
    id: 'msu-im-west',
    name: 'Michigan State University IM West',
    address: '393 Chestnut Rd, East Lansing, MI 48824',
    city: 'East Lansing',
    state: 'MI',
    zip: '48824',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'MSU intramural sports facility west of Spartan Stadium — indoor courts including basketball; open to MSU students, staff, and rec members; day passes sometimes available',
    location: { latitude: 42.7258, longitude: -84.4912 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'msu-im-circle',
    name: 'Michigan State University IM Circle',
    address: '308 W Circle Dr, East Lansing, MI 48824',
    city: 'East Lansing',
    state: 'MI',
    zip: '48824',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'MSU intramural sports facility northeast of Spartan Statue — indoor basketball courts; open to MSU students, staff, and rec members; day passes sometimes available',
    location: { latitude: 42.7337, longitude: -84.4840 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'msu-im-east',
    name: 'Michigan State University IM East',
    address: '804 E Shaw Lane, East Lansing, MI 48824',
    city: 'East Lansing',
    state: 'MI',
    zip: '48824',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'competitive',
    notes: 'MSU intramural sports facility on the east side of campus between Shaw Lane and Wilson Rd — indoor basketball courts; open to MSU students, staff, and rec members; day passes sometimes available',
    location: { latitude: 42.7265, longitude: -84.4688 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── City of Lansing Community Centers ──────────────────────────────────────

  {
    id: 'alfreda-schmidt-community-center',
    name: 'Alfreda Schmidt Community Center',
    address: '1619 Reo Ave, Lansing, MI 48910',
    city: 'Lansing',
    state: 'MI',
    zip: '48910',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'City of Lansing community center with indoor basketball gym',
    location: { latitude: 42.7201, longitude: -84.5793 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'foster-community-center-lansing',
    name: 'Foster Community Center',
    address: '200 N Foster Ave, Lansing, MI 48912',
    city: 'Lansing',
    state: 'MI',
    zip: '48912',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'City of Lansing recreation center with indoor basketball courts',
    location: { latitude: 42.7327, longitude: -84.5294 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'gier-community-center-lansing',
    name: 'Gier Community Center',
    address: '2411 W Holmes Rd, Lansing, MI 48911',
    city: 'Lansing',
    state: 'MI',
    zip: '48911',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'City of Lansing community center with indoor basketball gym, south side',
    location: { latitude: 42.6877, longitude: -84.5815 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── East Lansing Recreation ────────────────────────────────────────────────

  {
    id: 'hannah-community-center-east-lansing',
    name: 'Hannah Community Center',
    address: '819 Abbot Rd, East Lansing, MI 48823',
    city: 'East Lansing',
    state: 'MI',
    zip: '48823',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    defaultRunLevel: 'mixed',
    notes: 'East Lansing Parks & Recreation center with indoor basketball courts — membership or drop-in fee',
    location: { latitude: 42.7373, longitude: -84.4891 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── Outdoor Park Courts ────────────────────────────────────────────────────

  {
    id: 'patriarche-park-east-lansing',
    name: 'Patriarche Park',
    address: '3455 Hagadorn Rd, East Lansing, MI 48823',
    city: 'East Lansing',
    state: 'MI',
    zip: '48823',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City park with outdoor basketball courts',
    location: { latitude: 42.7383, longitude: -84.4636 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'hunter-park-lansing',
    name: 'Hunter Park',
    address: '3001 E Grand River Ave, Lansing, MI 48912',
    city: 'Lansing',
    state: 'MI',
    zip: '48912',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City of Lansing park with outdoor basketball courts',
    location: { latitude: 42.7578, longitude: -84.5354 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'quentin-park-lansing',
    name: 'Quentin Park',
    address: '5411 Quentin Dr, Lansing, MI 48911',
    city: 'Lansing',
    state: 'MI',
    zip: '48911',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City of Lansing park with outdoor basketball courts',
    location: { latitude: 42.7021, longitude: -84.5470 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'frances-park-lansing',
    name: 'Frances Park',
    address: '2701 Moores River Dr, Lansing, MI 48910',
    city: 'Lansing',
    state: 'MI',
    zip: '48910',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    defaultRunLevel: 'casual',
    notes: 'City of Lansing park on the Grand River with outdoor basketball courts',
    location: { latitude: 42.7213, longitude: -84.5901 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },

  // ── High School Gyms — status: hidden ─────────────────────────────────────
  // These are set to hidden because school gyms are not reliably open to the
  // public. Flip each one to status:'active' once you confirm the school runs
  // a community open-gym program or the facility is available for public use.
  // ──────────────────────────────────────────────────────────────────────────

  {
    id: 'holt-high-school-gym',
    name: 'Holt High School Gymnasium',
    address: '5885 Holt Rd, Holt, MI 48842',
    city: 'Holt',
    state: 'MI',
    zip: '48842',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'mixed',
    notes: 'School gym — hidden until open-gym / community access is confirmed',
    location: { latitude: 42.6482, longitude: -84.5183 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'east-lansing-high-school-gym',
    name: 'East Lansing High School Gymnasium',
    address: '509 Burcham Dr, East Lansing, MI 48823',
    city: 'East Lansing',
    state: 'MI',
    zip: '48823',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'mixed',
    notes: 'School gym — hidden until open-gym / community access is confirmed',
    location: { latitude: 42.7399, longitude: -84.4751 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'lansing-catholic-high-school-gym',
    name: 'Lansing Catholic High School Gymnasium',
    address: '501 Marshall St, Lansing, MI 48912',
    city: 'Lansing',
    state: 'MI',
    zip: '48912',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'competitive',
    notes: 'Private Catholic school gym — hidden until community access is confirmed',
    location: { latitude: 42.7316, longitude: -84.5458 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'waverly-high-school-gym',
    name: 'Waverly High School Gymnasium',
    address: '4200 W Michigan Ave, Lansing, MI 48917',
    city: 'Lansing',
    state: 'MI',
    zip: '48917',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'mixed',
    notes: 'School gym — hidden until open-gym / community access is confirmed',
    location: { latitude: 42.7329, longitude: -84.6112 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'everett-high-school-gym',
    name: 'Everett High School Gymnasium',
    address: '3900 Stabler St, Lansing, MI 48910',
    city: 'Lansing',
    state: 'MI',
    zip: '48910',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'mixed',
    notes: 'School gym — hidden until open-gym / community access is confirmed',
    location: { latitude: 42.7009, longitude: -84.5474 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'eastern-hs-don-johnson-field-house',
    name: 'Eastern High School - Don Johnson Field House',
    address: '2800 E Kalamazoo St, Lansing, MI 48912',
    city: 'Lansing',
    state: 'MI',
    zip: '48912',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'competitive',
    notes: 'Arena-style field house at Eastern HS — notable Lansing basketball venue; hidden until community / open-gym access is confirmed',
    location: { latitude: 42.7256, longitude: -84.5052 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
  {
    id: 'sexton-high-school-gym',
    name: 'Sexton High School Gymnasium',
    address: '4025 W Saginaw Hwy, Lansing, MI 48917',
    city: 'Lansing',
    state: 'MI',
    zip: '48917',
    type: 'indoor',
    accessType: 'paid',
    status: 'hidden',
    defaultRunLevel: 'mixed',
    notes: 'School gym — hidden until open-gym / community access is confirmed',
    location: { latitude: 42.7528, longitude: -84.5662 },
    checkInRadiusMeters: 200,
    autoExpireMinutes: 120,
  },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a single gym entry. Returns an object with `errors` (hard failures)
 * and `warnings` (non-blocking issues).
 *
 * @param {object} gym - A gym entry from the `gyms` array.
 * @param {number} index - Array index (for readable error messages).
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateGym(gym, index) {
  const errors = [];
  const warnings = [];
  const prefix = `Gym[${index}] "${gym.name || gym.id || '???'}"`;

  // --- Required string fields ---
  for (const field of ['id', 'name', 'address', 'city', 'state']) {
    if (typeof gym[field] !== 'string' || gym[field].trim() === '') {
      errors.push(`${prefix}: missing or empty required field "${field}".`);
    }
  }

  // --- ID format ---
  if (gym.id && !GYM_ID_PATTERN.test(gym.id)) {
    errors.push(
      `${prefix}: id "${gym.id}" is not valid kebab-case. ` +
      `Expected format: lowercase-words-separated-by-hyphens.`
    );
  }

  // --- Enum fields ---
  if (!VALID_TYPES.includes(gym.type)) {
    errors.push(`${prefix}: type "${gym.type}" is not valid. Expected: ${VALID_TYPES.join(', ')}.`);
  }
  if (!VALID_ACCESS_TYPES.includes(gym.accessType)) {
    errors.push(`${prefix}: accessType "${gym.accessType}" is not valid. Expected: ${VALID_ACCESS_TYPES.join(', ')}.`);
  }
  if (!VALID_STATUSES.includes(gym.status)) {
    errors.push(`${prefix}: status "${gym.status}" is not valid. Expected: ${VALID_STATUSES.join(', ')}.`);
  }

  // --- Location ---
  if (!gym.location || typeof gym.location !== 'object') {
    errors.push(`${prefix}: missing "location" object.`);
  } else {
    const { latitude, longitude } = gym.location;
    if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
      errors.push(`${prefix}: location.latitude is invalid (got ${latitude}).`);
    }
    if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
      errors.push(`${prefix}: location.longitude is invalid (got ${longitude}).`);
    }

    // Region warning (not a hard failure)
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      (latitude < LAUNCH_REGION.latMin ||
        latitude > LAUNCH_REGION.latMax ||
        longitude < LAUNCH_REGION.lngMin ||
        longitude > LAUNCH_REGION.lngMax)
    ) {
      warnings.push(
        `${prefix}: coordinates (${latitude}, ${longitude}) are outside the ` +
        `${LAUNCH_REGION.label} launch region. This is allowed but may indicate a data entry error.`
      );
    }
  }

  // --- Numeric fields ---
  if (typeof gym.checkInRadiusMeters !== 'number' || gym.checkInRadiusMeters <= 0) {
    errors.push(`${prefix}: checkInRadiusMeters must be a positive number (got ${gym.checkInRadiusMeters}).`);
  }
  if (typeof gym.autoExpireMinutes !== 'number' || gym.autoExpireMinutes <= 0) {
    errors.push(`${prefix}: autoExpireMinutes must be a positive number (got ${gym.autoExpireMinutes}).`);
  }

  // --- System-managed fields should not be in seed data ---
  for (const field of SYSTEM_MANAGED_FIELDS) {
    if (field in gym) {
      errors.push(
        `${prefix}: contains system-managed field "${field}". ` +
        `Remove it from seed data — merge:true would overwrite live values.`
      );
    }
  }

  // --- Image URL (optional but validate if present) ---
  if (gym.imageUrl !== undefined) {
    if (typeof gym.imageUrl !== 'string' || !gym.imageUrl.startsWith('https://')) {
      warnings.push(`${prefix}: imageUrl should be an HTTPS URL (got "${gym.imageUrl}").`);
    } else if (!gym.imageUrl.includes('firebasestorage.googleapis.com')) {
      warnings.push(
        `${prefix}: imageUrl points to an external host. ` +
        `Migrate to Firebase Storage (gymImages/${gym.id}.jpg) when possible.`
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validates the entire gyms array. Checks individual entries plus cross-entry
 * rules (duplicate IDs).
 *
 * @param {object[]} gymList - The gyms array.
 * @returns {{ errors: string[], warnings: string[], valid: boolean }}
 */
function validateAll(gymList) {
  let allErrors = [];
  let allWarnings = [];

  // Per-gym validation
  gymList.forEach((gym, i) => {
    const { errors, warnings } = validateGym(gym, i);
    allErrors = allErrors.concat(errors);
    allWarnings = allWarnings.concat(warnings);
  });

  // Cross-entry: duplicate IDs
  const ids = gymList.map((g) => g.id);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      allErrors.push(`Duplicate gym ID: "${id}". Each gym must have a unique ID.`);
    }
    seen.add(id);
  }

  return {
    errors: allErrors,
    warnings: allWarnings,
    valid: allErrors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seed(validateOnly) {
  console.log('=== RunCheck Gym Seed Script ===\n');

  // --- Validate ---
  console.log(`Validating ${gyms.length} gym(s)...\n`);
  const { errors, warnings, valid } = validateAll(gyms);

  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach((w) => console.log(`   ${w}`));
    console.log('');
  }

  if (!valid) {
    console.log('❌ Validation FAILED:');
    errors.forEach((e) => console.log(`   ${e}`));
    console.log('\nFix the errors above before seeding.');
    process.exit(1);
  }

  console.log('✅ Validation passed.\n');

  if (validateOnly) {
    console.log('--validate flag set. Skipping Firestore writes.');
    process.exit(0);
  }

  // --- Initialize Firebase Admin ---
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  // --- Write to Firestore ---
  console.log('Seeding production gyms...\n');

  for (const gym of gyms) {
    const { id, ...data } = gym;
    const docRef = db.collection('gyms').doc(id);

    // Check if document exists to decide whether to set createdAt
    const existing = await docRef.get();

    const writeData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!existing.exists) {
      writeData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      console.log(`  + ${gym.name} (new)`);
    } else {
      console.log(`  ~ ${gym.name} (updated)`);
    }

    await docRef.set(writeData, { merge: true });
  }

  console.log(`\n✅ Done — ${gyms.length} gym(s) seeded.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const validateOnly = process.argv.includes('--validate');

seed(validateOnly).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
