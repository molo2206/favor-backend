import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Annonces type Jiji dans la table `products` (listingType = 'CLASSIFIED') — idempotente.
 * - products : company facultative + colonnes listingType / ownerId / adCityId / ad*
 * - tables : classified_pricing_plans, classified_payments, classified_reports (→ products.id)
 * - supprime les tables de la 1re version (classified_ads, classified_ad_images, classified_favorites)
 * Script SQL équivalent : db/sql/annonces_classifieds.sql
 */
type TableSpec = { name: string; columns: string[]; keys: [string, string, boolean][]; fks: [string, string, string, string][] };

const TABLES: TableSpec[] = [
  {
    "name": "classified_pricing_plans",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`code` varchar(50) NOT NULL",
      "`name` varchar(120) NOT NULL",
      "`description` varchar(500) NULL DEFAULT NULL",
      "`cityId` varchar(36) NULL DEFAULT NULL",
      "`countryId` varchar(36) NULL DEFAULT NULL",
      "`categoryId` varchar(36) NULL DEFAULT NULL",
      "`durationDays` int NOT NULL DEFAULT 30",
      "`price` decimal(14,2) NOT NULL DEFAULT 0",
      "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
      "`isFeatured` tinyint NOT NULL DEFAULT 0",
      "`maxImages` int NOT NULL DEFAULT 10",
      "`isActive` tinyint NOT NULL DEFAULT 1",
      "`sortOrder` int NOT NULL DEFAULT 0",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_classified_plan_code",
        "code,isActive",
        false
      ],
      [
        "idx_classified_plan_city",
        "cityId,isActive",
        false
      ]
    ],
    "fks": [
      [
        "cityId",
        "cities",
        "fk_classified_plan_city",
        "CASCADE"
      ],
      [
        "countryId",
        "countries",
        "fk_classified_plan_country",
        "CASCADE"
      ],
      [
        "categoryId",
        "category",
        "fk_classified_plan_category",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "classified_payments",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`reference` varchar(30) NOT NULL",
      "`productId` varchar(36) NOT NULL",
      "`userId` varchar(36) NOT NULL",
      "`planId` varchar(36) NULL DEFAULT NULL",
      "`planSnapshot` json NULL",
      "`cityId` varchar(36) NULL DEFAULT NULL",
      "`amount` decimal(14,2) NOT NULL",
      "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
      "`method` enum('FPAY','MOBILE_MONEY','FREE','MANUAL') NOT NULL",
      "`status` enum('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING'",
      "`provider` varchar(60) NULL DEFAULT NULL",
      "`phone` varchar(30) NULL DEFAULT NULL",
      "`externalId` varchar(100) NULL DEFAULT NULL",
      "`transactionId` varchar(100) NULL DEFAULT NULL",
      "`transactionReference` varchar(100) NULL DEFAULT NULL",
      "`failureReason` varchar(500) NULL DEFAULT NULL",
      "`paidAt` datetime(6) NULL DEFAULT NULL",
      "`applied` tinyint NOT NULL DEFAULT 0",
      "`validatedById` varchar(36) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "uq_classified_payment_reference",
        "reference",
        true
      ],
      [
        "idx_classified_payment_product",
        "productId,createdAt",
        false
      ],
      [
        "idx_classified_payment_status",
        "status,createdAt",
        false
      ],
      [
        "idx_classified_payment_city",
        "cityId,paidAt",
        false
      ]
    ],
    "fks": [
      [
        "productId",
        "products",
        "fk_classified_payment_product",
        "CASCADE"
      ],
      [
        "userId",
        "users",
        "fk_classified_payment_user",
        "CASCADE"
      ]
    ]
  },
  {
    "name": "classified_reports",
    "columns": [
      "`id` varchar(36) NOT NULL",
      "`productId` varchar(36) NOT NULL",
      "`reporterId` varchar(36) NULL DEFAULT NULL",
      "`reason` enum('SCAM','PROHIBITED','WRONG_CATEGORY','DUPLICATE','SOLD','OFFENSIVE','OTHER') NOT NULL",
      "`message` varchar(1000) NULL DEFAULT NULL",
      "`status` enum('OPEN','RESOLVED','DISMISSED') NOT NULL DEFAULT 'OPEN'",
      "`handledById` varchar(36) NULL DEFAULT NULL",
      "`resolution` varchar(500) NULL DEFAULT NULL",
      "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
      "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
    ],
    "keys": [
      [
        "idx_classified_report_status",
        "status,createdAt",
        false
      ],
      [
        "idx_classified_report_product",
        "productId",
        false
      ]
    ],
    "fks": [
      [
        "productId",
        "products",
        "fk_classified_report_product",
        "CASCADE"
      ],
      [
        "reporterId",
        "users",
        "fk_classified_report_user",
        "SET NULL"
      ]
    ]
  }
];

