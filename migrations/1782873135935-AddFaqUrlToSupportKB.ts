import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFaqUrlToSupportKB1782873135935 implements MigrationInterface {
    name = 'AddFaqUrlToSupportKB1782873135935';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "supportKnowledgeBase" ADD "faqUrl" character varying(500)');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "supportKnowledgeBase" DROP COLUMN "faqUrl"');
    }

}
