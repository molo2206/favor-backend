import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from '../google-maps/google-maps.service';
import { RideRealtimeService } from './ride-realtime.service';
import { RideSocketEvents } from './enum/ride-event.enum';
import { haversineKm } from './ride-dispatch.service';
import { NotificationType } from 'src/notification/type/notification.type';

type LatLng = { lat: number; lng: number };

/** Source de l'ETA renvoyée au passager */
export type EtaSource = 'ROAD' | 'STRAIGHT';

/** État d'approche conservé en mémoire pour une course (chauffeur → point de prise en charge) */
interface ApproachState {
  /** Polyline Google encodée du dernier itinéraire chauffeur → prise en charge */
  polyline: string | null;
  /** Distance route (m) au moment du dernier calcul Directions */
  roadDistanceM0: number;
  /** Durée route (s) au moment du dernier calcul Directions (trafic si dispo) */
  roadDurationSec0: number;
  /** Distance à vol d'oiseau (km) au moment du dernier calcul Directions */
  straightKm0: number;
  /** Timestamp (ms) du dernier calcul Directions */
  computedAt: number;
  /** Dernière distance à vol d'oiseau connue (km) — pour détecter l'éloignement */
  lastStraightKm: number;
  /** Notification « chauffeur tout proche » déjà envoyée ? (une seule fois) */
  nearbyNotified: boolean;
  /** Dernière position connue du chauffeur + horodatage (pour stale + reconnexion) */
  lastPos: { lat: number; lng: number; at: number } | null;
}

/**
 * ✅ Section 2 — Approche du chauffeur vers le passager.
 *
 * Après l'acceptation, enrichit le suivi avec l'itinéraire réel (Google Directions) :
 *  - itinéraire chauffeur → prise en charge dans `ride:accepted`
 *    (approachPolyline / approachDistanceM / approachDurationSec) ;
 *  - ETA sur route dans `ride:driver-location` (remainingM / etaSec / etaSource),
 *    décroissant au prorata entre deux recalculs ;
 *  - recalcul périodique (30–60 s) ou dès que le chauffeur s'éloigne,
 *    diffusé via `ride:route-updated` leg "PICKUP" ;
 *  - `ride:driver-nearby` (+ push) une seule fois sous le seuil (300 m) ;
 *  - reconnexion : dernière position + polyline + ETA + stale.
 *
 * Tout l'état est en mémoire (rien en base). Si Google échoue, on retombe
 * proprement sur le vol d'oiseau : le suivi n'est jamais bloqué.
 */
@Injectable()
export class RideApproachService {
  private readonly logger = new Logger(RideApproachService.name);
  private readonly store = new Map<string, ApproachState>();

  constructor(
    private readonly maps: GoogleService,
    private readonly realtime: RideRealtimeService,
  ) {}

  // ---- Paramètres (configurables par variables d'environnement) ----
  private num(key: string, def: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }
  /** Intervalle de recalcul Directions pendant l'approche (s) */
  private get recalcSec(): number {
    return this.num('RIDE_APPROACH_RECALC_SEC', 45);
  }
  /** Seuil « chauffeur tout proche » (m) */
  private get nearbyM(): number {
    return this.num('RIDE_DRIVER_NEARBY_M', 300);
  }
  /** Éloignement (km) au-delà duquel on force un recalcul d'itinéraire */
  private get deviationKm(): number {
    return this.num('RIDE_APPROACH_DEVIATION_M', 50) / 1000;
  }
  /** Position périmée au-delà de (s) */
  private get staleSeconds(): number {
    return this.num('RIDE_STALE_SECONDS', 30);
  }
  private get avgSpeed(): number {
    return this.num('RIDE_AVG_SPEED_KMH', 25);
  }
  private get roadFactor(): number {
    return this.num('RIDE_ROAD_FACTOR', 1.3);
  }

  /** ETA à vol d'oiseau (s) — repli quand Google n'est pas disponible */
  private straightSec(km: number): number {
    return Math.max(60, Math.round((km / this.avgSpeed) * 3600 * this.roadFactor));
  }

  private valid(p: any): p is LatLng {
    return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  }

