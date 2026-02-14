/**
 * Seed Database Script
 *
 * Run this script to populate Firebase with initial gym data
 *
 * Usage: node scripts/seedDatabase.js
 */

const { seedGyms } = require('../services/gymService');

async function main() {
  console.log('🌱 Starting database seed...\n');

  try {
    const gyms = await seedGyms();

    console.log(`\n✅ Successfully seeded ${gyms.length} gyms:`);
    gyms.forEach((gym, index) => {
      console.log(`${index + 1}. ${gym.name} (${gym.city}, ${gym.state})`);
    });

    console.log('\n🎉 Database seed complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

main();
