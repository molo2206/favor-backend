import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transferts de colis entre branches + pointage à l'arrivée :
 * parcel_transfers, parcel_transfer_items, parcel_checkins, parcel_checkin_items.
 *
 * Idempotente : chaque table / index / clé étrangère n'est créé que s'il n'existe pas.
 * Ne modifie aucune table existante. Les colonnes de clés étrangères sont alignées sur le type
 * + charset + collation de `ref`.`id` (évite l'erreur MySQL #3780).
 * Script SQL équivalent : db/sql/transferts_colis_branches.sql
 */
type TableSpec = {
  name: string;
  columns: string[];
  keys: [string, string, boolean][];
  fks: [string, string, string, string][];
};

const SPEC: { tables: TableSpec[] } = {
  "tables": [
    {
      "name": "parcel_transfers",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`code` varchar(30) NOT NULL",
        "`fromBranchId` varchar(36) NOT NULL",
        "`toBranchId` varchar(36) NOT NULL",
        "`companyId` varchar(36) NULL DEFAULT NULL",
        "`ltaId` varchar(36) NULL DEFAULT NULL",
        "`status` enum('IN_TRANSIT','RECEIVED','PARTIALLY_RECEIVED','CLOSED','CANCELLED') NOT NULL DEFAULT 'IN_TRANSIT'",
        "`parcelsCount` int NOT NULL DEFAULT 0",
        "`piecesCount` int NOT NULL DEFAULT 0",
        "`receivedPieces` int NOT NULL DEFAULT 0",
        "`missingPieces` int NOT NULL DEFAULT 0",
        "`returnedPieces` int NOT NULL DEFAULT 0",
        "`note` text NULL",
        "`sentById` varchar(36) NULL DEFAULT NULL",
        "`sentAt` datetime(6) NULL DEFAULT NULL",
        "`receivedById` varchar(36) NULL DEFAULT NULL",
        "`receivedAt` datetime(6) NULL DEFAULT NULL",
        "`cancelledById` varchar(36) NULL DEFAULT NULL",
        "`cancelledAt` datetime(6) NULL DEFAULT NULL",
        "`cancelReason` varchar(255) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_pt_code",
          "code",
          true
        ],
        [
          "idx_pt_from_status",
          "fromBranchId,status",
          false
        ],
        [
          "idx_pt_to_status",
          "toBranchId,status",
          false
        ],
        [
          "idx_pt_lta",
          "ltaId",
          false
        ]
      ],
      "fks": [
        [
          "fromBranchId",
          "branches",
          "fk_pt_from_branch",
          "CASCADE"
        ],
        [
          "toBranchId",
          "branches",
          "fk_pt_to_branch",
          "CASCADE"
        ],
        [
          "ltaId",
          "lta",
          "fk_pt_lta",
          "SET NULL"
        ],
        [
          "sentById",
          "users",
          "fk_pt_sent_by",
          "SET NULL"
        ],
        [
          "receivedById",
          "users",
          "fk_pt_received_by",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "parcel_transfer_items",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`transferId` varchar(36) NOT NULL",
        "`shipmentId` varchar(36) NOT NULL",
        "`fromStockId` varchar(36) NOT NULL",
        "`toStockId` varchar(36) NULL DEFAULT NULL",
        "`trackingNumber` varchar(100) NOT NULL",
        "`description` varchar(255) NULL DEFAULT NULL",
        "`clientName` varchar(150) NULL DEFAULT NULL",
        "`clientPhone` varchar(50) NULL DEFAULT NULL",
        "`quantity` int NOT NULL",
        "`receivedQty` int NOT NULL DEFAULT 0",
        "`returnedQty` int NOT NULL DEFAULT 0",
        "`status` enum('IN_TRANSIT','RECEIVED','PARTIAL','MISSING','RETURNED','CANCELLED') NOT NULL DEFAULT 'IN_TRANSIT'",
        "`outMovementId` varchar(36) NULL DEFAULT NULL",
        "`inMovementId` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_pti_transfer_shipment",
          "transferId,shipmentId",
          true
        ],
        [
          "idx_pti_shipment",
          "shipmentId",
          false
        ]
      ],
      "fks": [
        [
          "transferId",
          "parcel_transfers",
          "fk_pti_transfer",
          "CASCADE"
        ],
        [
          "shipmentId",
          "shipments",
          "fk_pti_shipment",
          "CASCADE"
        ]
      ]
    },
    {
      "name": "parcel_checkins",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`code` varchar(30) NOT NULL",
        "`type` enum('LTA_ARRIVAL','TRANSFER_RECEPTION') NOT NULL",
        "`status` enum('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN'",
        "`branchId` varchar(36) NOT NULL",
        "`companyId` varchar(36) NULL DEFAULT NULL",
        "`ltaId` varchar(36) NULL DEFAULT NULL",
        "`transferId` varchar(36) NULL DEFAULT NULL",
        "`shipmentStatus` varchar(40) NULL DEFAULT NULL",
        "`expectedParcels` int NOT NULL DEFAULT 0",
        "`expectedPieces` int NOT NULL DEFAULT 0",
        "`checkedParcels` int NOT NULL DEFAULT 0",
        "`checkedPieces` int NOT NULL DEFAULT 0",
        "`missingParcels` int NOT NULL DEFAULT 0",
        "`missingPieces` int NOT NULL DEFAULT 0",
        "`unexpectedParcels` int NOT NULL DEFAULT 0",
        "`unknownCodes` int NOT NULL DEFAULT 0",
        "`damagedParcels` int NOT NULL DEFAULT 0",
        "`note` text NULL",
        "`openedById` varchar(36) NULL DEFAULT NULL",
        "`closedById` varchar(36) NULL DEFAULT NULL",
        "`closedAt` datetime(6) NULL DEFAULT NULL",
        "`cancelReason` varchar(255) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_pc_code",
          "code",
          true
        ],
        [
          "idx_pc_branch_status",
          "branchId,status",
          false
        ],
        [
          "idx_pc_lta",
          "ltaId",
          false
        ],
        [
          "idx_pc_transfer",
          "transferId",
          false
        ]
      ],
      "fks": [
        [
          "branchId",
          "branches",
          "fk_pc_branch",
          "CASCADE"
        ],
        [
          "ltaId",
          "lta",
          "fk_pc_lta",
          "SET NULL"
        ],
        [
          "transferId",
          "parcel_transfers",
          "fk_pc_transfer",
          "SET NULL"
        ],
        [
          "openedById",
          "users",
          "fk_pc_opened_by",
          "SET NULL"
        ],
        [
          "closedById",
          "users",
          "fk_pc_closed_by",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "parcel_checkin_items",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`checkinId` varchar(36) NOT NULL",
        "`shipmentId` varchar(36) NULL DEFAULT NULL",
        "`trackingNumber` varchar(100) NOT NULL",
        "`description` varchar(255) NULL DEFAULT NULL",
        "`clientName` varchar(150) NULL DEFAULT NULL",
        "`clientPhone` varchar(50) NULL DEFAULT NULL",
        "`expectedQty` int NOT NULL DEFAULT 0",
        "`checkedQty` int NOT NULL DEFAULT 0",
        "`status` enum('PENDING','PARTIAL','CHECKED','MISSING','UNEXPECTED','UNKNOWN','ALREADY_RECEIVED') NOT NULL DEFAULT 'PENDING'",
        "`damaged` tinyint NOT NULL DEFAULT 0",
        "`note` text NULL",
        "`transferItemId` varchar(36) NULL DEFAULT NULL",
        "`stockId` varchar(36) NULL DEFAULT NULL",
        "`movementId` varchar(36) NULL DEFAULT NULL",
        "`closeResult` varchar(500) NULL DEFAULT NULL",
        "`firstCheckedAt` datetime(6) NULL DEFAULT NULL",
        "`lastCheckedAt` datetime(6) NULL DEFAULT NULL",
        "`checkedById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_pci_checkin_tracking",
          "checkinId,trackingNumber",
          true
        ],
        [
          "idx_pci_checkin_status",
          "checkinId,status",
          false
        ],
        [
          "idx_pci_shipment",
          "shipmentId",
          false
        ]
      ],
      "fks": [
        [
          "checkinId",
          "parcel_checkins",
          "fk_pci_checkin",
          "CASCADE"
        ],
        [
          "shipmentId",
          "shipments",
          "fk_pci_shipment",
          "CASCADE"
        ],
        [
          "checkedById",
          "users",
          "fk_pci_checked_by",
          "SET NULL"
        ]
      ]
    }
  ]
};