const PRODUCT_COLUMNS: [string, string][] = [
  [
    "listingType",
    "`listingType` enum('PRODUCT','CLASSIFIED') NOT NULL DEFAULT 'PRODUCT'"
  ],
  [
    "ownerId",
    "`ownerId` varchar(36) NULL DEFAULT NULL"
  ],
  [
    "adCityId",
    "`adCityId` varchar(36) NULL DEFAULT NULL"
  ],
  [
    "adStatus",
    "`adStatus` enum('DRAFT','PENDING_PAYMENT','PENDING_REVIEW','ACTIVE','REJECTED','EXPIRED','SOLD','CLOSED') NULL DEFAULT NULL"
  ],
  [
    "adCondition",
    "`adCondition` enum('NEW','USED','REFURBISHED','NOT_APPLICABLE') NULL DEFAULT NULL"
  ],
  [
    "adCurrency",
    "`adCurrency` varchar(10) NULL DEFAULT NULL"
  ],
  [
    "adNegotiable",
    "`adNegotiable` tinyint NOT NULL DEFAULT 0"
  ],
  [
    "adContactPhone",
    "`adContactPhone` varchar(30) NULL DEFAULT NULL"
  ],
  [
    "adWhatsapp",
    "`adWhatsapp` varchar(30) NULL DEFAULT NULL"
  ],
  [
    "adShowPhone",
    "`adShowPhone` tinyint NOT NULL DEFAULT 1"
  ],
  [
    "adPlanId",
    "`adPlanId` varchar(36) NULL DEFAULT NULL"
  ],
  [
    "adPlanCode",
    "`adPlanCode` varchar(50) NULL DEFAULT NULL"
  ],
  [
    "adPublishedAt",
    "`adPublishedAt` datetime(6) NULL DEFAULT NULL"
  ],
  [
    "adExpiresAt",
    "`adExpiresAt` datetime(6) NULL DEFAULT NULL"
  ],
  [
    "adFeaturedUntil",
    "`adFeaturedUntil` datetime(6) NULL DEFAULT NULL"
  ],
  [
    "adPendingDays",
    "`adPendingDays` int NULL DEFAULT NULL"
  ],
  [
    "adPendingFeatured",
    "`adPendingFeatured` tinyint NOT NULL DEFAULT 0"
  ],
  [
    "adRejectionReason",
    "`adRejectionReason` varchar(500) NULL DEFAULT NULL"
  ],
  [
    "adReviewedById",
    "`adReviewedById` varchar(36) NULL DEFAULT NULL"
  ],
  [
    "adReviewedAt",
    "`adReviewedAt` datetime(6) NULL DEFAULT NULL"
  ],
  [
    "adReminderSent",
    "`adReminderSent` tinyint NOT NULL DEFAULT 0"
  ],
  [
    "adViews",
    "`adViews` int NOT NULL DEFAULT 0"
  ],
  [
    "adContactClicks",
    "`adContactClicks` int NOT NULL DEFAULT 0"
  ],
  [
    "adDeleted",
    "`adDeleted` tinyint NOT NULL DEFAULT 0"
  ]
];

const PRODUCT_INDEXES: [string, string][] = [
  [
    "idx_products_listing",
    "listingType,adStatus,adCityId"
  ],
  [
    "idx_products_owner",
    "ownerId,adStatus"
  ],
  [
    "idx_products_ad_expires",
    "adStatus,adExpiresAt"
  ],
  [
    "idx_products_ad_published",
    "listingType,adStatus,adPublishedAt"
  ]
];

const PRODUCT_FKS: [string, string, string, string][] = [
  [
    "ownerId",
    "users",
    "fk_products_owner",
    "CASCADE"
  ],
  [
    "adCityId",
    "cities",
    "fk_products_ad_city",
    "SET NULL"
  ]
];

