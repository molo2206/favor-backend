import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Approvisionnement des branches (stock + pointage), Supply (commande → shipment + historique),
 * BackOffice : logistique interne (biens de l'entreprise) et charroi (flotte de véhicules).
 *
 * Idempotente : chaque table / colonne / index / clé étrangère n'est créé que s'il n'existe pas.
 * Les colonnes de clés étrangères sont alignées sur le type + charset + collation de `ref`.`id`
 * (évite l'erreur MySQL #3780). Script SQL équivalent : db/sql/supply_branch_stock_logistique.sql
 */
type TableSpec = {
  name: string;
  columns: string[];
  keys: [string, string, boolean][];
  fks: [string, string, string, string][];
};

const SPEC: { tables: TableSpec[]; shipCols: [string, string][]; shipIdx: [string, string][] } = {
  "tables": [
    {
      "name": "branch_parcel_stocks",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`branchId` varchar(36) NOT NULL",
        "`companyId` varchar(36) NULL DEFAULT NULL",
        "`shipmentId` varchar(36) NOT NULL",
        "`ltaId` varchar(36) NULL DEFAULT NULL",
        "`trackingNumber` varchar(100) NOT NULL",
        "`description` varchar(255) NULL DEFAULT NULL",
        "`clientName` varchar(150) NULL DEFAULT NULL",
        "`clientPhone` varchar(50) NULL DEFAULT NULL",
        "`quantityIn` int NOT NULL DEFAULT 0",
        "`quantityOut` int NOT NULL DEFAULT 0",
        "`quantityAvailable` int NOT NULL DEFAULT 0",
        "`status` enum('IN_STOCK','PARTIAL','OUT') NOT NULL DEFAULT 'IN_STOCK'",
        "`location` varchar(100) NULL DEFAULT NULL",
        "`firstReceivedAt` datetime(6) NULL DEFAULT NULL",
        "`lastMovementAt` datetime(6) NULL DEFAULT NULL",
        "`receivedById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_bps_branch_shipment",
          "branchId,shipmentId",
          true
        ],
        [
          "idx_bps_branch_status",
          "branchId,status",
          false
        ],
        [
          "idx_bps_shipment",
          "shipmentId",
          false
        ],
        [
          "idx_bps_tracking",
          "trackingNumber",
          false
        ]
      ],
      "fks": [
        [
          "branchId",
          "branches",
          "fk_bps_branch",
          "CASCADE"
        ],
        [
          "shipmentId",
          "shipments",
          "fk_bps_shipment",
          "CASCADE"
        ],
        [
          "ltaId",
          "lta",
          "fk_bps_lta",
          "SET NULL"
        ],
        [
          "receivedById",
          "users",
          "fk_bps_received_by",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "branch_parcel_movements",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`stockId` varchar(36) NOT NULL",
        "`branchId` varchar(36) NOT NULL",
        "`shipmentId` varchar(36) NOT NULL",
        "`type` enum('IN_RECEPTION','IN_TRANSFER','IN_ADJUSTMENT','OUT_PICKUP','OUT_TRANSFER','OUT_MANUAL','OUT_ADJUSTMENT') NOT NULL",
        "`quantity` int NOT NULL",
        "`quantityBefore` int NOT NULL",
        "`quantityAfter` int NOT NULL",
        "`reason` varchar(255) NULL DEFAULT NULL",
        "`note` text NULL",
        "`reference` varchar(100) NULL DEFAULT NULL",
        "`transferId` varchar(36) NULL DEFAULT NULL",
        "`recipientName` varchar(150) NULL DEFAULT NULL",
        "`recipientPhone` varchar(50) NULL DEFAULT NULL",
        "`performedById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "idx_bpm_branch_date",
          "branchId,createdAt",
          false
        ],
        [
          "idx_bpm_stock",
          "stockId",
          false
        ],
        [
          "idx_bpm_shipment",
          "shipmentId",
          false
        ],
        [
          "idx_bpm_transfer",
          "transferId",
          false
        ]
      ],
      "fks": [
        [
          "stockId",
          "branch_parcel_stocks",
          "fk_bpm_stock",
          "CASCADE"
        ],
        [
          "branchId",
          "branches",
          "fk_bpm_branch",
          "CASCADE"
        ],
        [
          "shipmentId",
          "shipments",
          "fk_bpm_shipment",
          "CASCADE"
        ],
        [
          "performedById",
          "users",
          "fk_bpm_performed_by",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "supplies",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`reference` varchar(30) NOT NULL",
        "`orderId` varchar(36) NOT NULL",
        "`subOrderId` varchar(36) NULL DEFAULT NULL",
        "`companyId` varchar(36) NULL DEFAULT NULL",
        "`customerId` varchar(36) NULL DEFAULT NULL",
        "`shipmentId` varchar(36) NULL DEFAULT NULL",
        "`originBranchId` varchar(36) NULL DEFAULT NULL",
        "`destinationBranchId` varchar(36) NULL DEFAULT NULL",
        "`status` enum('PENDING','PREPARING','READY_TO_SHIP','SHIPMENT_CREATED','IN_TRANSIT','ARRIVED','RECEIVED_AT_BRANCH','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING'",
        "`invoiceNumber` varchar(100) NULL DEFAULT NULL",
        "`totalAmount` decimal(12,2) NOT NULL DEFAULT 0",
        "`currency` varchar(10) NULL DEFAULT NULL",
        "`itemsCount` int NOT NULL DEFAULT 0",
        "`notes` text NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`shipmentCreatedAt` datetime(6) NULL DEFAULT NULL",
        "`receivedAt` datetime(6) NULL DEFAULT NULL",
        "`completedAt` datetime(6) NULL DEFAULT NULL",
        "`cancelledAt` datetime(6) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_supplies_reference",
          "reference",
          true
        ],
        [
          "idx_supplies_order",
          "orderId",
          false
        ],
        [
          "idx_supplies_status",
          "status",
          false
        ],
        [
          "idx_supplies_sub_order",
          "subOrderId",
          false
        ],
        [
          "idx_supplies_company",
          "companyId",
          false
        ],
        [
          "idx_supplies_shipment",
          "shipmentId",
          false
        ]
      ],
      "fks": [
        [
          "orderId",
          "orders",
          "fk_supplies_order",
          "CASCADE"
        ],
        [
          "subOrderId",
          "sub_orders",
          "fk_supplies_sub_order",
          "SET NULL"
        ],
        [
          "companyId",
          "company",
          "fk_supplies_company",
          "SET NULL"
        ],
        [
          "customerId",
          "users",
          "fk_supplies_customer",
          "SET NULL"
        ],
        [
          "shipmentId",
          "shipments",
          "fk_supplies_shipment",
          "SET NULL"
        ],
        [
          "originBranchId",
          "branches",
          "fk_supplies_origin_branch",
          "SET NULL"
        ],
        [
          "destinationBranchId",
          "branches",
          "fk_supplies_dest_branch",
          "SET NULL"
        ],
        [
          "createdById",
          "users",
          "fk_supplies_created_by",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "supply_history",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`supplyId` varchar(36) NOT NULL",
        "`eventType` enum('SUPPLY_CREATED','SUPPLY_STATUS_CHANGED','ORDER_STATUS_CHANGED','SHIPMENT_CREATED','SHIPMENT_STATUS_CHANGED','SHIPMENT_TRACKING','ADDED_TO_LTA','LTA_TRACKING','RECEIVED_AT_BRANCH','STOCK_MOVEMENT','PICKED_UP','TRANSFER_DISPATCHED','TRANSFER_RECEIVED','NOTE','CANCELLED') NOT NULL",
        "`fromStatus` varchar(50) NULL DEFAULT NULL",
        "`toStatus` varchar(50) NULL DEFAULT NULL",
        "`description` varchar(500) NOT NULL",
        "`orderId` varchar(36) NULL DEFAULT NULL",
        "`shipmentId` varchar(36) NULL DEFAULT NULL",
        "`ltaId` varchar(36) NULL DEFAULT NULL",
        "`branchId` varchar(36) NULL DEFAULT NULL",
        "`location` varchar(255) NULL DEFAULT NULL",
        "`payload` json NULL",
        "`performedById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "idx_supply_history_supply_date",
          "supplyId,createdAt",
          false
        ],
        [
          "idx_supply_history_shipment",
          "shipmentId",
          false
        ]
      ],
      "fks": [
        [
          "supplyId",
          "supplies",
          "fk_supply_history_supply",
          "CASCADE"
        ],
        [
          "performedById",
          "users",
          "fk_supply_history_user",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "bo_fleet_vehicles",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`branchId` varchar(36) NULL DEFAULT NULL",
        "`plateNumber` varchar(30) NOT NULL",
        "`brand` varchar(80) NOT NULL",
        "`model` varchar(80) NULL DEFAULT NULL",
        "`year` int NULL DEFAULT NULL",
        "`type` enum('CAR','PICKUP','VAN','TRUCK','MOTORBIKE','BUS','OTHER') NOT NULL DEFAULT 'CAR'",
        "`fuelType` enum('PETROL','DIESEL','ELECTRIC','HYBRID','OTHER') NOT NULL DEFAULT 'DIESEL'",
        "`color` varchar(40) NULL DEFAULT NULL",
        "`vin` varchar(50) NULL DEFAULT NULL",
        "`seats` int NULL DEFAULT NULL",
        "`capacityKg` decimal(10,2) NULL DEFAULT NULL",
        "`mileage` int NOT NULL DEFAULT 0",
        "`status` enum('AVAILABLE','IN_MISSION','MAINTENANCE','OUT_OF_SERVICE','RETIRED') NOT NULL DEFAULT 'AVAILABLE'",
        "`assignedDriverId` varchar(36) NULL DEFAULT NULL",
        "`acquisitionDate` date NULL DEFAULT NULL",
        "`acquisitionCost` decimal(14,2) NULL DEFAULT NULL",
        "`photoUrl` varchar(500) NULL DEFAULT NULL",
        "`notes` text NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_fleet_vehicle_plate",
          "companyId,plateNumber",
          true
        ],
        [
          "idx_fleet_vehicle_status",
          "companyId,status",
          false
        ]
      ],
      "fks": [
        [
          "companyId",
          "company",
          "fk_fleet_vehicle_company",
          "CASCADE"
        ],
        [
          "branchId",
          "branches",
          "fk_fleet_vehicle_branch",
          "SET NULL"
        ],
        [
          "assignedDriverId",
          "users",
          "fk_fleet_vehicle_driver",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "bo_fleet_missions",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`reference` varchar(30) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`vehicleId` varchar(36) NOT NULL",
        "`driverId` varchar(36) NULL DEFAULT NULL",
        "`type` enum('DELIVERY','PICKUP','TRANSFER','ADMINISTRATIVE','OTHER') NOT NULL DEFAULT 'OTHER'",
        "`purpose` varchar(255) NOT NULL",
        "`origin` varchar(255) NULL DEFAULT NULL",
        "`destination` varchar(255) NULL DEFAULT NULL",
        "`plannedStartAt` datetime(6) NULL DEFAULT NULL",
        "`plannedEndAt` datetime(6) NULL DEFAULT NULL",
        "`startedAt` datetime(6) NULL DEFAULT NULL",
        "`endedAt` datetime(6) NULL DEFAULT NULL",
        "`startMileage` int NULL DEFAULT NULL",
        "`endMileage` int NULL DEFAULT NULL",
        "`distanceKm` int NULL DEFAULT NULL",
        "`status` enum('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PLANNED'",
        "`notes` text NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_fleet_mission_reference",
          "reference",
          true
        ],
        [
          "idx_fleet_mission_vehicle",
          "vehicleId,createdAt",
          false
        ],
        [
          "idx_fleet_mission_company_status",
          "companyId,status",
          false
        ]
      ],
      "fks": [
        [
          "vehicleId",
          "bo_fleet_vehicles",
          "fk_fleet_mission_vehicle",
          "CASCADE"
        ],
        [
          "driverId",
          "users",
          "fk_fleet_mission_driver",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "bo_fleet_fuel_logs",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`vehicleId` varchar(36) NOT NULL",
        "`driverId` varchar(36) NULL DEFAULT NULL",
        "`missionId` varchar(36) NULL DEFAULT NULL",
        "`filledAt` datetime(6) NOT NULL",
        "`liters` decimal(10,2) NOT NULL",
        "`unitPrice` decimal(10,2) NOT NULL",
        "`totalCost` decimal(12,2) NOT NULL",
        "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
        "`mileage` int NULL DEFAULT NULL",
        "`station` varchar(150) NULL DEFAULT NULL",
        "`fullTank` tinyint NOT NULL DEFAULT 1",
        "`receiptUrl` varchar(500) NULL DEFAULT NULL",
        "`notes` text NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "idx_fleet_fuel_vehicle_date",
          "vehicleId,filledAt",
          false
        ],
        [
          "idx_fleet_fuel_company_date",
          "companyId,filledAt",
          false
        ]
      ],
      "fks": [
        [
          "vehicleId",
          "bo_fleet_vehicles",
          "fk_fleet_fuel_vehicle",
          "CASCADE"
        ],
        [
          "driverId",
          "users",
          "fk_fleet_fuel_driver",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "bo_fleet_maintenances",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`vehicleId` varchar(36) NOT NULL",
        "`type` enum('PREVENTIVE','CORRECTIVE','BREAKDOWN','INSPECTION','TIRES','OTHER') NOT NULL DEFAULT 'PREVENTIVE'",
        "`title` varchar(200) NOT NULL",
        "`description` text NULL",
        "`garage` varchar(150) NULL DEFAULT NULL",
        "`scheduledAt` datetime(6) NULL DEFAULT NULL",
        "`startedAt` datetime(6) NULL DEFAULT NULL",
        "`completedAt` datetime(6) NULL DEFAULT NULL",
        "`mileage` int NULL DEFAULT NULL",
        "`cost` decimal(12,2) NULL DEFAULT NULL",
        "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
        "`status` enum('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED'",
        "`nextDueDate` date NULL DEFAULT NULL",
        "`nextDueMileage` int NULL DEFAULT NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "idx_fleet_maint_vehicle",
          "vehicleId,createdAt",
          false
        ],
        [
          "idx_fleet_maint_company_status",
          "companyId,status",
          false
        ]
      ],
      "fks": [
        [
          "vehicleId",
          "bo_fleet_vehicles",
          "fk_fleet_maint_vehicle",
          "CASCADE"
        ]
      ]
    },
    {
      "name": "bo_fleet_documents",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`vehicleId` varchar(36) NOT NULL",
        "`type` enum('INSURANCE','TECHNICAL_INSPECTION','REGISTRATION','ROAD_TAX','PARKING_PERMIT','OTHER') NOT NULL",
        "`number` varchar(100) NULL DEFAULT NULL",
        "`issuer` varchar(150) NULL DEFAULT NULL",
        "`issueDate` date NULL DEFAULT NULL",
        "`expiryDate` date NULL DEFAULT NULL",
        "`cost` decimal(12,2) NULL DEFAULT NULL",
        "`fileUrl` varchar(500) NULL DEFAULT NULL",
        "`notes` text NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "idx_fleet_doc_expiry",
          "companyId,expiryDate",
          false
        ],
        [
          "idx_fleet_doc_vehicle",
          "vehicleId",
          false
        ]
      ],
      "fks": [
        [
          "vehicleId",
          "bo_fleet_vehicles",
          "fk_fleet_doc_vehicle",
          "CASCADE"
        ]
      ]
    },
    {
      "name": "bo_asset_categories",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`name` varchar(120) NOT NULL",
        "`code` varchar(10) NULL DEFAULT NULL",
        "`description` varchar(500) NULL DEFAULT NULL",
        "`depreciationYears` int NULL DEFAULT NULL",
        "`isActive` tinyint NOT NULL DEFAULT 1",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_bo_asset_category_name",
          "companyId,name",
          true
        ],
        [
          "idx_bo_asset_category_company",
          "companyId",
          false
        ]
      ],
      "fks": [
        [
          "companyId",
          "company",
          "fk_bo_asset_category_company",
          "CASCADE"
        ]
      ]
    },
    {
      "name": "bo_assets",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`reference` varchar(40) NOT NULL",
        "`name` varchar(150) NOT NULL",
        "`categoryId` varchar(36) NULL DEFAULT NULL",
        "`description` text NULL",
        "`brand` varchar(80) NULL DEFAULT NULL",
        "`model` varchar(80) NULL DEFAULT NULL",
        "`serialNumber` varchar(100) NULL DEFAULT NULL",
        "`barcode` varchar(100) NULL DEFAULT NULL",
        "`quantity` int NOT NULL DEFAULT 1",
        "`status` enum('AVAILABLE','IN_USE','IN_REPAIR','LOST','DISPOSED') NOT NULL DEFAULT 'AVAILABLE'",
        "`condition` enum('NEW','GOOD','FAIR','POOR','DAMAGED') NOT NULL DEFAULT 'GOOD'",
        "`branchId` varchar(36) NULL DEFAULT NULL",
        "`location` varchar(150) NULL DEFAULT NULL",
        "`assignedToUserId` varchar(36) NULL DEFAULT NULL",
        "`assignedAt` datetime(6) NULL DEFAULT NULL",
        "`acquisitionDate` date NULL DEFAULT NULL",
        "`acquisitionCost` decimal(14,2) NULL DEFAULT NULL",
        "`currency` varchar(10) NOT NULL DEFAULT 'USD'",
        "`supplier` varchar(150) NULL DEFAULT NULL",
        "`invoiceNumber` varchar(100) NULL DEFAULT NULL",
        "`warrantyEndDate` date NULL DEFAULT NULL",
        "`depreciationYears` int NULL DEFAULT NULL",
        "`disposalReason` enum('SOLD','DONATED','SCRAPPED','STOLEN','OTHER') NULL DEFAULT NULL",
        "`disposalDate` date NULL DEFAULT NULL",
        "`disposalValue` decimal(14,2) NULL DEFAULT NULL",
        "`lastCheckedAt` datetime(6) NULL DEFAULT NULL",
        "`photoUrl` varchar(500) NULL DEFAULT NULL",
        "`notes` text NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "uq_bo_asset_reference",
          "companyId,reference",
          true
        ],
        [
          "idx_bo_asset_company_status",
          "companyId,status",
          false
        ],
        [
          "idx_bo_asset_branch",
          "branchId",
          false
        ],
        [
          "idx_bo_asset_assignee",
          "assignedToUserId",
          false
        ],
        [
          "idx_bo_asset_serial",
          "serialNumber",
          false
        ],
        [
          "idx_bo_asset_barcode",
          "barcode",
          false
        ]
      ],
      "fks": [
        [
          "companyId",
          "company",
          "fk_bo_asset_company",
          "CASCADE"
        ],
        [
          "categoryId",
          "bo_asset_categories",
          "fk_bo_asset_category",
          "SET NULL"
        ],
        [
          "branchId",
          "branches",
          "fk_bo_asset_branch",
          "SET NULL"
        ],
        [
          "assignedToUserId",
          "users",
          "fk_bo_asset_assignee",
          "SET NULL"
        ]
      ]
    },
    {
      "name": "bo_asset_movements",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`assetId` varchar(36) NOT NULL",
        "`companyId` varchar(36) NOT NULL",
        "`type` enum('ACQUIRED','ASSIGNED','RETURNED','TRANSFERRED','REPAIR_SENT','REPAIR_RETURNED','CONDITION_CHANGED','INVENTORY_CHECK','LOST','FOUND','DISPOSED','UPDATED') NOT NULL",
        "`fromBranchId` varchar(36) NULL DEFAULT NULL",
        "`toBranchId` varchar(36) NULL DEFAULT NULL",
        "`fromUserId` varchar(36) NULL DEFAULT NULL",
        "`toUserId` varchar(36) NULL DEFAULT NULL",
        "`fromStatus` varchar(20) NULL DEFAULT NULL",
        "`toStatus` varchar(20) NULL DEFAULT NULL",
        "`fromCondition` varchar(20) NULL DEFAULT NULL",
        "`toCondition` varchar(20) NULL DEFAULT NULL",
        "`location` varchar(150) NULL DEFAULT NULL",
        "`amount` decimal(14,2) NULL DEFAULT NULL",
        "`note` varchar(500) NULL DEFAULT NULL",
        "`performedById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)"
      ],
      "keys": [
        [
          "idx_bo_asset_mvt_asset_date",
          "assetId,createdAt",
          false
        ],
        [
          "idx_bo_asset_mvt_company_date",
          "companyId,createdAt",
          false
        ]
      ],
      "fks": [
        [
          "assetId",
          "bo_assets",
          "fk_bo_asset_mvt_asset",
          "CASCADE"
        ],
        [
          "performedById",
          "users",
          "fk_bo_asset_mvt_user",
          "SET NULL"
        ]
      ]
    }
  ],
  "shipCols": [
    [
      "orderId",
      "varchar(36) NULL DEFAULT NULL"
    ],
    [
      "subOrderId",
      "varchar(36) NULL DEFAULT NULL"
    ],
    [
      "supplyId",
      "varchar(36) NULL DEFAULT NULL"
    ]
  ],
  "shipIdx": [
    [
      "idx_shipments_order",
      "orderId"
    ],
    [
      "idx_shipments_supply",
      "supplyId"
    ]
  ]
};

