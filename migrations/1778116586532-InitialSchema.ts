import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1778116586532 implements MigrationInterface {
    name = 'InitialSchema1778116586532'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "venues" ("venueId" uuid NOT NULL DEFAULT uuid_generate_v4(), "venueName" character varying(100) NOT NULL, "venueDescription" text, "venueAddress" character varying(200) NOT NULL, "venueCapacity" integer, "venueImageUrl" character varying(255), "googleMapUrl" character varying(255), "isAccessible" boolean NOT NULL DEFAULT false, "hasParking" boolean NOT NULL DEFAULT false, "hasTransit" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_57b9556731ee08376830177b81f" PRIMARY KEY ("venueId"))`);
        await queryRunner.query(`CREATE TABLE "organization" ("organizationId" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "orgName" character varying(100) NOT NULL, "orgAddress" character varying(100) NOT NULL, "orgMail" character varying(100), "orgContact" character varying(1000), "orgMobile" character varying(200), "orgPhone" character varying(200), "orgWebsite" character varying(200), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_9c8e76759bb851ff83c4d6ef41a" UNIQUE ("orgName"), CONSTRAINT "PK_7867970695572b3f6561516414d" PRIMARY KEY ("organizationId"))`);
        await queryRunner.query(`CREATE TABLE "locationTag" ("locationTagId" uuid NOT NULL DEFAULT uuid_generate_v4(), "locationTagName" character varying(50) NOT NULL, "subLabel" character varying(50), CONSTRAINT "PK_7c942cbe282554eebae2d58c71d" PRIMARY KEY ("locationTagId"))`);
        await queryRunner.query(`CREATE TABLE "musicTag" ("musicTagId" uuid NOT NULL DEFAULT uuid_generate_v4(), "musicTagName" character varying(50) NOT NULL, "subLabel" character varying(100), CONSTRAINT "PK_128deaeb1ae47f8d77e6f7f19a3" PRIMARY KEY ("musicTagId"))`);
        await queryRunner.query(`CREATE TYPE "public"."concert_coninfostatus_enum" AS ENUM('draft', 'reviewing', 'published', 'rejected', 'finished')`);
        await queryRunner.query(`CREATE TYPE "public"."concert_reviewstatus_enum" AS ENUM('pending', 'approved', 'rejected', 'skipped')`);
        await queryRunner.query(`CREATE TABLE "concert" ("concertId" uuid NOT NULL DEFAULT uuid_generate_v4(), "organizationId" uuid NOT NULL, "venueId" uuid, "locationTagId" uuid, "musicTagId" uuid, "conTitle" character varying(50) NOT NULL, "conIntroduction" character varying(30000), "conLocation" character varying(50), "conAddress" character varying(2000), "eventStartDate" date, "eventEndDate" date, "imgBanner" character varying(255), "ticketPurchaseMethod" character varying(10000), "precautions" character varying(20000), "refundPolicy" character varying(10000), "conInfoStatus" "public"."concert_coninfostatus_enum" NOT NULL DEFAULT 'draft', "reviewStatus" "public"."concert_reviewstatus_enum" NOT NULL DEFAULT 'skipped', "reviewNote" text, "visitCount" integer NOT NULL DEFAULT '0', "promotion" integer, "cancelledAt" TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_367869ca08bcc5b0c86421f5f24" PRIMARY KEY ("concertId"))`);
        await queryRunner.query(`CREATE TABLE "concertSession" ("sessionId" uuid NOT NULL DEFAULT uuid_generate_v4(), "concertId" uuid NOT NULL, "sessionDate" date, "sessionStart" TIME, "sessionEnd" TIME, "sessionTitle" character varying(100), "imgSeattable" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_777b5a081c2928b81ac48601882" PRIMARY KEY ("sessionId"))`);
        await queryRunner.query(`CREATE TABLE "ticketType" ("ticketTypeId" uuid NOT NULL DEFAULT uuid_generate_v4(), "concertSessionId" uuid NOT NULL, "ticketTypeName" character varying(50), "entranceType" character varying(50), "ticketBenefits" text, "ticketRefundPolicy" text, "ticketTypePrice" numeric(10,2), "totalQuantity" integer, "remainingQuantity" integer, "sellBeginDate" TIMESTAMP, "sellEndDate" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_81afbd1b45403e4f8217139daeb" PRIMARY KEY ("ticketTypeId"))`);
        await queryRunner.query(`CREATE TYPE "public"."ticket_status_enum" AS ENUM('purchased', 'refunded', 'used')`);
        await queryRunner.query(`CREATE TABLE "ticket" ("ticketId" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "ticketTypeId" uuid NOT NULL, "userId" uuid NOT NULL, "purchaserName" character varying(100), "purchaserEmail" character varying(100), "concertStartTime" TIMESTAMP NOT NULL, "seatNumber" character varying(100), "qrCode" character varying(255), "status" "public"."ticket_status_enum" NOT NULL, "purchaseTime" TIMESTAMP NOT NULL, CONSTRAINT "UQ_530e64c8a5893a7fb5767dffb7b" UNIQUE ("qrCode"), CONSTRAINT "PK_d7f0cf291bf98aaea42f73ad92f" PRIMARY KEY ("ticketId"))`);
        await queryRunner.query(`CREATE TYPE "public"."order_orderstatus_enum" AS ENUM('held', 'expired', 'paid', 'cancelled', 'refunded')`);
        await queryRunner.query(`CREATE TABLE "order" ("orderId" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticketTypeId" uuid NOT NULL, "userId" uuid NOT NULL, "orderStatus" "public"."order_orderstatus_enum" NOT NULL, "isLocked" boolean NOT NULL DEFAULT true, "lockToken" character varying(100) NOT NULL, "lockExpireTime" TIMESTAMP NOT NULL, "purchaserName" character varying(50), "purchaserEmail" character varying(100), "purchaserPhone" character varying(50), "invoicePlatform" character varying(50), "invoiceType" character varying(50), "invoiceCarrier" character varying(100), "invoiceStatus" character varying(50), "invoiceNumber" character varying(50), "invoiceUrl" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP DEFAULT now(), "orderNumber" character varying(32) NOT NULL, CONSTRAINT "UQ_4e9f8dd16ec084bca97b3262edb" UNIQUE ("orderNumber"), CONSTRAINT "PK_b075313d4d7e1c12f1a6e6359e8" PRIMARY KEY ("orderId"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin', 'superuser')`);
        await queryRunner.query(`CREATE TYPE "public"."users_gender_enum" AS ENUM('male', 'female', 'other')`);
        await queryRunner.query(`CREATE TYPE "public"."users_preferredregions_enum" AS ENUM('北部', '南部', '東部', '中部', '離島', '海外')`);
        await queryRunner.query(`CREATE TYPE "public"."users_preferredeventtypes_enum" AS ENUM('流行音樂', '搖滾', '電子音樂', '嘻哈', '爵士藍調', '古典音樂', '其他')`);
        await queryRunner.query(`CREATE TABLE "users" ("userId" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(100) NOT NULL, "password" character varying(60), "name" character varying(50) NOT NULL, "nickname" character varying(20), "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "phone" character varying(20), "birthday" date, "gender" "public"."users_gender_enum", "preferredRegions" "public"."users_preferredregions_enum" array DEFAULT '{}', "preferredEventTypes" "public"."users_preferredeventtypes_enum" array DEFAULT '{}', "country" character varying(20), "address" character varying(100), "avatar" character varying(255), "verificationToken" character varying(50), "verificationTokenExpires" TIMESTAMP, "isEmailVerified" boolean NOT NULL DEFAULT false, "passwordResetToken" character varying(50), "passwordResetExpires" TIMESTAMP, "lastVerificationAttempt" TIMESTAMP, "lastPasswordResetAttempt" TIMESTAMP, "oauthProviders" jsonb NOT NULL DEFAULT '[]', "searchHistory" jsonb DEFAULT '[]', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_8bf09ba754322ab9c22a215c919" PRIMARY KEY ("userId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_ace513fa30d485cfd25c11a9e4" ON "users" ("role") `);
        await queryRunner.query(`CREATE TYPE "public"."SupportSessionType" AS ENUM('bot', 'human', 'mixed')`);
        await queryRunner.query(`CREATE TYPE "public"."SupportSessionStatus" AS ENUM('active', 'waiting', 'closed', 'transferred')`);
        await queryRunner.query(`CREATE TYPE "public"."SupportSessionPriority" AS ENUM('low', 'normal', 'high', 'urgent')`);
        await queryRunner.query(`CREATE TABLE "supportSession" ("supportSessionId" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "sessionType" "public"."SupportSessionType" NOT NULL DEFAULT 'bot', "status" "public"."SupportSessionStatus" NOT NULL DEFAULT 'active', "agentId" uuid, "priority" "public"."SupportSessionPriority" NOT NULL DEFAULT 'normal', "category" character varying(50), "firstResponseAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "closedAt" TIMESTAMP, "satisfactionRating" integer, "satisfactionComment" text, CONSTRAINT "PK_7727461c115500f559a53f4d311" PRIMARY KEY ("supportSessionId"))`);
        await queryRunner.query(`CREATE TABLE "supportSchedule" ("supportScheduleId" uuid NOT NULL DEFAULT uuid_generate_v4(), "agentId" uuid NOT NULL, "dayOfWeek" integer NOT NULL, "startTime" TIME NOT NULL, "endTime" TIME NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ad3ea25d563c523b626826e5073" PRIMARY KEY ("supportScheduleId"))`);
        await queryRunner.query(`CREATE TYPE "public"."SupportMessageSender" AS ENUM('user', 'bot', 'agent')`);
        await queryRunner.query(`CREATE TYPE "public"."SupportMessageType" AS ENUM('text', 'image', 'file', 'quick_reply', 'faq_suggestion')`);
        await queryRunner.query(`CREATE TABLE "supportMessage" ("supportMessageId" uuid NOT NULL DEFAULT uuid_generate_v4(), "sessionId" uuid NOT NULL, "senderType" "public"."SupportMessageSender" NOT NULL, "senderId" uuid, "messageText" text, "messageType" "public"."SupportMessageType" NOT NULL DEFAULT 'text', "metadata" jsonb NOT NULL DEFAULT '{}', "isRead" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9092a52a4f662d99cfdc1e1c8d8" PRIMARY KEY ("supportMessageId"))`);
        await queryRunner.query(`CREATE TABLE "supportKnowledgeBase" ("supportKBId" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(200) NOT NULL, "content" text NOT NULL, "tags" text array NOT NULL DEFAULT '{}', "category" character varying(50), "embeddingVector" jsonb, "isActive" boolean NOT NULL DEFAULT true, "ruleId" character varying(100), "replyType" character varying(20), "keywords" text array NOT NULL DEFAULT '{}', "priority" integer NOT NULL DEFAULT '3', "tutorialUrl" character varying(500), "tutorialDescription" text, "faqAnswer" text, "relatedQuestions" text array NOT NULL DEFAULT '{}', "viewCount" integer NOT NULL DEFAULT '0', "helpfulCount" integer NOT NULL DEFAULT '0', "notHelpfulCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_eecead858e3e9ec7e6ebf142b61" PRIMARY KEY ("supportKBId"))`);
        await queryRunner.query(`CREATE TYPE "public"."payment_status_enum" AS ENUM('pending', 'completed', 'failed', 'refunded')`);
        await queryRunner.query(`CREATE TABLE "payment" ("paymentId" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "method" character varying(50) NOT NULL, "provider" character varying(50), "status" "public"."payment_status_enum" NOT NULL, "amount" numeric(10,2) NOT NULL, "currency" character varying(10) NOT NULL DEFAULT 'TWD', "paidAt" TIMESTAMP, "transactionId" character varying, "rawPayload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP DEFAULT now(), "tradeNo" character varying(50), CONSTRAINT "UQ_5a94d89eb4e8dea7f1ac2d8beba" UNIQUE ("transactionId"), CONSTRAINT "PK_67ee4523b649947b6a7954dc673" PRIMARY KEY ("paymentId"))`);
        await queryRunner.query(`CREATE TYPE "public"."concertReview_reviewstatus_enum" AS ENUM('pending', 'approved', 'rejected', 'skipped')`);
        await queryRunner.query(`CREATE TABLE "concertReview" ("reviewId" uuid NOT NULL DEFAULT uuid_generate_v4(), "concertId" uuid NOT NULL, "reviewType" character varying(20) NOT NULL, "reviewStatus" "public"."concertReview_reviewstatus_enum" NOT NULL DEFAULT 'pending', "reviewNote" text, "aiResponse" jsonb, "reviewerId" character varying(100), "reviewerNote" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_33566980752e53d76c13cf55f4a" PRIMARY KEY ("reviewId"))`);
        await queryRunner.query(`ALTER TABLE "organization" ADD CONSTRAINT "FK_b0d30285f6775593196167e2016" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "concert" ADD CONSTRAINT "FK_30c544cde81f6c376020c0f5b90" FOREIGN KEY ("organizationId") REFERENCES "organization"("organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "concert" ADD CONSTRAINT "FK_b8c97e75c80a18f687bbaa72871" FOREIGN KEY ("venueId") REFERENCES "venues"("venueId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "concert" ADD CONSTRAINT "FK_21bd010735c7e4adc27ff46d697" FOREIGN KEY ("locationTagId") REFERENCES "locationTag"("locationTagId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "concert" ADD CONSTRAINT "FK_a52c799209e63921d3e5e32e5ae" FOREIGN KEY ("musicTagId") REFERENCES "musicTag"("musicTagId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "concertSession" ADD CONSTRAINT "FK_5d96d235356b939822ad3c5f732" FOREIGN KEY ("concertId") REFERENCES "concert"("concertId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticketType" ADD CONSTRAINT "FK_cde1aa9f6bf424b8484ad1b0fae" FOREIGN KEY ("concertSessionId") REFERENCES "concertSession"("sessionId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket" ADD CONSTRAINT "FK_8f4c2f0a2877e526e8881b51464" FOREIGN KEY ("orderId") REFERENCES "order"("orderId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket" ADD CONSTRAINT "FK_7061359da242fbf565771953137" FOREIGN KEY ("ticketTypeId") REFERENCES "ticketType"("ticketTypeId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket" ADD CONSTRAINT "FK_0e01a7c92f008418bad6bad5919" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_36369a70c27d63a464ebf2c8599" FOREIGN KEY ("ticketTypeId") REFERENCES "ticketType"("ticketTypeId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_caabe91507b3379c7ba73637b84" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "supportSession" ADD CONSTRAINT "FK_e3777806b6d44c36bfedd181f6d" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "supportSession" ADD CONSTRAINT "FK_5cc982d17cabf70598ded04ec34" FOREIGN KEY ("agentId") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "supportSchedule" ADD CONSTRAINT "FK_3f522d47e7adb35662a63bc2eae" FOREIGN KEY ("agentId") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "supportMessage" ADD CONSTRAINT "FK_e572ce51d8c47cbebc1f9140c03" FOREIGN KEY ("sessionId") REFERENCES "supportSession"("supportSessionId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "supportMessage" ADD CONSTRAINT "FK_df28f55020d0a745cbbd6c0f4db" FOREIGN KEY ("senderId") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "FK_d09d285fe1645cd2f0db811e293" FOREIGN KEY ("orderId") REFERENCES "order"("orderId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "concertReview" ADD CONSTRAINT "FK_0f8381f147592d49a3ca328caa3" FOREIGN KEY ("concertId") REFERENCES "concert"("concertId") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "concertReview" DROP CONSTRAINT "FK_0f8381f147592d49a3ca328caa3"`);
        await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "FK_d09d285fe1645cd2f0db811e293"`);
        await queryRunner.query(`ALTER TABLE "supportMessage" DROP CONSTRAINT "FK_df28f55020d0a745cbbd6c0f4db"`);
        await queryRunner.query(`ALTER TABLE "supportMessage" DROP CONSTRAINT "FK_e572ce51d8c47cbebc1f9140c03"`);
        await queryRunner.query(`ALTER TABLE "supportSchedule" DROP CONSTRAINT "FK_3f522d47e7adb35662a63bc2eae"`);
        await queryRunner.query(`ALTER TABLE "supportSession" DROP CONSTRAINT "FK_5cc982d17cabf70598ded04ec34"`);
        await queryRunner.query(`ALTER TABLE "supportSession" DROP CONSTRAINT "FK_e3777806b6d44c36bfedd181f6d"`);
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_caabe91507b3379c7ba73637b84"`);
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_36369a70c27d63a464ebf2c8599"`);
        await queryRunner.query(`ALTER TABLE "ticket" DROP CONSTRAINT "FK_0e01a7c92f008418bad6bad5919"`);
        await queryRunner.query(`ALTER TABLE "ticket" DROP CONSTRAINT "FK_7061359da242fbf565771953137"`);
        await queryRunner.query(`ALTER TABLE "ticket" DROP CONSTRAINT "FK_8f4c2f0a2877e526e8881b51464"`);
        await queryRunner.query(`ALTER TABLE "ticketType" DROP CONSTRAINT "FK_cde1aa9f6bf424b8484ad1b0fae"`);
        await queryRunner.query(`ALTER TABLE "concertSession" DROP CONSTRAINT "FK_5d96d235356b939822ad3c5f732"`);
        await queryRunner.query(`ALTER TABLE "concert" DROP CONSTRAINT "FK_a52c799209e63921d3e5e32e5ae"`);
        await queryRunner.query(`ALTER TABLE "concert" DROP CONSTRAINT "FK_21bd010735c7e4adc27ff46d697"`);
        await queryRunner.query(`ALTER TABLE "concert" DROP CONSTRAINT "FK_b8c97e75c80a18f687bbaa72871"`);
        await queryRunner.query(`ALTER TABLE "concert" DROP CONSTRAINT "FK_30c544cde81f6c376020c0f5b90"`);
        await queryRunner.query(`ALTER TABLE "organization" DROP CONSTRAINT "FK_b0d30285f6775593196167e2016"`);
        await queryRunner.query(`DROP TABLE "concertReview"`);
        await queryRunner.query(`DROP TYPE "public"."concertReview_reviewstatus_enum"`);
        await queryRunner.query(`DROP TABLE "payment"`);
        await queryRunner.query(`DROP TYPE "public"."payment_status_enum"`);
        await queryRunner.query(`DROP TABLE "supportKnowledgeBase"`);
        await queryRunner.query(`DROP TABLE "supportMessage"`);
        await queryRunner.query(`DROP TYPE "public"."SupportMessageType"`);
        await queryRunner.query(`DROP TYPE "public"."SupportMessageSender"`);
        await queryRunner.query(`DROP TABLE "supportSchedule"`);
        await queryRunner.query(`DROP TABLE "supportSession"`);
        await queryRunner.query(`DROP TYPE "public"."SupportSessionPriority"`);
        await queryRunner.query(`DROP TYPE "public"."SupportSessionStatus"`);
        await queryRunner.query(`DROP TYPE "public"."SupportSessionType"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ace513fa30d485cfd25c11a9e4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_preferredeventtypes_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_preferredregions_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_gender_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "order"`);
        await queryRunner.query(`DROP TYPE "public"."order_orderstatus_enum"`);
        await queryRunner.query(`DROP TABLE "ticket"`);
        await queryRunner.query(`DROP TYPE "public"."ticket_status_enum"`);
        await queryRunner.query(`DROP TABLE "ticketType"`);
        await queryRunner.query(`DROP TABLE "concertSession"`);
        await queryRunner.query(`DROP TABLE "concert"`);
        await queryRunner.query(`DROP TYPE "public"."concert_reviewstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."concert_coninfostatus_enum"`);
        await queryRunner.query(`DROP TABLE "musicTag"`);
        await queryRunner.query(`DROP TABLE "locationTag"`);
        await queryRunner.query(`DROP TABLE "organization"`);
        await queryRunner.query(`DROP TABLE "venues"`);
    }

}
