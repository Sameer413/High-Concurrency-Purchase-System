import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductIndexes1685000000000 implements MigrationInterface {
  name = 'AddProductIndexes1685000000000';
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index defined on the entity level
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY "IDX_product_isActive_category_price"
      ON "products" ("isActive", "category", "price");
    `);

    // Single‑column indexes
    await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_product_price" ON "products" ("price");`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_product_category" ON "products" ("category");`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_product_isNew" ON "products" ("isNew");`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_product_rating" ON "products" ("rating");`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_product_isActive" ON "products" ("isActive");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_isActive";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_rating";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_isNew";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_price";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_name";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_isActive_category_price";`);
  }
}
