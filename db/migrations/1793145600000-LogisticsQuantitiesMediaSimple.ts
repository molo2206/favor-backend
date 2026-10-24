import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Logistique (quantités, sorties partielles, demandes de matériel, logisticiens, images),
 * charroi (vélos / tricycles, plaque facultative, n° interne) et média simplifié
 * (équipe via les RH, publications internes avec chiffres saisis par l'admin). Idempotente.
 * Script SQL équivalent : db/sql/logistique_media_mise_a_jour.sql
 */
type TableSpec = { name: string; columns: string[]; keys: [string, string, boolean][]; fks: [string, string, string, string][] };

const TABLES: TableSpec[] = [
  {
    "name": "bo_asset_assignments",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`assetId` varchar(36) NOT NULL",
      "`userId` varchar(36) NOT NULL",
      "`quantity` int NOT NULL DEFAULT 1",
      "`returnedQuantity` int NOT NULL DEFAULT 0",
      "`status` enum('ACTIVE','RETURNED') NOT NULL DEFAULT 'ACTIVE'",
      "`requestId` varchar(36) NULL DEFAULT NULL",
      "`assignedAt` datetime(6) NOT NULL",
      "`returnedAt` datetime(6) NULL DEFAULT NULL",
      "`assignedById` varchar(36) NULL DEFAULT NULL",
      "`note` varchar(500) NULL DEFAULT NULL",
      "`photoUrl` varchar(500) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_asset_assignment_asset",
        "assetId,status",
        false
      ],
      [
        "idx_bo_asset_assignment_user",
        "userId,status",
        false
      ],
      [
        "idx_bo_asset_assignment_company",
        "companyId,status",
        false
      ]
    ],
    "fks": [
      [
        "assetId",
        "bo_assets",
        "fk_bo_asset_assignment_asset",
        "CASCADE"
      ],
      [
        "userId",
        "users",
        "fk_bo_asset_assignment_user",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_logistics_managers",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`userId` varchar(36) NOT NULL",
      "`createdById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_logistics_manager",
        "companyId,userId",
        true
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_logistics_manager_company",
        "CASCADE"
      ],
      [
        "userId",
        "users",
        "fk_bo_logistics_manager_user",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "bo_material_requests",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`reference` varchar(30) NOT NULL",
      "`requesterId` varchar(36) NOT NULL",
      "`branchId` varchar(36) NULL DEFAULT NULL",
      "`reason` varchar(500) NOT NULL",
      "`priority` enum('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL'",
      "`neededBy` date NULL DEFAULT NULL",
      "`status` enum('PENDING','APPROVED','PARTIALLY_ISSUED','ISSUED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING'",
      "`reviewedById` varchar(36) NULL DEFAULT NULL",
      "`reviewedAt` datetime(6) NULL DEFAULT NULL",
      "`reviewNote` varchar(500) NULL DEFAULT NULL",
      "`issuedAt` datetime(6) NULL DEFAULT NULL",
      "`photoUrl` varchar(500) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_material_request_reference",
        "companyId,reference",
        true
      ],
      [
        "idx_bo_material_request_status",
        "companyId,status",
        false
      ],
      [
        "idx_bo_material_request_requester",
        "requesterId,status",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_material_request_company",
        "CASCADE"
      ],
      [
        "requesterId",
        "users",
        "fk_bo_material_request_requester",
        "CASCADE"
      ],
      [
        "branchId",
        "branches",
        "fk_bo_material_request_branch",
        "SET NULL"
      ],
      [
        "reviewedById",
        "users",
        "fk_bo_material_request_reviewer",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_material_request_items",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`requestId` varchar(36) NOT NULL",
      "`assetId` varchar(36) NULL DEFAULT NULL",
      "`categoryId` varchar(36) NULL DEFAULT NULL",
      "`description` varchar(255) NOT NULL",
      "`quantityRequested` int NOT NULL DEFAULT 1",
      "`quantityApproved` int NULL DEFAULT NULL",
      "`quantityIssued` int NOT NULL DEFAULT 0"
    ],
    "keys": [
      [
        "idx_bo_material_request_item_request",
        "requestId",
        false
      ]
    ],
    "fks": [
      [
        "requestId",
        "bo_material_requests",
        "fk_bo_material_request_item_request",
        "CASCADE"
      ],
      [
        "assetId",
        "bo_assets",
        "fk_bo_material_request_item_asset",
        "SET NULL"
      ],
      [
        "categoryId",
        "bo_asset_categories",
        "fk_bo_material_request_item_category",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_media_publications",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`projectId` varchar(36) NULL DEFAULT NULL",
      "`title` varchar(200) NOT NULL",
      "`description` text NULL",
      "`type` enum('PHOTO','VIDEO','AUDIO','TEXT','DOCUMENT','OTHER') NOT NULL DEFAULT 'PHOTO'",
      "`channels` json NULL",
      "`coverUrl` varchar(500) NULL DEFAULT NULL",
      "`mediaFileIds` json NULL",
      "`status` enum('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT'",
      "`publishedAt` datetime(6) NULL DEFAULT NULL",
      "`views` int NOT NULL DEFAULT 0",
      "`likes` int NOT NULL DEFAULT 0",
      "`comments` int NOT NULL DEFAULT 0",
      "`shares` int NOT NULL DEFAULT 0",
      "`lastStatsOn` date NULL DEFAULT NULL",
      "`notes` varchar(1000) NULL DEFAULT NULL",
      "`createdById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_bo_media_publication_company",
        "companyId,status,publishedAt",
        false
      ]
    ],
    "fks": [
      [
        "companyId",
        "company",
        "fk_bo_media_publication_company",
        "CASCADE"
      ],
      [
        "projectId",
        "bo_media_projects",
        "fk_bo_media_publication_project",
        "SET NULL"
      ],
      [
        "createdById",
        "users",
        "fk_bo_media_publication_creator",
        "SET NULL"
      ]
    ]
  },
  {
    "name": "bo_media_publication_stats",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`companyId` varchar(36) NOT NULL",
      "`publicationId` varchar(36) NOT NULL",
      "`statDate` date NOT NULL",
      "`views` int NOT NULL DEFAULT 0",
      "`likes` int NOT NULL DEFAULT 0",
      "`comments` int NOT NULL DEFAULT 0",
      "`shares` int NOT NULL DEFAULT 0",
      "`note` varchar(500) NULL DEFAULT NULL",
      "`recordedById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_bo_media_publication_stat_day",
        "publicationId,statDate",
        true
      ],
      [
        "idx_bo_media_publication_stat_company",
        "companyId,statDate",
        false
      ]
    ],
    "fks": [
      [
        "publicationId",
        "bo_media_publications",
        "fk_bo_media_publication_stat_publication",
        "CASCADE"
      ]
    ]
  }
];

