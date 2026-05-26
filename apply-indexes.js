const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyIndexes() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'root',
    database: 'clothing_store',
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    const sqlFile = path.join(__dirname, 'src/database/migrations/add-performance-indexes.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('📊 Applying performance indexes...\n');

    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.includes('CREATE INDEX')) {
        const indexName = statement.match(/idx_\w+/)?.[0] || 'unknown';
        process.stdout.write(`  Creating ${indexName}... `);
        
        try {
          await client.query(statement);
          console.log('✓');
        } catch (error) {
          if (error.code === '42P07') {
            console.log('(already exists)');
          } else {
            console.log(`✗ ${error.message}`);
          }
        }
      } else if (statement.includes('ANALYZE')) {
        const tableName = statement.match(/ANALYZE (\w+)/)?.[1] || 'unknown';
        process.stdout.write(`  Analyzing ${tableName}... `);
        
        try {
          await client.query(statement);
          console.log('✓');
        } catch (error) {
          console.log(`✗ ${error.message}`);
        }
      }
    }

    console.log('\n✅ Performance indexes applied successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyIndexes();
