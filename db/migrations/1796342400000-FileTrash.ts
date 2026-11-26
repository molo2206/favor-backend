import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Gestionnaire de fichiers : corbeille.
 *    Script SQL équivalent : db/sql/gestionnaire_fichiers.sql
 */
export class FileTrash1796342400000 implements MigrationInterface {
  name = 'FileTrash1796342400000';

  public async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('file_trash')) return;
    await q.query(`CREATE TABLE \`file_trash\` (
      \`id\` varchar(36) NOT NULL,
      \`rootId\` varchar(30) NOT NULL,
      \`originalPath\` varchar(700) NOT NULL,
      \`trashPath\` varchar(700) NOT NULL,
      \`isDirectory\` tinyint NOT NULL DEFAULT 0,
      \`sizeBytes\` bigint NOT NULL DEFAULT 0,
      \`reason\` varchar(30) NOT NULL DEFAULT 'MANUAL',
      \`context\` varchar(300) NULL,
      \`deletedById\` varchar(36) NULL,
      \`deletedByName\` varchar(150) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`expiresAt\` datetime NOT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_file_trash_created\` (\`createdAt\`),
      KEY \`idx_file_trash_expires\` (\`expiresAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `file_trash`');
  }
}
