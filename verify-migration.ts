import { AppDataSource } from './src/database/data-source';

async function verifyMigration() {
  try {
    console.log('🔄 Connecting to database...');
    await AppDataSource.initialize();

    // Check if idempotencyKey column exists
    const result = await AppDataSource.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'idempotencyKey'
    `);

    if (result.length > 0) {
      console.log('✅ idempotencyKey column exists:');
      console.log('   Type:', result[0].data_type);
      console.log('   Max Length:', result[0].character_maximum_length);
      console.log('   Nullable:', result[0].is_nullable);
    } else {
      console.log('❌ idempotencyKey column not found');
    }

    // Check indexes
    const indexes = await AppDataSource.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'payments'
      AND indexname LIKE '%idempotency%'
    `);

    if (indexes.length > 0) {
      console.log('\n✅ Idempotency indexes:');
      indexes.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });
    }

    // Check all payment-related indexes
    const allIndexes = await AppDataSource.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'payments'
      ORDER BY indexname
    `);

    console.log('\n📋 All payment table indexes:');
    allIndexes.forEach((idx: any) => {
      console.log(`   - ${idx.indexname}`);
    });

    await AppDataSource.destroy();
    console.log('\n✅ Verification completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyMigration();
