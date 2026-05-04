import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeyToPayments1746230400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add idempotencyKey column to payments table
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(255) NULL`,
    );

    // 2. Create unique partial index on idempotencyKey (only for non-null values)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_idempotency_key" 
       ON "payments" ("idempotencyKey") 
       WHERE "idempotencyKey" IS NOT NULL`,
    );

    // 3. Add index on razorpayOrderId for better query performance
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_razorpay_order_id" 
       ON "payments" ("razorpayOrderId")`,
    );

    // 4. Add index on razorpayPaymentId for better query performance
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_razorpay_payment_id" 
       ON "payments" ("razorpayPaymentId") 
       WHERE "razorpayPaymentId" IS NOT NULL`,
    );

    console.log('✅ Idempotency key column and indexes added successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payments_razorpay_payment_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payments_razorpay_order_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payments_idempotency_key"`,
    );

    // 2. Drop idempotencyKey column
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN IF EXISTS "idempotencyKey"`,
    );

    console.log('✅ Idempotency key column and indexes removed successfully');
  }
}
