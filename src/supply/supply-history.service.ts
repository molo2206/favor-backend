import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { Supply } from './entities/supply.entity';
import { SupplyHistory } from './entities/supply-history.entity';
import { SupplyEventType, SupplyStatus } from './enums/supply.enum';

export interface SupplyEventInput {
  eventType: SupplyEventType;
  description: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  orderId?: string | null;
  shipmentId?: string | null;
  ltaId?: string | null;
  branchId?: string | null;
  location?: string | null;
  payload?: Record<string, any> | null;
  performedById?: string | null;
}

/** Ordre des étapes : un Supply n'avance jamais en arrière (sauf annulation) */
const STATUS_RANK: Record<SupplyStatus, number> = {
  [SupplyStatus.PENDING]: 0,
  [SupplyStatus.PREPARING]: 1,
  [SupplyStatus.READY_TO_SHIP]: 2,
  [SupplyStatus.SHIPMENT_CREATED]: 3,
  [SupplyStatus.IN_TRANSIT]: 4,
  [SupplyStatus.ARRIVED]: 5,
  [SupplyStatus.RECEIVED_AT_BRANCH]: 6,
  [SupplyStatus.COMPLETED]: 7,
  [SupplyStatus.CANCELLED]: 99,
};

/** Statut du Supply correspondant au statut du shipment */
export function supplyStatusFromShipment(status: ShipmentStatus | string | null | undefined): SupplyStatus | null {
  switch (status) {
    case ShipmentStatus.SHIPPING_IN_PROGRESS:
    case ShipmentStatus.TRANSIT:
      return SupplyStatus.IN_TRANSIT;
    case ShipmentStatus.ARRIVED_DESTINATION:
    case ShipmentStatus.READY_FOR_DELIVERY:
      return SupplyStatus.ARRIVED;
    case ShipmentStatus.DELIVERED:
    case ShipmentStatus.COLLECTED:
      return SupplyStatus.COMPLETED;
    default:
      return null;
  }
}

/**
 * Écrit l'historique des Supply.
 * Ne lève jamais d'erreur : un problème d'historique ne doit pas bloquer
 * une opération métier (shipment, LTA, stock…).
 */
@Injectable()
export class SupplyHistoryService {
  private readonly logger = new Logger(SupplyHistoryService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

  private mgr(manager?: EntityManager | null): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  /** Ajoute une ligne d'historique à un Supply */
  async record(supplyId: string, event: SupplyEventInput, manager?: EntityManager | null): Promise<void> {
    try {
      const m = this.mgr(manager);
      await m.insert(SupplyHistory, {
        supplyId,
        eventType: event.eventType,
        description: String(event.description || '').slice(0, 500),
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        orderId: event.orderId ?? null,
        shipmentId: event.shipmentId ?? null,
        ltaId: event.ltaId ?? null,
        branchId: event.branchId ?? null,
        location: event.location ? String(event.location).slice(0, 255) : null,
        payload: event.payload ?? null,
        performedById: event.performedById ?? null,
      });
    } catch (error: any) {
      this.logger.error(`Historique Supply ${supplyId} non enregistré : ${error?.message}`);
    }
  }

  /**
   * Fait avancer le statut d'un Supply (jamais en arrière, sauf annulation)
   * et l'enregistre dans l'historique. Retourne true si le statut a changé.
   */
  async advanceStatus(
    supply: Supply,
    to: SupplyStatus,
    description: string,
    manager?: EntityManager | null,
    extra: Partial<SupplyEventInput> = {},
  ): Promise<boolean> {
    try {
      const from = supply.status;
      if (from === to) return false;
      if (from === SupplyStatus.CANCELLED) return false;
      if (to !== SupplyStatus.CANCELLED && STATUS_RANK[to] < STATUS_RANK[from]) return false;

      const m = this.mgr(manager);
      const patch: Partial<Supply> = { status: to };
      const now = new Date();
      if (to === SupplyStatus.SHIPMENT_CREATED && !supply.shipmentCreatedAt) patch.shipmentCreatedAt = now;
      if (to === SupplyStatus.RECEIVED_AT_BRANCH && !supply.receivedAt) patch.receivedAt = now;
      if (to === SupplyStatus.COMPLETED && !supply.completedAt) patch.completedAt = now;
      if (to === SupplyStatus.CANCELLED) patch.cancelledAt = now;
      await m.update(Supply, { id: supply.id }, patch);
      supply.status = to;

      await this.record(
        supply.id,
        {
          eventType: SupplyEventType.SUPPLY_STATUS_CHANGED,
          description,
          fromStatus: from,
          toStatus: to,
          orderId: supply.orderId,
          shipmentId: supply.shipmentId ?? null,
          ...extra,
        },
        manager,
      );
      return true;
    } catch (error: any) {
      this.logger.error(`Statut du Supply ${supply?.id} non mis à jour : ${error?.message}`);
      return false;
    }
  }

  /** Supply liés à un shipment */
  async findByShipment(shipmentId: string, manager?: EntityManager | null): Promise<Supply[]> {
    try {
      return await this.mgr(manager).find(Supply, { where: { shipmentId } });
    } catch {
      return [];
    }
  }

  /** Supply liés à une commande */
  async findByOrder(orderId: string, manager?: EntityManager | null): Promise<Supply[]> {
    try {
      return await this.mgr(manager).find(Supply, { where: { orderId } });
    } catch {
      return [];
    }
  }

  /**
   * Enregistre un événement pour tous les Supply liés au shipment
   * (et fait avancer leur statut si `advanceTo` est fourni).
   */
  async recordForShipment(
    shipmentId: string,
    event: SupplyEventInput,
    manager?: EntityManager | null,
    advanceTo?: SupplyStatus | null,
  ): Promise<void> {
    const supplies = await this.findByShipment(shipmentId, manager);
    for (const supply of supplies) {
      await this.record(supply.id, { orderId: supply.orderId, shipmentId, ...event }, manager);
      if (advanceTo) {
        await this.advanceStatus(supply, advanceTo, event.description, manager, {
          shipmentId,
          branchId: event.branchId ?? null,
          ltaId: event.ltaId ?? null,
          performedById: event.performedById ?? null,
        });
      }
    }
  }
}
