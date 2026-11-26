import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BackOffice — Média : réseaux sociaux (publications, plateformes, statistiques journalières) — idempotente.
 * Colonnes de clés étrangères alignées sur `ref`.`id` (évite #3780).
 * Script SQL équivalent : db/sql/backoffice_reseaux_sociaux.sql
 */
type TableSpec = { name: string; columns: string[]; keys: [string, string, boolean][]; fks: [string, string, string, string][] };

const TABLES: TableSpec[] = [
  {
    "name": "bo_social_accounts",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`platform` enum('FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE','LINKEDIN','X','WHATSAPP','SNAPCHAT','THREADS','PINTEREST','OTHER') NOT NULL",
      "`name` varchar(150) NOT NULL",
      "`handle` varchar(150) NULL DEFAULT NULL",
      "`url` varchar(500) NULL DEFAULT NULL",
      "`projectId` varchar(36) NULL DEFAULT NULL",
      "`clientName` varchar(150) NULL DEFAULT NULL",
      "`managerId` varchar(36) NULL DEFAULT NULL",
      "`followers` int NOT NULL DEFAULT 0",
      "`followersUpdatedOn` date NULL DEFAULT NULL",
      "`isActive` tinyint NOT NULL DEFAULT 1",
      "`notes` varchar(500) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_social_account_company",
        "companyId,platform",
        false
      ],
      [
        "idx_bo_social_account_project",
        "projectId",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_social_account_company",
        "CASCADE"
      ],
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_social_account_project",
        "SET NULL"
      ],
      [
        "managerId",
        "users",
        "fk_bo_social_account_manager",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_social_posts",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`projectId` varchar(36) NULL DEFAULT NULL",
      "`title` varchar(200) NOT NULL",
      "`caption` text NULL",
      "`hashtags` json NULL",
      "`type` enum('IMAGE','CAROUSEL','VIDEO','REEL','STORY','LIVE','TEXT','LINK','OTHER') NOT NULL DEFAULT 'IMAGE'",
      "`mediaFileIds` json NULL",
      "`link` varchar(1000) NULL DEFAULT NULL",
      "`campaign` varchar(120) NULL DEFAULT NULL",
      "`status` enum('DRAFT','PENDING_APPROVAL','APPROVED','SCHEDULED','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'DRAFT'",
      "`scheduledAt` datetime(6) NULL DEFAULT NULL",
      "`publishedAt` datetime(6) NULL DEFAULT NULL",
      "`approvedById` varchar(36) NULL DEFAULT NULL",
      "`approvedAt` datetime(6) NULL DEFAULT NULL",
      "`notes` varchar(500) NULL DEFAULT NULL",
      "`createdById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_social_post_company_status",
        "companyId,status",
        false
      ],
      [
        "idx_bo_social_post_scheduled",
        "companyId,scheduledAt",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_social_post_company",
        "CASCADE"
      ],
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_social_post_project",
        "SET NULL"
      ],
      [
        "createdById",
        "users",
        "fk_bo_social_post_creator",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_social_post_targets",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`postId` varchar(36) NOT NULL",
      "`accountId` varchar(36) NOT NULL",
      "`platform` enum('FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE','LINKEDIN','X','WHATSAPP','SNAPCHAT','THREADS','PINTEREST','OTHER') NOT NULL",
      "`status` enum('PLANNED','PUBLISHED','FAILED','REMOVED') NOT NULL DEFAULT 'PLANNED'",
      "`publishedAt` datetime(6) NULL DEFAULT NULL",
      "`postUrl` varchar(1000) NULL DEFAULT NULL",
      "`externalId` varchar(255) NULL DEFAULT NULL",
      "`boostSpent` decimal(14,2) NOT NULL DEFAULT 0",
      "`likes` int NOT NULL DEFAULT 0",
      "`comments` int NOT NULL DEFAULT 0",
      "`shares` int NOT NULL DEFAULT 0",
      "`saves` int NOT NULL DEFAULT 0",
      "`views` int NOT NULL DEFAULT 0",
      "`reach` int NOT NULL DEFAULT 0",
      "`impressions` int NOT NULL DEFAULT 0",
      "`clicks` int NOT NULL DEFAULT 0",
      "`lastStatsOn` date NULL DEFAULT NULL",
      "`note` varchar(500) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_social_target",
        "postId,accountId",
        true
      ],
      [
        "idx_bo_social_target_account",
        "accountId,publishedAt",
        false
      ]
    ],
    "fks": [
      [
        "postId",
        "bo_social_posts",
        "fk_bo_social_target_post",
        "CASCADE"
      ],
      [
        "accountId",
        "bo_social_accounts",
        "fk_bo_social_target_account",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_social_post_daily_stats",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`targetId` varchar(36) NOT NULL",
      "`postId` varchar(36) NOT NULL",
      "`accountId` varchar(36) NOT NULL",
      "`platform` enum('FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE','LINKEDIN','X','WHATSAPP','SNAPCHAT','THREADS','PINTEREST','OTHER') NOT NULL",
      "`statDate` date NOT NULL",
      "`likes` int NOT NULL DEFAULT 0",
      "`comments` int NOT NULL DEFAULT 0",
      "`shares` int NOT NULL DEFAULT 0",
      "`saves` int NOT NULL DEFAULT 0",
      "`views` int NOT NULL DEFAULT 0",
      "`reach` int NOT NULL DEFAULT 0",
      "`impressions` int NOT NULL DEFAULT 0",
      "`clicks` int NOT NULL DEFAULT 0",
      "`recordedById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_social_post_stat_day",
        "targetId,statDate",
        true
      ],
      [
        "idx_bo_social_post_stat_company_day",
        "companyId,statDate",
        false
      ]
    ],
    "fks": [
      [
        "targetId",
        "bo_social_post_targets",
        "fk_bo_social_post_stat_target",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_social_account_daily_stats",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`accountId` varchar(36) NOT NULL",
      "`platform` enum('FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE','LINKEDIN','X','WHATSAPP','SNAPCHAT','THREADS','PINTEREST','OTHER') NOT NULL",
      "`statDate` date NOT NULL",
      "`followers` int NOT NULL DEFAULT 0",
      "`newFollowers` int NOT NULL DEFAULT 0",
      "`reach` int NOT NULL DEFAULT 0",
      "`impressions` int NOT NULL DEFAULT 0",
      "`profileViews` int NOT NULL DEFAULT 0",
      "`messages` int NOT NULL DEFAULT 0",
      "`recordedById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_social_account_stat_day",
        "accountId,statDate",
        true
      ],
      [
        "idx_bo_social_account_stat_company_day",
        "companyId,statDate",
        false
      ]
    ],
    "fks": [
      [
        "accountId",
        "bo_social_accounts",
        "fk_bo_social_account_stat_account",
        "CASCADE"
      ]
    ]
  }
];

export class BackofficeSocialMedia1792972800000 implements MigrationInterface {
  name = 'BackofficeSocialMedia1792972800000';

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