export class ParcelTransfersCheckins1794268800000 implements MigrationInterface {
  name = 'ParcelTransfersCheckins1794268800000';

  private async tableExists(q: QueryRunner, table: string): Promise<boolean> {
    const r = await q.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
      [table],
    );
    return r.length > 0;
  }

  private async column(q: QueryRunner, table: string, col: string) {
    const r = await q.query(
      'SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll, IS_NULLABLE AS nullable ' +
        'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [table, col],
    );
    return r[0] as { type: string; cs: string | null; coll: string | null; nullable: string } | undefined;
  }

  private async indexExists(q: QueryRunner, table: string, index: string): Promise<boolean> {
    const r = await q.query(
      'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
      [table, index],
    );
    return r.length > 0;
  }

  private async fkExists(q: QueryRunner, table: string, fk: string): Promise<boolean> {
    const r = await q.query(
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
      [table, fk],
    );
    return r.length > 0;
  }

  private async addIndex(q: QueryRunner, table: string, name: string, cols: string, unique: boolean) {
    if (await this.indexExists(q, table, name)) return;
    const list = cols.split(',').map((c) => `\`${c.trim()}\``).join(', ');
    await q.query(`ALTER TABLE \`${table}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${list})`);
  }

  public async up(q: QueryRunner): Promise<void> {
    // Charset / collation de référence : ceux de `shipments`
    const ref = await q.query(
      'SELECT t.TABLE_COLLATION AS coll, c.CHARACTER_SET_NAME AS cs FROM information_schema.TABLES t ' +
        'JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION ' +
        "WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'shipments' LIMIT 1",
    );
    const cs = ref[0]?.cs || 'utf8mb4';
    const coll = ref[0]?.coll || 'utf8mb4_unicode_ci';

    // 1) Tables + index
    for (const t of SPEC.tables) {
      if (!(await this.tableExists(q, t.name))) {
        await q.query(
          `CREATE TABLE \`${t.name}\` (${[...t.columns, 'PRIMARY KEY (\`id\`)'].join(', ')}) ` +
            `ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
        );
      }
      for (const [name, cols, unique] of t.keys) await this.addIndex(q, t.name, name, cols, unique);
    }

    // 2) Clés étrangères (colonne alignée sur la colonne référencée)
    for (const t of SPEC.tables) {
      for (const [col, refTable, fk, onDelete] of t.fks) {
        if (!(await this.tableExists(q, refTable))) continue;
        if (await this.fkExists(q, t.name, fk)) continue;
        const target = await this.column(q, refTable, 'id');
        const current = await this.column(q, t.name, col);
        if (!target || !current) continue;
        if (current.type !== target.type || (current.coll || '') !== (target.coll || '')) {
          const charset = target.cs ? ` CHARACTER SET ${target.cs} COLLATE ${target.coll}` : '';
          const nullable = current.nullable === 'YES' ? ' NULL DEFAULT NULL' : ' NOT NULL';
          await q.query(`ALTER TABLE \`${t.name}\` MODIFY \`${col}\` ${target.type}${charset}${nullable}`);
        }
        await q.query(
          `ALTER TABLE \`${t.name}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`${col}\`) ` +
            `REFERENCES \`${refTable}\` (\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`,
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Ordre inverse (dépendances)
    for (const t of [...SPEC.tables].reverse()) {
      if (await this.tableExists(q, t.name)) await q.query(`DROP TABLE \`${t.name}\``);
    }
  }
}
