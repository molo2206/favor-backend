import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Signatures des utilisateurs + signatures apposées sur les états de besoins.
 *    Script SQL équivalent : db/sql/signatures_etats_de_besoins.sql
 */
export class Signatures1795996800000 implements MigrationInterface {
  name = 'Signatures1795996800000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('user_signatures'))) {
      await q.query(`CREATE TABLE \`user_signatures\` (
        \`id\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`imageUrl\` varchar(500) NOT NULL,
        \`storagePath\` varchar(300) NOT NULL,
        \`width\` int NULL,
        \`height\` int NULL,
        \`sizeBytes\` int NULL,
        \`source\` varchar(10) NOT NULL DEFAULT 'UPLOAD',
        \`updatedById\` varchar(36) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_user_signature_user\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await q.hasTable('bo_need_signatures'))) {
      await q.query(`CREATE TABLE \`bo_need_signatures\` (
        \`id\` varchar(36) NOT NULL,
        \`needId\` varchar(36) NOT NULL,
        \`companyId\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`signerName\` varchar(150) NULL,
        \`role\` varchar(20) NOT NULL,
        \`action\` varchar(30) NOT NULL,
        \`level\` int NULL,
        \`levelName\` varchar(150) NULL,
        \`refId\` varchar(36) NULL,
        \`signatureUrl\` varchar(500) NULL,
        \`signedAt\` datetime(6) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_bo_need_sig_need\` (\`needId\`, \`signedAt\`),
        KEY \`idx_bo_need_sig_ref\` (\`refId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `bo_need_signatures`');
    await q.query('DROP TABLE IF EXISTS `user_signatures`');
  }
}
