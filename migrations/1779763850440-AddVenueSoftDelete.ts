import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVenueSoftDelete1779763850440 implements MigrationInterface {
    name = 'AddVenueSoftDelete1779763850440';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "venues" ADD "deletedAt" TIMESTAMP');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "venues" DROP COLUMN "deletedAt"');
    }

}