export class ClassifiedAds1793059200000 implements MigrationInterface {
  name = 'ClassifiedAds1793059200000';

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

  private async addFk(q: QueryRunner, table: string, col: string, refTable: string, fk: string, onDelete: string) {
    if (!(await this.tableExists(q, refTable)) || (await this.fkExists(q, table, fk))) return;
    const target = await this.column(q, refTable, 'id');
    const current = await this.column(q, table, col);
    if (!target || !current) return;
    if (current.type !== target.type || (current.coll || '') !== (target.coll || '')) {
      const charset = target.cs ? ` CHARACTER SET ${target.cs} COLLATE ${target.coll}` : '';
      await q.query(`ALTER TABLE \`${table}\` MODIFY \`${col}\` ${target.type}${charset}${current.nullable === 'YES' ? ' NULL DEFAULT NULL' : ' NOT NULL'}`);
    }
    await q.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`${col}\`) REFERENCES \`${refTable}\` (\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`);
  }

  public async up(q: QueryRunner): Promise<void> {
    // 1) Nettoyage de la 1re version (tables d'annonces séparées)
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['classified_favorites', 'classified_ad_images', 'classified_ads']) {
      if (await this.tableExists(q, t)) await q.query(`DROP TABLE \`${t}\``);
    }
    for (const t of ['classified_payments', 'classified_reports']) {
      if (await this.column(q, t, 'adId')) await q.query(`DROP TABLE \`${t}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');

    // 2) products : entreprise facultative
    const fkCol = await q.query(
      "SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND REFERENCED_TABLE_NAME = 'company' LIMIT 1",
    );
    const companyCol = fkCol[0]?.col || 'companyId';
    const company = await this.column(q, 'products', companyCol);
    if (company && company.nullable === 'NO') {
      const charset = company.cs ? ` CHARACTER SET ${company.cs} COLLATE ${company.coll}` : '';
      await q.query(`ALTER TABLE \`products\` MODIFY \`${companyCol}\` ${company.type}${charset} NULL DEFAULT NULL`);
    }

    // 3) products : colonnes et index des annonces
    for (const [col, def] of PRODUCT_COLUMNS) {
      if (!(await this.column(q, 'products', col))) await q.query(`ALTER TABLE \`products\` ADD COLUMN ${def}`);
    }
    for (const [name, cols] of PRODUCT_INDEXES) {
      if (await this.indexExists(q, 'products', name)) continue;
      await q.query(`ALTER TABLE \`products\` ADD INDEX \`${name}\` (${cols.split(',').map((c) => `\`${c}\``).join(', ')})`);
    }

    // 4) Tables des annonces
    const ref = await q.query(
      'SELECT t.TABLE_COLLATION AS coll, c.CHARACTER_SET_NAME AS cs FROM information_schema.TABLES t ' +
        'JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION ' +
        "WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'products' LIMIT 1",
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

    // 5) Clés étrangères
    for (const [col, refTable, fk, onDelete] of PRODUCT_FKS) await this.addFk(q, 'products', col, refTable, fk, onDelete);
    for (const t of TABLES) for (const [col, refTable, fk, onDelete] of t.fks) await this.addFk(q, t.name, col, refTable, fk, onDelete);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [...TABLES].reverse()) {
      if (await this.tableExists(q, t.name)) await q.query(`DROP TABLE \`${t.name}\``);
    }
    for (const [, , fk] of PRODUCT_FKS) {
      if (await this.fkExists(q, 'products', fk)) await q.query(`ALTER TABLE \`products\` DROP FOREIGN KEY \`${fk}\``);
    }
    for (const [name] of PRODUCT_INDEXES) {
      if (await this.indexExists(q, 'products', name)) await q.query(`ALTER TABLE \`products\` DROP INDEX \`${name}\``);
    }
    // Les annonces sont supprimées avant de retirer les colonnes ; companyId reste nullable (sans risque)
    if (await this.column(q, 'products', 'listingType')) await q.query("DELETE FROM `products` WHERE `listingType` = 'CLASSIFIED'");
    for (const [col] of [...PRODUCT_COLUMNS].reverse()) {
      if (await this.column(q, 'products', col)) await q.query(`ALTER TABLE \`products\` DROP COLUMN \`${col}\``);
    }
    await q.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