const ADD_COLUMNS: [string, string, string][] = [
  [
    "bo_assets",
    "quantityAvailable",
    "`quantityAvailable` int NOT NULL DEFAULT 1"
  ],
  [
    "bo_assets",
    "unit",
    "`unit` varchar(20) NOT NULL DEFAULT 'pièce'"
  ],
  [
    "bo_asset_categories",
    "photoUrl",
    "`photoUrl` varchar(500) NULL DEFAULT NULL"
  ],
  [
    "bo_asset_movements",
    "quantity",
    "`quantity` int NULL DEFAULT NULL"
  ],
  [
    "bo_asset_movements",
    "photoUrl",
    "`photoUrl` varchar(500) NULL DEFAULT NULL"
  ],
  [
    "bo_asset_movements",
    "assignmentId",
    "`assignmentId` varchar(36) NULL DEFAULT NULL"
  ],
  [
    "bo_asset_movements",
    "requestId",
    "`requestId` varchar(36) NULL DEFAULT NULL"
  ],
  [
    "bo_fleet_vehicles",
    "internalNumber",
    "`internalNumber` varchar(30) NULL DEFAULT NULL"
  ],
  [
    "bo_fleet_missions",
    "photoUrl",
    "`photoUrl` varchar(500) NULL DEFAULT NULL"
  ],
  [
    "bo_fleet_maintenances",
    "photoUrl",
    "`photoUrl` varchar(500) NULL DEFAULT NULL"
  ]
];

const MODIFY_COLUMNS: [string, string, string][] = [
  [
    "bo_fleet_vehicles",
    "plateNumber",
    "`plateNumber` varchar(30) NULL DEFAULT NULL"
  ],
  [
    "bo_fleet_vehicles",
    "brand",
    "`brand` varchar(80) NULL DEFAULT NULL"
  ],
  [
    "bo_fleet_vehicles",
    "type",
    "`type` enum('CAR','PICKUP','VAN','TRUCK','MOTORBIKE','BUS','BICYCLE','TRICYCLE','OTHER') NOT NULL DEFAULT 'CAR'"
  ],
  [
    "bo_fleet_vehicles",
    "fuelType",
    "`fuelType` enum('PETROL','DIESEL','ELECTRIC','HYBRID','NONE','OTHER') NOT NULL DEFAULT 'DIESEL'"
  ],
  [
    "bo_asset_movements",
    "type",
    "`type` enum('ACQUIRED','STOCK_IN','ASSIGNED','RETURNED','TRANSFERRED','REPAIR_SENT','REPAIR_RETURNED','CONDITION_CHANGED','INVENTORY_CHECK','LOST','FOUND','DISPOSED','UPDATED') NOT NULL"
  ]
];

