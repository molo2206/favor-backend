import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RideEvent } from './entity/RideEvent.entity';
import { RideEventType } from './enum/ride-event.enum';

export interface RideEventInput {
  type: RideEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  lat?: number | null;
  lng?: number | null;
  payload?: Record<string, any> | null;
}

/** Historique des courses (table ride_events) — ne lève jamais d'erreur */
@Injectable()
export class RideHistoryService {
  private readonly logger = new Logger(RideHistoryService.name);

  constructor(
    @InjectRepository(RideEvent)
    private readonly eventRepo: Repository<RideEvent>,
  ) { }

  async record(rideId: string, event: RideEventInput, manager?: EntityManager): Promise<void> {
    try {
      const repo = manager ? manager.getRepository(RideEvent) : this.eventRepo;
      await repo.insert({
        rideId,
        type: event.type,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        actorId: event.actorId ?? null,
        actorRole: event.actorRole ?? null,
        lat: event.lat ?? null,
        lng: event.lng ?? null,
        payload: event.payload ?? null,
      });
    } catch (e: any) {
      this.logger.warn(`Historique course ${rideId} non enregistré (${event.type}): ${e?.message}`);
    }
  }

  list(rideId: string): Promise<RideEvent[]> {
    return this.eventRepo.find({ where: { rideId }, order: { createdAt: 'ASC' } });
  }
}
