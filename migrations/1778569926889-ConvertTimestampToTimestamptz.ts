import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertTimestampToTimestamptz1778569926889 implements MigrationInterface {
  name = 'ConvertTimestampToTimestamptz1778569926889';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "venues" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "venues" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "organization" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "concert" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "concert" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "concertSession" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "ticketType" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "order" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "order" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportSession" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportSchedule" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "supportSchedule" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportMessage" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportKnowledgeBase" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "supportKnowledgeBase" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "payment" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "payment" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "concertReview" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "concertReview" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE \'UTC\'');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "concertReview" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "concertReview" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "payment" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "payment" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportKnowledgeBase" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "supportKnowledgeBase" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportMessage" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportSchedule" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "supportSchedule" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "supportSession" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "order" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "order" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "ticketType" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "concertSession" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "concert" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "concert" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "organization" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');

    await queryRunner.query('ALTER TABLE "venues" ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE \'UTC\'');
    await queryRunner.query('ALTER TABLE "venues" ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE \'UTC\'');
  }
}
