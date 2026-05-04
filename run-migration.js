/**
 * Quick migration script to fix reservations table schema
 * Run with: node run-migration.js
 */

const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'nestjs_app',
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    console.log('\n📝 Running migration: Make reservations fields nullable...');

    // Make productId nullable
    await client.query(
      'ALTER TABLE "reservations" ALTER COLUMN "productId" DROP NOT NULL'
    );
    console.log('✅ Made productId nullable');

    // Make quantity nullable
    await client.query(
      'ALTER TABLE "reservations" ALTER COLUMN "quantity" DROP NOT NULL'
    );
    console.log('✅ Made quantity nullable');

    // Verify changes
    console.log('\n🔍 Verifying changes...');
    const result = await client.query(`
      SELECT 
        column_name, 
        is_nullable, 
        data_type
      FROM information_schema.columns 
      WHERE table_name = 'reservations' 
        AND column_name IN ('productId', 'quantity')
      ORDER BY column_name
    `);

    console.log('\n📊 Current schema:');
    console.table(result.rows);

    console.log('\n✅ Migration completed successfully!');
    console.log('🚀 You can now restart your backend server and test the Buy Now flow.');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n💡 You can also run the SQL manually:');
    console.error('   psql -U postgres -d nestjs_app -f fix-reservations-schema.sql');
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

runMigration();
