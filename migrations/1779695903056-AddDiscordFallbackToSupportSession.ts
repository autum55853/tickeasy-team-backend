import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscordFallbackToSupportSession1779695903056 implements MigrationInterface {
    name = 'AddDiscordFallbackToSupportSession1779695903056';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "supportSession" ADD "discordMessageId" character varying(30)');
        await queryRunner.query('ALTER TABLE "supportSession" ADD "discordFallbackAt" TIMESTAMP');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "supportSession" DROP COLUMN "discordFallbackAt"');
        await queryRunner.query('ALTER TABLE "supportSession" DROP COLUMN "discordMessageId"');
    }

}
