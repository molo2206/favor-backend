import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat back-office : conversations, participants, messages, pièces jointes,
 * réactions + table de présence en ligne (user_presence) utilisée par NotificationsGateway.
 *
 * Les colonnes de texte libre sont en utf8mb4 (emojis).
 * Les colonnes de clés étrangères gardent le charset par défaut de la base
 * pour rester compatibles avec `users`.`id`.
 */
export class CreateBackofficeChat1792440233418 implements MigrationInterface {
  name = 'CreateBackofficeChat1792440233418';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const TXT = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';

    // ------------------------------------------------------------
    // Conversations
    // ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bo_chat_conversations\` (
        \`id\` varchar(36) NOT NULL,
        \`type\` enum('DIRECT','GROUP') NOT NULL DEFAULT 'DIRECT',
        \`name\` varchar(150) ${TXT} NULL,
        \`description\` text ${TXT} NULL,
        \`avatar\` varchar(500) NULL,
        \`directKey\` varchar(80) NULL,
        \`companyId\` varchar(36) NULL,
        \`createdById\` varchar(36) NULL,
        \`lastMessageId\` varchar(36) NULL,
        \`lastMessageAt\` datetime(6) NULL,
        \`onlyAdminsCanWrite\` tinyint NOT NULL DEFAULT 0,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`uq_bo_chat_conv_direct_key\` (\`directKey\`),
        INDEX \`idx_bo_chat_conv_company\` (\`companyId\`),
        INDEX \`idx_bo_chat_conv_last_message_at\` (\`lastMessageAt\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_bo_chat_conv_created_by\` FOREIGN KEY (\`createdById\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ------------------------------------------------------------
    // Participants
    // ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bo_chat_participants\` (
        \`id\` varchar(36) NOT NULL,
        \`conversationId\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`role\` enum('OWNER','ADMIN','MEMBER') NOT NULL DEFAULT 'MEMBER',
        \`unreadCount\` int NOT NULL DEFAULT 0,
        \`lastReadMessageId\` varchar(36) NULL,
        \`lastReadAt\` datetime(6) NULL,
        \`lastDeliveredAt\` datetime(6) NULL,
        \`isMuted\` tinyint NOT NULL DEFAULT 0,
        \`isArchived\` tinyint NOT NULL DEFAULT 0,
        \`isPinned\` tinyint NOT NULL DEFAULT 0,
        \`clearedAt\` datetime(6) NULL,
        \`leftAt\` datetime(6) NULL,
        \`joinedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`uq_bo_chat_participant\` (\`conversationId\`, \`userId\`),
        INDEX \`idx_bo_chat_participant_user\` (\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_bo_chat_part_conv\` FOREIGN KEY (\`conversationId\`) REFERENCES \`bo_chat_conversations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_bo_chat_part_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ------------------------------------------------------------
    // Messages
    // ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bo_chat_messages\` (
        \`id\` varchar(36) NOT NULL,
        \`conversationId\` varchar(36) NOT NULL,
        \`senderId\` varchar(36) NULL,
        \`type\` enum('TEXT','IMAGE','VIDEO','AUDIO','DOCUMENT','MIXED','SYSTEM') NOT NULL DEFAULT 'TEXT',
        \`content\` text ${TXT} NULL,
        \`clientMessageId\` varchar(64) NULL,
        \`replyToId\` varchar(36) NULL,
        \`forwardedFromId\` varchar(36) NULL,
        \`mentions\` text NULL,
        \`metadata\` text ${TXT} NULL,
        \`isEdited\` tinyint NOT NULL DEFAULT 0,
        \`editedAt\` datetime(6) NULL,
        \`isPinned\` tinyint NOT NULL DEFAULT 0,
        \`isDeleted\` tinyint NOT NULL DEFAULT 0,
        \`deletedAt\` datetime(6) NULL,
        \`hiddenFor\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`idx_bo_chat_msg_conv_created\` (\`conversationId\`, \`createdAt\`),
        UNIQUE INDEX \`uq_bo_chat_msg_client_id\` (\`senderId\`, \`clientMessageId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_bo_chat_msg_conv\` FOREIGN KEY (\`conversationId\`) REFERENCES \`bo_chat_conversations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_bo_chat_msg_sender\` FOREIGN KEY (\`senderId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_bo_chat_msg_reply\` FOREIGN KEY (\`replyToId\`) REFERENCES \`bo_chat_messages\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ------------------------------------------------------------
    // Pièces jointes
    // ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bo_chat_attachments\` (
        \`id\` varchar(36) NOT NULL,
        \`messageId\` varchar(36) NOT NULL,
        \`conversationId\` varchar(36) NOT NULL,
        \`type\` enum('IMAGE','VIDEO','AUDIO','PDF','DOCUMENT','OTHER') NOT NULL,
        \`url\` varchar(700) NOT NULL,
        \`storagePath\` varchar(500) NOT NULL,
        \`thumbnailUrl\` varchar(700) NULL,
        \`originalName\` varchar(255) ${TXT} NOT NULL,
        \`mimeType\` varchar(150) NOT NULL,
        \`size\` bigint NOT NULL DEFAULT 0,
        \`width\` int NULL,
        \`height\` int NULL,
        \`duration\` float NULL,
        \`waveform\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_bo_chat_att_message\` (\`messageId\`),
        INDEX \`idx_bo_chat_att_conv_type\` (\`conversationId\`, \`type\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_bo_chat_att_msg\` FOREIGN KEY (\`messageId\`) REFERENCES \`bo_chat_messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ------------------------------------------------------------
    // Réactions
    // ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bo_chat_reactions\` (
        \`id\` varchar(36) NOT NULL,
        \`messageId\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`emoji\` varchar(32) ${TXT} NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`uq_bo_chat_reaction\` (\`messageId\`, \`userId\`, \`emoji\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_bo_chat_react_msg\` FOREIGN KEY (\`messageId\`) REFERENCES \`bo_chat_messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_bo_chat_react_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ------------------------------------------------------------
    // Présence en ligne (module notification, WebSocket principal)
    // ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user_presence\` (
        \`userId\` varchar(36) NOT NULL,
        \`isOnline\` tinyint NOT NULL DEFAULT 0,
        \`status\` enum('ONLINE','AWAY','BUSY','OFFLINE') NOT NULL DEFAULT 'OFFLINE',
        \`lastSeenAt\` datetime(6) NULL,
        \`lastConnectedAt\` datetime(6) NULL,
        \`platform\` varchar(30) NULL,
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`userId\`),
        CONSTRAINT \`FK_user_presence_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // Les notifications du chat utilisent la table existante user_notifications
    // (types chat_message, chat_mention, chat_reply, chat_reaction, chat_group_added, chat_group_removed)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `user_presence`');
    await queryRunner.query('DROP TABLE IF EXISTS `bo_chat_reactions`');
    await queryRunner.query('DROP TABLE IF EXISTS `bo_chat_attachments`');
    await queryRunner.query('DROP TABLE IF EXISTS `bo_chat_messages`');
    await queryRunner.query('DROP TABLE IF EXISTS `bo_chat_participants`');
    await queryRunner.query('DROP TABLE IF EXISTS `bo_chat_conversations`');
  }
}
