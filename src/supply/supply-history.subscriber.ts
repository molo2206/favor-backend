import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { LtaShipmentEntity } from 'src/shipment/Lta/entity/lta-shipment.entity';
import { TrackingltaEntity } from 'src/shipment/Lta/entity/tracking-lta.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { Supply } from './entities/supply.entity';
import { SupplyEventType, SupplyStatus } from './enums/supply.enum';
import { SupplyHistoryService, supplyStatusFromShipment } from './supply-history.service';

/**
 * ✅ Historique automatique du Supply, SANS modifier le code existant
 * des shipments, des LTA et des commandes :
 * on écoute la base (TypeORM) et on écrit l'historique quand
 *  - le statut d'un shipment change
 *  - une ligne de tracking shipment est ajoutée
 *  - un shipment est ajouté à une LTA
 *  - une étape de tracking LTA est ajoutée
 *  - le statut d'une commande / sous-commande change
 * Seuls les shipments et commandes liés à un Supply sont concernés.
 */
@Injectable()
export class SupplyHistorySubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(SupplyHistorySubscriber.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly history: SupplyHistoryService,
  ) {
    dataSource.subscribers.push(this);
  }

  async afterInsert(event: InsertEvent<any>): Promise<void> {
    try {
      const target = event.metadata?.target;
      const entity: any = event.entity;
      if (!entity) return;

      // ---------- Tracking d'un shipment ----------
      if (target === ShipmentTracking) {
        const shipmentId = entity.shipmentId ?? entity.shipment?.id;
        if (!shipmentId) return;
        const parts = [entity.status, entity.location, entity.comment].filter(Boolean);
        await this.history.recordForShipment(
          shipmentId,
          {
            eventType: SupplyEventType.SHIPMENT_TRACKING,
            description: `Tracking : ${parts.join(' — ') || '-'}`,
            toStatus: entity.status ?? null,
            location: entity.location ?? null,
            payload: { trackingId: entity.id, comment: entity.comment ?? null },
          },
          event.manager,
          supplyStatusFromShipment(entity.status),
        );
        return;
      }

      // ---------- Shipment ajouté à une LTA ----------
      if (target === LtaShipmentEntity) {
        const shipmentId = entity.shipmentId ?? entity.shipment?.id;
        const ltaId = entity.ltaId ?? entity.lta?.id;
        if (!shipmentId || !ltaId) return;
        const lta = await event.manager.findOne(LtaEntity, { where: { id: ltaId } });
        await this.history.recordForShipment(
          shipmentId,
          {
            eventType: SupplyEventType.ADDED_TO_LTA,
            description: `Ajouté à la LTA ${lta?.ltaNumber ?? ltaId}${lta ? ` (${lta.origin} → ${lta.destination})` : ''}`,
            ltaId,
            payload: { ltaNumber: lta?.ltaNumber ?? null, isMaster: !!entity.isMaster },
          },
          event.manager,
        );
        return;
      }

      // ---------- Étape de tracking d'une LTA ----------
      if (target === TrackingltaEntity) {
        const ltaId = entity.ltaId ?? entity.lta?.id;
        if (!ltaId) return;
        const lta = await event.manager.findOne(LtaEntity, { where: { id: ltaId } });
        const links = await event.manager.find(LtaShipmentEntity, { where: { ltaId } });
        for (const link of links) {
          await this.history.recordForShipment(
            link.shipmentId,
            {
              eventType: SupplyEventType.LTA_TRACKING,
              description: `LTA ${lta?.ltaNumber ?? ''} : ${entity.name} (${entity.type})${entity.completed ? ' ✔' : ''}`,
              ltaId,
              location: entity.name ?? null,
              payload: { trackingLtaId: entity.id, type: entity.type, time: entity.time ?? null, completed: !!entity.completed },
            },
            event.manager,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(`afterInsert (historique Supply) : ${error?.message}`);
    }
  }

  async afterUpdate(event: UpdateEvent<any>): Promise<void> {
    try {
      const target = event.metadata?.target;
      const entity: any = event.entity;
      const before: any = event.databaseEntity;
      if (!entity || !before) return;

      // ---------- Statut d'un shipment ----------
      if (target === Shipment) {
        if (!entity.status || entity.status === before.status) return;
        const shipmentId = entity.id ?? before.id;
        await this.history.recordForShipment(
          shipmentId,
          {
            eventType: SupplyEventType.SHIPMENT_STATUS_CHANGED,
            description: `Shipment ${before.trackingNumber ?? ''} : ${before.status} → ${entity.status}`,
            fromStatus: before.status,
            toStatus: entity.status,
          },
          event.manager,
          supplyStatusFromShipment(entity.status),
        );
        return;
      }

      // ---------- Statut d'une commande ----------
      if (target === OrderEntity) {
        if (!entity.status || entity.status === before.status) return;
        const orderId = entity.id ?? before.id;
        const supplies = await event.manager.find(Supply, { where: { orderId } });
        for (const supply of supplies) {
          await this.history.record(
            supply.id,
            {
              eventType: SupplyEventType.ORDER_STATUS_CHANGED,
              description: `Commande ${before.invoiceNumber ?? ''} : ${before.status} → ${entity.status}`,
              fromStatus: before.status,
              toStatus: entity.status,
              orderId,
            },
            event.manager,
          );
          await this.cancelIfOrderRejected(supply, entity.status, event);
        }
        return;
      }

      // ---------- Statut d'une sous-commande (partie d'un vendeur) ----------
      if (target === SubOrderEntity) {
        if (!entity.status || entity.status === before.status) return;
        const subOrderId = entity.id ?? before.id;
        const supplies = await event.manager.find(Supply, { where: { subOrderId } });
        for (const supply of supplies) {
          await this.history.record(
            supply.id,
            {
              eventType: SupplyEventType.ORDER_STATUS_CHANGED,
              description: `Sous-commande : ${before.status} → ${entity.status}`,
              fromStatus: before.status,
              toStatus: entity.status,
              orderId: supply.orderId,
            },
            event.manager,
          );
          if (entity.status === OrderStatus.PROCESSING) {
            await this.history.advanceStatus(supply, SupplyStatus.PREPARING, 'Préparation par le vendeur', event.manager);
          }
          await this.cancelIfOrderRejected(supply, entity.status, event);
        }
      }
    } catch (error: any) {
      this.logger.error(`afterUpdate (historique Supply) : ${error?.message}`);
    }
  }

  /** Commande rejetée avant expédition → Supply annulé */
  private async cancelIfOrderRejected(supply: Supply, status: string, event: UpdateEvent<any>) {
    if (status !== OrderStatus.REJECTED) return;
    if (supply.shipmentId) return; // déjà expédié : on garde la trace, sans annuler
    await this.history.advanceStatus(supply, SupplyStatus.CANCELLED, 'Commande rejetée', event.manager);
  }
}