export class SupplyBranchStockLogistics1792622400000 implements MigrationInterface {
  name = 'SupplyBranchStockLogistics1792622400000';

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

    // 1) shipments : orderId / subOrderId / supplyId
    for (const [col, def] of SPEC.shipCols) {
      if (!(await this.column(q, 'shipments', col))) {
        await q.query(`ALTER TABLE \`shipments\` ADD COLUMN \`${col}\` ${def}`);
      }
    }
    for (const [name, cols] of SPEC.shipIdx) await this.addIndex(q, 'shipments', name, cols, false);

    // 2) Tables + index
    for (const t of SPEC.tables) {
      if (!(await this.tableExists(q, t.name))) {
        await q.query(
          `CREATE TABLE \`${t.name}\` (${[...t.columns, 'PRIMARY KEY (\`id\`)'].join(', ')}) ` +
            `ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
        );
      }
      for (const [name, cols, unique] of t.keys) await this.addIndex(q, t.name, name, cols, unique);
    }

    // 3) Clés étrangères (colonne alignée sur la colonne référencée)
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
    for (const [name] of SPEC.shipIdx) {
      if (await this.indexExists(q, 'shipments', name)) await q.query(`ALTER TABLE \`shipments\` DROP INDEX \`${name}\``);
    }
    for (const [col] of SPEC.shipCols) {
      if (await this.column(q, 'shipments', col)) await q.query(`ALTER TABLE \`shipments\` DROP COLUMN \`${col}\``);
    }
  }
}
