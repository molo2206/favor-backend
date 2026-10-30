import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moyens de paiement des utilisateurs (Mobile Money, FPay, Cash) : table user_payment_methods.
 * Idempotente. Script SQL équivalent : db/sql/moyens_paiement_utilisateurs.sql
 */
export class UserPaymentMethods1793404800000 implements MigrationInterface {
  name = 'UserPaymentMethods1793404800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user_payment_methods'))) {
      // Même type / jeu de caractères que users.id (exigé par la clé étrangère)
      const ref = await queryRunner.query(
        "SELECT COLUMN_TYPE AS t, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1",
      );
      const r = ref?.[0] ?? {};
      const userCol = `${r.t || 'varchar(36)'}${r.cs ? ` CHARACTER SET ${r.cs} COLLATE ${r.coll}` : ''}`;
      const tbl = await queryRunner.query(
        "SELECT TABLE_COLLATION AS coll FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' LIMIT 1",
      );
      const coll = tbl?.[0]?.coll || 'utf8mb4_unicode_ci';
      const cs = String(coll).split('_')[0] || 'utf8mb4';
      await queryRunner.query(
        'CREATE TABLE `user_payment_methods` (' +
          '`id` varchar(36) NOT NULL, ' +
          `\`userId\` ${userCol} NOT NULL, ` +
          "`type` enum('MOBILE_MONEY','FPAY','CASH') NOT NULL, " +
          '`label` varchar(80) NULL DEFAULT NULL, ' +
          '`provider` varchar(60) NULL DEFAULT NULL, ' +
          '`phone` varchar(30) NULL DEFAULT NULL, ' +
          '`fpayAccount` varchar(120) NULL DEFAULT NULL, ' +
          '`currency` varchar(10) NULL DEFAULT NULL, ' +
          '`isDefault` tinyint NOT NULL DEFAULT 0, ' +
          '`isActive` tinyint NOT NULL DEFAULT 1, ' +
          '`lastUsedAt` datetime(6) NULL DEFAULT NULL, ' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`id`), KEY `idx_upm_user` (`userId`, `isActive`)' +
          `) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
      );
    }
    const fk = await queryRunner.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_payment_methods' AND CONSTRAINT_NAME = 'fk_user_payment_methods_user'",
    );
    if (!Number(fk?.[0]?.n)) {
      await queryRunner.query(
        'ALTER TABLE `user_payment_methods` ADD CONSTRAINT `fk_user_payment_methods_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('user_payment_methods')) await queryRunner.query('DROP TABLE `user_payment_methods`');
  }
}