  /** Appel Google Directions, forme normalisée + tolérante aux pannes */
  private async directions(from: LatLng, to: LatLng): Promise<{ polyline: string | null; distanceM: number | null; durationSec: number | null }> {
    const data: any = await this.maps.getDirections(
      `${from.lat},${from.lng}`,
      `${to.lat},${to.lng}`,
      false,
      { mode: 'driving', language: 'fr', region: 'cd' },
    );
    const route = data?.routes?.[0];
    const leg = route?.legs?.[0];
    return {
      polyline: route?.overview_polyline?.points ?? null,
      distanceM: Number(leg?.distance?.value) || null,
      durationSec: Number(leg?.duration_in_traffic?.value ?? leg?.duration?.value) || null,
    };
  }

  /**
   * À l'acceptation : calcule l'itinéraire chauffeur → point de prise en charge.
   * Renvoie les champs à injecter dans la charge utile `ride:accepted`.
   * Ne jette jamais : en cas d'échec, renvoie {} et le suivi reste en vol d'oiseau.
   */
  async onAccepted(rideId: string, driverPos: any, pickup: any): Promise<{ approachPolyline?: string | null; approachDistanceM?: number | null; approachDurationSec?: number | null }> {
    if (!this.valid(driverPos) || !this.valid(pickup)) return {};
    const from = { lat: Number(driverPos.lat), lng: Number(driverPos.lng) };
    const to = { lat: Number(pickup.lat), lng: Number(pickup.lng) };
    const straightKm0 = haversineKm(from, to);
    try {
      const d = await this.directions(from, to);
      this.store.set(rideId, {
        polyline: d.polyline,
        roadDistanceM0: d.distanceM ?? Math.round(straightKm0 * 1000),
        roadDurationSec0: d.durationSec ?? this.straightSec(straightKm0),
        straightKm0,
        computedAt: Date.now(),
        lastStraightKm: straightKm0,
        nearbyNotified: straightKm0 * 1000 <= this.nearbyM, // déjà tout proche → pas de notif tardive
        lastPos: { lat: from.lat, lng: from.lng, at: Date.now() },
      });
      return {
        approachPolyline: d.polyline,
        approachDistanceM: d.distanceM,
        approachDurationSec: d.durationSec,
      };
    } catch (e: any) {
      this.logger.warn(`onAccepted directions (${rideId}): ${e?.message}`);
      // On mémorise quand même un état vol-d'oiseau, pour un suivi cohérent
      this.store.set(rideId, {
        polyline: null,
        roadDistanceM0: Math.round(straightKm0 * 1000),
        roadDurationSec0: this.straightSec(straightKm0),
        straightKm0,
        computedAt: Date.now(),
        lastStraightKm: straightKm0,
        nearbyNotified: straightKm0 * 1000 <= this.nearbyM,
        lastPos: { lat: from.lat, lng: from.lng, at: Date.now() },
      });
      return {};
    }
  }

  /**
   * Dans le flux de position (course ACCEPTED, le chauffeur approche) :
   * renvoie l'ETA sur route pour `ride:driver-location`, déclenche le recalcul
   * d'itinéraire si besoin et la notification « chauffeur tout proche ».
   *
   * @param straightKm distance à vol d'oiseau chauffeur → prise en charge (déjà calculée par l'appelant)
   */
  async enrich(
    ride: { id: string; riderId: string; driverId?: string | null; pickupLocation?: any },
    pos: LatLng,
    straightKm: number,
  ): Promise<{ remainingM: number; etaSec: number; etaSource: EtaSource }> {
    const now = Date.now();
    let state = this.store.get(ride.id);

    // Pas d'état (redéploiement, acceptation sans position) → vol d'oiseau
    if (!state) {
      return {
        remainingM: Math.round(straightKm * 1000),
        etaSec: this.straightSec(straightKm),
        etaSource: 'STRAIGHT',
      };
    }

    state.lastPos = { lat: pos.lat, lng: pos.lng, at: now };

    // Déclencheurs de recalcul : temps écoulé OU le chauffeur s'éloigne du point
    const movingAway = straightKm > state.lastStraightKm + this.deviationKm;
    state.lastStraightKm = straightKm;
    const timeDue = now - state.computedAt > this.recalcSec * 1000;
    if ((timeDue || movingAway) && this.valid(ride.pickupLocation)) {
      await this.recalc(ride, pos, straightKm);
      state = this.store.get(ride.id)!;
    }

    // ETA sur route, décroissance au prorata de la distance restante à vol d'oiseau
    let remainingM: number;
    let etaSec: number;
    let etaSource: EtaSource;
    if (state.straightKm0 > 0 && state.roadDistanceM0 > 0) {
      const frac = Math.min(1, Math.max(0, straightKm / state.straightKm0));
      remainingM = Math.round(state.roadDistanceM0 * frac);
      etaSec = Math.round(state.roadDurationSec0 * frac);
      etaSource = 'ROAD';
    } else {
      remainingM = Math.round(straightKm * 1000);
      etaSec = this.straightSec(straightKm);
      etaSource = 'STRAIGHT';
    }

    // Chauffeur tout proche : une seule fois
    if (!state.nearbyNotified && remainingM <= this.nearbyM) {
      state.nearbyNotified = true;
      this.notifyNearby(ride, remainingM, etaSec);
    }

    return { remainingM, etaSec, etaSource };
  }