const ADD_INDEXES: [string, string, string, boolean][] = [
  [
    "bo_fleet_vehicles",
    "uq_fleet_vehicle_internal",
    "companyId,internalNumber",
    true
  ]
];

const OLD_TABLES: string[] = ["bo_media_team_members", "bo_social_account_daily_stats", "bo_social_post_daily_stats", "bo_social_post_targets", "bo_social_posts", "bo_social_accounts"];

export class LogisticsQuantitiesMediaSimple1793145600000 implements MigrationInterface {
  name = 'LogisticsQuantitiesMediaSimple1793145600000';

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
    const hadQtyAvailable = !!(await this.column(q, 'bo_assets', 'quantityAvailable'));

    for (const [t, c, def] of ADD_COLUMNS) {
      if ((await this.tableExists(q, t)) && !(await this.column(q, t, c))) await q.query(`ALTER TABLE \`${t}\` ADD COLUMN ${def}`);
    }
    for (const [t, c, def] of MODIFY_COLUMNS) {
      if (await this.column(q, t, c)) await q.query(`ALTER TABLE \`${t}\` MODIFY ${def}`);
    }

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
        await q.query(`ALTER TABLE \`${t.name}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${cols.split(',').map((c) => `\`${c}\``).join(', ')})`);
      }
    }

    // Reprise des données
    if (!hadQtyAvailable && (await this.tableExists(q, 'bo_assets'))) {
      await q.query("UPDATE `bo_assets` SET `quantityAvailable` = CASE WHEN `status` IN ('IN_USE', 'DISPOSED') THEN 0 ELSE `quantity` END");
    }
    if (await this.tableExists(q, 'bo_assets')) {
      await q.query(
        "INSERT INTO `bo_asset_assignments` (`id`,`companyId`,`assetId`,`userId`,`quantity`,`returnedQuantity`,`status`,`assignedAt`,`note`) " +
          "SELECT UUID(), a.`companyId`, a.`id`, a.`assignedToUserId`, a.`quantity`, 0, 'ACTIVE', COALESCE(a.`assignedAt`, a.`updatedAt`), 'Reprise des affectations existantes' " +
          "FROM `bo_assets` a WHERE a.`assignedToUserId` IS NOT NULL AND a.`status` <> 'DISPOSED' " +
          'AND NOT EXISTS (SELECT 1 FROM `bo_asset_assignments` g WHERE g.`assetId` = a.`id`)',
      );
    }
    if (await this.column(q, 'bo_fleet_vehicles', 'internalNumber')) {
      await q.query(
        'UPDATE `bo_fleet_vehicles` v JOIN (SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `companyId` ORDER BY `createdAt`, `id`) AS rn FROM `bo_fleet_vehicles`) x ' +
          "ON x.`id` = v.`id` SET v.`internalNumber` = CONCAT('ENG-', LPAD(x.rn, 4, '0')) WHERE v.`internalNumber` IS NULL",
      );
      await q.query("UPDATE `bo_fleet_vehicles` SET `fuelType` = 'NONE' WHERE `type` = 'BICYCLE'");
    }
    for (const [t, name, cols, unique] of ADD_INDEXES) {
      if ((await this.tableExists(q, t)) && !(await this.indexExists(q, t, name))) {
        await q.query(`ALTER TABLE \`${t}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${cols.split(',').map((c) => `\`${c}\``).join(', ')})`);
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

    // Anciennes tables : supprimées si vides (FORCE_DROP_OLD_MEDIA_TABLES=true pour forcer)
    const force = String(process.env.FORCE_DROP_OLD_MEDIA_TABLES || '').toLowerCase() === 'true';
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of OLD_TABLES) {
      if (!(await this.tableExists(q, t))) continue;
      const n = await q.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      if (force || Number(n[0]?.n || 0) === 0) await q.query(`DROP TABLE \`${t}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [...TABLES].reverse()) {
      if (await this.tableExists(q, t.name)) await q.query(`DROP TABLE \`${t.name}\``);
    }
    for (const [t, name] of ADD_INDEXES) {
      if (await this.indexExists(q, t, name)) await q.query(`ALTER TABLE \`${t}\` DROP INDEX \`${name}\``);
    }
    for (const [t, c] of [...ADD_COLUMNS].reverse()) {
      if (await this.column(q, t, c)) await q.query(`ALTER TABLE \`${t}\` DROP COLUMN \`${c}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
