import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeReservationFieldsNullable1714579000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make productId nullable
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "productId" DROP NOT NULL`,
    );

    // Make quantity nullable
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "quantity" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Make productId NOT NULL
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "productId" SET NOT NULL`,
    );

    // Revert: Make quantity NOT NULL
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "quantity" SET NOT NULL`,
    );
  }
}
