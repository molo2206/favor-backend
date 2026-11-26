import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BackOffice — Média : filmage, photographie, services digitaux (idempotente).
 * Colonnes de clés étrangères alignées sur `ref`.`id` (évite #3780).
 * Script SQL équivalent : db/sql/backoffice_media.sql
 */
type TableSpec = { name: string; columns: string[]; keys: [string, string, boolean][]; fks: [string, string, string, string][] };

const TABLES: TableSpec[] = [
  {
    "name": "bo_media_services",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`name` varchar(150) NOT NULL",
      "`code` varchar(20) NULL DEFAULT NULL",
      "`category` enum('PHOTOGRAPHY','VIDEOGRAPHY','DRONE','LIVE_STREAMING','EDITING','GRAPHIC_DESIGN','SOCIAL_MEDIA','WEB_DIGITAL','PRINTING','OTHER') NOT NULL DEFAULT 'OTHER'",
      "`description` text NULL",
      "`unit` enum('HOUR','DAY','SESSION','PROJECT','ITEM','MONTH') NOT NULL DEFAULT 'SESSION'",
      "`unitPrice` decimal(14,2) NOT NULL DEFAULT 0",
      "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
      "`durationMinutes` int NULL DEFAULT NULL",
      "`deliverables` varchar(500) NULL DEFAULT NULL",
      "`deliveryDays` int NULL DEFAULT NULL",
      "`imageUrl` varchar(500) NULL DEFAULT NULL",
      "`isActive` tinyint NOT NULL DEFAULT 1",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_media_service_company",
        "companyId,isActive",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_media_service_company",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_media_team_members",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`userId` varchar(36) NOT NULL",
      "`roles` json NULL",
      "`skills` varchar(500) NULL DEFAULT NULL",
      "`dayRate` decimal(14,2) NULL DEFAULT NULL",
      "`isActive` tinyint NOT NULL DEFAULT 1",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_media_team_member",
        "companyId,userId",
        true
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_media_team_company",
        "CASCADE"
      ],
      [
        "userId",
        "users",
        "fk_bo_media_team_user",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_media_projects",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`reference` varchar(30) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`kind` enum('EXTERNAL','INTERNAL') NOT NULL DEFAULT 'EXTERNAL'",
      "`clientUserId` varchar(36) NULL DEFAULT NULL",
      "`clientCompanyId` varchar(36) NULL DEFAULT NULL",
      "`requestingDepartment` varchar(120) NULL DEFAULT NULL",
      "`clientName` varchar(150) NULL DEFAULT NULL",
      "`clientPhone` varchar(50) NULL DEFAULT NULL",
      "`clientEmail` varchar(150) NULL DEFAULT NULL",
      "`title` varchar(200) NOT NULL",
      "`description` text NULL",
      "`eventType` varchar(100) NULL DEFAULT NULL",
      "`eventDate` datetime(6) NULL DEFAULT NULL",
      "`location` varchar(255) NULL DEFAULT NULL",
      "`dueDate` date NULL DEFAULT NULL",
      "`status` enum('REQUEST','QUOTED','CONFIRMED','IN_PRODUCTION','POST_PRODUCTION','DELIVERED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'REQUEST'",
      "`priority` enum('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL'",
      "`managerId` varchar(36) NULL DEFAULT NULL",
      "`subtotal` decimal(14,2) NOT NULL DEFAULT 0",
      "`discount` decimal(14,2) NOT NULL DEFAULT 0",
      "`taxRate` decimal(5,2) NOT NULL DEFAULT 0",
      "`total` decimal(14,2) NOT NULL DEFAULT 0",
      "`amountPaid` decimal(14,2) NOT NULL DEFAULT 0",
      "`paymentStatus` enum('UNPAID','PARTIAL','PAID','NOT_APPLICABLE') NOT NULL DEFAULT 'UNPAID'",
      "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
      "`deliveryToken` varchar(64) NULL DEFAULT NULL",
      "`deliveryTokenExpiresAt` datetime(6) NULL DEFAULT NULL",
      "`quotedAt` datetime(6) NULL DEFAULT NULL",
      "`confirmedAt` datetime(6) NULL DEFAULT NULL",
      "`deliveredAt` datetime(6) NULL DEFAULT NULL",
      "`completedAt` datetime(6) NULL DEFAULT NULL",
      "`cancelledAt` datetime(6) NULL DEFAULT NULL",
      "`cancelReason` varchar(500) NULL DEFAULT NULL",
      "`notes` text NULL",
      "`createdById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_media_project_reference",
        "reference",
        true
      ],
      [
        "uq_bo_media_project_delivery_token",
        "deliveryToken",
        true
      ],
      [
        "idx_bo_media_project_company_status",
        "companyId,status",
        false
      ],
      [
        "idx_bo_media_project_event",
        "companyId,eventDate",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_media_project_company",
        "CASCADE"
      ],
      [
        "clientUserId",
        "users",
        "fk_bo_media_project_client",
        "SET NULL"
      ],
      [
        "managerId",
        "users",
        "fk_bo_media_project_manager",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_media_project_items",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`projectId` varchar(36) NOT NULL",
      "`serviceId` varchar(36) NULL DEFAULT NULL",
      "`label` varchar(200) NOT NULL",
      "`quantity` decimal(10,2) NOT NULL DEFAULT 1",
      "`unit` enum('HOUR','DAY','SESSION','PROJECT','ITEM','MONTH') NOT NULL DEFAULT 'SESSION'",
      "`unitPrice` decimal(14,2) NOT NULL DEFAULT 0",
      "`total` decimal(14,2) NOT NULL DEFAULT 0",
      "`position` int NOT NULL DEFAULT 0"
    ],
    "keys": [
      [
        "idx_bo_media_item_project",
        "projectId",
        false
      ]
    ],
    "fks": [
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_media_item_project",
        "CASCADE"
      ],
      [
        "serviceId",
        "bo_media_services",
        "fk_bo_media_item_service",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_media_sessions",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`projectId` varchar(36) NOT NULL",
      "`title` varchar(200) NOT NULL",
      "`type` enum('PHOTO','VIDEO','PHOTO_VIDEO','DRONE','LIVE','EDITING','MEETING','OTHER') NOT NULL DEFAULT 'PHOTO'",
      "`startAt` datetime(6) NOT NULL",
      "`endAt` datetime(6) NOT NULL",
      "`location` varchar(255) NULL DEFAULT NULL",
      "`latitude` decimal(10,7) NULL DEFAULT NULL",
      "`longitude` decimal(10,7) NULL DEFAULT NULL",
      "`status` enum('PLANNED','IN_PROGRESS','DONE','CANCELLED') NOT NULL DEFAULT 'PLANNED'",
      "`notes` text NULL",
      "`createdById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_media_session_company_date",
        "companyId,startAt",
        false
      ],
      [
        "idx_bo_media_session_project",
        "projectId",
        false
      ]
    ],
    "fks": [
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_media_session_project",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_media_session_crew",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`sessionId` varchar(36) NOT NULL",
      "`userId` varchar(36) NOT NULL",
      "`role` enum('PHOTOGRAPHER','VIDEOGRAPHER','DRONE_PILOT','EDITOR','DESIGNER','COMMUNITY_MANAGER','DIRECTOR','ASSISTANT','OTHER') NOT NULL DEFAULT 'OTHER'",
      "`note` varchar(255) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_media_crew",
        "sessionId,userId",
        true
      ],
      [
        "idx_bo_media_crew_user",
        "userId",
        false
      ]
    ],
    "fks": [
      [
        "sessionId",
        "bo_media_sessions",
        "fk_bo_media_crew_session",
        "CASCADE"
      ],
      [
        "userId",
        "users",
        "fk_bo_media_crew_user",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_media_session_equipment",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`sessionId` varchar(36) NOT NULL",
      "`assetId` varchar(36) NOT NULL",
      "`note` varchar(255) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_media_equipment",
        "sessionId,assetId",
        true
      ],
      [
        "idx_bo_media_equipment_asset",
        "assetId",
        false
      ]
    ],
    "fks": [
      [
        "sessionId",
        "bo_media_sessions",
        "fk_bo_media_equipment_session",
        "CASCADE"
      ],
      [
        "assetId",
        "bo_assets",
        "fk_bo_media_equipment_asset",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_media_files",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`projectId` varchar(36) NULL DEFAULT NULL",
      "`sessionId` varchar(36) NULL DEFAULT NULL",
      "`type` enum('PHOTO','VIDEO','AUDIO','DOCUMENT','LINK') NOT NULL",
      "`title` varchar(200) NULL DEFAULT NULL",
      "`description` varchar(500) NULL DEFAULT NULL",
      "`url` varchar(1000) NOT NULL",
      "`thumbnailUrl` varchar(1000) NULL DEFAULT NULL",
      "`mimeType` varchar(100) NULL DEFAULT NULL",
      "`sizeBytes` bigint NULL DEFAULT NULL",
      "`width` int NULL DEFAULT NULL",
      "`height` int NULL DEFAULT NULL",
      "`duration` int NULL DEFAULT NULL",
      "`isDeliverable` tinyint NOT NULL DEFAULT 0",
      "`isPortfolio` tinyint NOT NULL DEFAULT 0",
      "`tags` json NULL",
      "`uploadedById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_media_file_company",
        "companyId,createdAt",
        false
      ],
      [
        "idx_bo_media_file_project",
        "projectId",
        false
      ],
      [
        "idx_bo_media_file_portfolio",
        "companyId,isPortfolio",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_media_file_company",
        "CASCADE"
      ],
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_media_file_project",
        "SET NULL"
      ],
      [
        "uploadedById",
        "users",
        "fk_bo_media_file_user",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_media_payments",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`projectId` varchar(36) NOT NULL",
      "`amount` decimal(14,2) NOT NULL",
      "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
      "`method` enum('CASH','MOBILE_MONEY','FPAY','BANK_TRANSFER','CARD','OTHER') NOT NULL DEFAULT 'CASH'",
      "`reference` varchar(100) NULL DEFAULT NULL",
      "`paidAt` datetime(6) NOT NULL",
      "`note` varchar(500) NULL DEFAULT NULL",
      "`receivedById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_media_payment_project",
        "projectId",
        false
      ],
      [
        "idx_bo_media_payment_company_date",
        "companyId,paidAt",
        false
      ]
    ],
    "fks": [
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_media_payment_project",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_media_project_events",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`projectId` varchar(36) NOT NULL",
      "`type` enum('CREATED','UPDATED','STATUS_CHANGED','ITEMS_UPDATED','SESSION_PLANNED','SESSION_UPDATED','CREW_ASSIGNED','CREW_REMOVED','EQUIPMENT_BOOKED','EQUIPMENT_RELEASED','FILE_ADDED','PAYMENT','SHARED','NOTE') NOT NULL",
      "`fromStatus` varchar(30) NULL DEFAULT NULL",
      "`toStatus` varchar(30) NULL DEFAULT NULL",
      "`description` varchar(500) NOT NULL",
      "`payload` json NULL",
      "`actorId` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_media_event_project_date",
        "projectId,createdAt",
        false
      ]
    ],
    "fks": [
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_media_event_project",
        "CASCADE"
      ],
      [
        "actorId",
        "users",
        "fk_bo_media_event_actor",
        "SET NULL"
      ]
    ]
  }
];