  /** Recalcule l'itinéraire d'approche et diffuse ride:route-updated (leg PICKUP) */
  private async recalc(ride: { id: string; pickupLocation?: any }, pos: LatLng, straightKm: number): Promise<void> {
    const state = this.store.get(ride.id);
    if (!state) return;
    try {
      const pickup = { lat: Number(ride.pickupLocation.lat), lng: Number(ride.pickupLocation.lng) };
      const d = await this.directions(pos, pickup);
      state.polyline = d.polyline ?? state.polyline;
      state.roadDistanceM0 = d.distanceM ?? Math.round(straightKm * 1000);
      state.roadDurationSec0 = d.durationSec ?? this.straightSec(straightKm);
      state.straightKm0 = straightKm;
      state.computedAt = Date.now();
      this.realtime.emitToRide(ride.id, RideSocketEvents.ROUTE_UPDATED, {
        rideId: ride.id,
        leg: 'PICKUP',
        polyline: state.polyline,
        distanceM: state.roadDistanceM0,
        durationSec: state.roadDurationSec0,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      // On garde l'itinéraire précédent et on repousse le prochain essai
      state.computedAt = Date.now();
      this.logger.warn(`recalc approche (${ride.id}): ${e?.message}`);
    }
  }

  /** Événement + push « Votre chauffeur arrive dans 1 minute » (une seule fois) */
  private notifyNearby(ride: { id: string; riderId: string }, remainingM: number, etaSec: number): void {
    try {
      this.realtime.emitToRide(ride.id, RideSocketEvents.DRIVER_NEARBY, {
        rideId: ride.id,
        remainingM,
        etaSec,
        timestamp: new Date().toISOString(),
      });
      void this.realtime.notify({
        userIds: [ride.riderId],
        audience: 'rider',
        key: 'driver_nearby',
        params: { minutes: Math.max(1, Math.round(etaSec / 60)) },
        type: NotificationType.RIDE_DRIVER_ARRIVED,
        rideId: ride.id,
        event: RideSocketEvents.DRIVER_NEARBY,
        payload: { rideId: ride.id, remainingM, etaSec },
        push: 'always',
        save: false,
      });
    } catch (e: any) {
      this.logger.warn(`notifyNearby (${ride.id}): ${e?.message}`);
    }
  }

  /**
   * Pour la reconnexion (ride:state / GET /rides/active) :
   * dernière position connue du chauffeur, polyline d'approche, ETA et stale.
   */
  lastState(rideId: string): {
    approachPolyline: string | null;
    approachDistanceM: number;
    approachDurationSec: number;
    lastDriverLocation: { lat: number; lng: number; at: string } | null;
    stale: boolean;
  } | null {
    const s = this.store.get(rideId);
    if (!s) return null;
    const stale = s.lastPos ? Date.now() - s.lastPos.at > this.staleSeconds * 1000 : false;
    return {
      approachPolyline: s.polyline,
      approachDistanceM: s.roadDistanceM0,
      approachDurationSec: s.roadDurationSec0,
      lastDriverLocation: s.lastPos
        ? { lat: s.lastPos.lat, lng: s.lastPos.lng, at: new Date(s.lastPos.at).toISOString() }
        : null,
      stale,
    };
  }

  /** Vrai si aucune position chauffeur depuis plus de staleSeconds */
  isStale(rideId: string): boolean {
    const s = this.store.get(rideId);
    if (!s || !s.lastPos) return false;
    return Date.now() - s.lastPos.at > this.staleSeconds * 1000;
  }

  /** Libère l'état (course démarrée / terminée / annulée) */
  clear(rideId: string): void {
    this.store.delete(rideId);
  }
}
