const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const gyms = [
  {
    id: 'pan-american-recreation-center',
    name: 'Pan American Recreation Center',
    address: '2100 E 3rd St, Austin, TX 78702',
    city: 'Austin',
    type: 'indoor',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlugK3VDdlosE9o97HH-NdRI89Eww_GHZaHQ&s',
    currentPresenceCount: 0,
    autoExpireMinutes: 180,
    checkInRadiusMeters: 100,
    location: { latitude: 30.2626, longitude: -97.7198 },
  },
  {
    id: 'lifetime-austin-north',
    name: 'Life Time Austin North',
    address: '13725 Ranch Rd 620 N, Austin, TX 78717',
    city: 'Austin',
    type: 'indoor',
    imageUrl: 'https://media.lifetime.life/is/image/lifetimeinc/fso-gymnasium-01-1?crop=362,224,1360,1088&id=1701881564012&fit=crop,1&wid=390',
    currentPresenceCount: 0,
    autoExpireMinutes: 180,
    checkInRadiusMeters: 100,
    location: { latitude: 30.4572, longitude: -97.8147 },
  },
  {
    id: 'golds-gym-hesters-crossing',
    name: "Gold's Gym Hester's Crossing",
    address: '2400 S I-35 Frontage Rd, Round Rock, TX 78681',
    city: 'Round Rock',
    type: 'indoor',
    imageUrl: 'https://res.cloudinary.com/ggus-dev/image/private/s--HzKSnHnn--/c_auto%2Cg_center%2Cw_1200%2Ch_800/v1/25fcf1e9/austin-hesters-crossing-basketball.webp?_a=BAAAV6DQ',
    currentPresenceCount: 0,
    autoExpireMinutes: 180,
    checkInRadiusMeters: 100,
    location: { latitude: 30.5085, longitude: -97.6789 },
  },
];

async function seed() {
  console.log('🌱 Seeding production gyms...\n');
  for (const gym of gyms) {
    const { id, ...data } = gym;
    await db.collection('gyms').doc(id).set(data, { merge: true });
    console.log(`✅ ${gym.name}`);
  }
  console.log('\n🏀 Done!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