export class BackofficeMedia1792886400000 implements MigrationInterface {
  name = 'BackofficeMedia1792886400000';

  private async tableExists(q: QueryRunner, t: string) {
    const r = await q.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [t]);
    return r.length > 0;
  }

  private async column(q: QueryRunner, t: string, c: string) {
    const r = await q.query(
      'SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll, IS_NULLABLE AS nullable ' +
        'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [t, c],
    );
    return r[0] as { type: string; cs: string | null; coll: string | null; nullable: string } | undefined;
  }

  private async indexExists(q: QueryRunner, t: string, i: string) {
    const r = await q.query('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1', [t, i]);
    return r.length > 0;
  }

  private async fkExists(q: QueryRunner, t: string, fk: string) {
    const r = await q.query(
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
      [t, fk],
    );
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    const ref = await q.query(
      'SELECT t.TABLE_COLLATION AS coll, c.CHARACTER_SET_NAME AS cs FROM information_schema.TABLES t ' +
        'JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION ' +
        "WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'company' LIMIT 1",
    );
    const cs = ref[0]?.cs || 'utf8mb4';
    const coll = ref[0]?.coll || 'utf8mb4_unicode_ci';

    for (const t of TABLES) {
      if (!(await this.tableExists(q, t.name))) {
        await q.query(`CREATE TABLE \`${t.name}\` (${[...t.columns, 'PRIMARY KEY (\`id\`)'].join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`);
      }
      for (const [name, cols, unique] of t.keys) {
        if (await this.indexExists(q, t.name, name)) continue;
        const list = cols.split(',').map((c) => `\`${c}\``).join(', ');
        await q.query(`ALTER TABLE \`${t.name}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${list})`);
      }
    }
    for (const t of TABLES) {
      for (const [col, refTable, fk, onDelete] of t.fks) {
        if (!(await this.tableExists(q, refTable)) || (await this.fkExists(q, t.name, fk))) continue;
        const target = await this.column(q, refTable, 'id');
        const current = await this.column(q, t.name, col);
        if (!target || !current) continue;
        if (current.type !== target.type || (current.coll || '') !== (target.coll || '')) {
          const charset = target.cs ? ` CHARACTER SET ${target.cs} COLLATE ${target.coll}` : '';
          await q.query(`ALTER TABLE \`${t.name}\` MODIFY \`${col}\` ${target.type}${charset}${current.nullable === 'YES' ? ' NULL DEFAULT NULL' : ' NOT NULL'}`);
        }
        await q.query(`ALTER TABLE \`${t.name}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`${col}\`) REFERENCES \`${refTable}\` (\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`);
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [...TABLES].reverse()) {
      if (await this.tableExists(q, t.name)) await q.query(`DROP TABLE \`${t.name}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
