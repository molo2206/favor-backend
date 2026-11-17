import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from '../google-maps/google-maps.service';

type LatLng = { lat: number; lng: number };

export type NavLeg = 'PICKUP' | 'DROPOFF';

export interface NavStep {
  instruction: string;
  maneuver: string | null;
  distanceM: number | null;
  durationSec: number | null;
  startLocation: LatLng | null;
  endLocation: LatLng | null;
}

export interface NavResult {
  leg: NavLeg;
  polyline: string | null;
  distanceM: number | null;
  durationSec: number | null;
  steps: NavStep[];
  destination: { lat: number; lng: number; address: string | null };
}

/**
 * ✅ Section 4 — Itinéraire détaillé pour l'application chauffeur.
 *
 * Calcule, via Google Directions (mode driving, language=fr, region=cd), l'itinéraire
 * et les instructions virage par virage, en texte brut (sans HTML), pour le trajet
 * PICKUP (position → prise en charge) ou DROPOFF (position → destination).
 *
 * Cache en mémoire par course + trajet ; recalcul seulement si le point de départ
 * s'écarte de plus de 50 m du dernier calcul.
 */
@Injectable()
export class RideNavigationService {
  private readonly logger = new Logger(RideNavigationService.name);
  private readonly cache = new Map<string, { from: LatLng; result: NavResult; at: number }>();

  constructor(private readonly maps: GoogleService) {}

  private num(key: string, def: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }
  /** Écart (m) au-delà duquel on recalcule l'itinéraire */
  private get deviationM(): number {
    return this.num('RIDE_NAV_DEVIATION_M', 50);
  }
  /** Durée de vie du cache (s) */
  private get ttlSec(): number {
    return this.num('RIDE_NAV_CACHE_SEC', 120);
  }

  private valid(p: any): p is LatLng {
    return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  }

  private haversineM(a: LatLng, b: LatLng): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Enlève le HTML des instructions Google (balises + entités simples) */
  private stripHtml(s: string | undefined | null): string {
    if (!s) return '';
    return String(s)
      .replace(/<div[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parse(leg: NavLeg, data: any, destination: { lat: number; lng: number; address: string | null }): NavResult {
    const route = data?.routes?.[0];
    const gLeg = route?.legs?.[0];
    const steps: NavStep[] = Array.isArray(gLeg?.steps)
      ? gLeg.steps.map((st: any) => ({
          instruction: this.stripHtml(st?.html_instructions),
          maneuver: st?.maneuver ?? null,
          distanceM: Number(st?.distance?.value) || null,
          durationSec: Number(st?.duration?.value) || null,
          startLocation: st?.start_location
            ? { lat: Number(st.start_location.lat), lng: Number(st.start_location.lng) }
            : null,
          endLocation: st?.end_location
            ? { lat: Number(st.end_location.lat), lng: Number(st.end_location.lng) }
            : null,
        }))
      : [];
    return {
      leg,
      polyline: route?.overview_polyline?.points ?? null,
      distanceM: Number(gLeg?.distance?.value) || null,
      durationSec: Number(gLeg?.duration_in_traffic?.value ?? gLeg?.duration?.value) || null,
      steps,
      destination: {
        lat: destination.lat,
        lng: destination.lng,
        address: gLeg?.end_address ?? destination.address ?? null,
      },
    };
  }

  /**
   * Itinéraire détaillé d'un trajet. `from` par défaut = dernière position connue
   * (fournie par l'appelant). Cache par course + trajet, recalcul si écart > 50 m.
   */
  async getNavigation(
    rideId: string,
    leg: NavLeg,
    from: LatLng,
    destination: { lat: number; lng: number; address?: string | null },
  ): Promise<NavResult> {
    const dest: { lat: number; lng: number; address: string | null } = {
      lat: Number(destination.lat),
      lng: Number(destination.lng),
      address: destination.address ?? null,
    };
    const key = `${rideId}:${leg}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.at < this.ttlSec * 1000 && this.haversineM(cached.from, from) <= this.deviationM) {
      return cached.result;
    }
    try {
      const data: any = await this.maps.getDirections(
        `${from.lat},${from.lng}`,
        `${dest.lat},${dest.lng}`,
        false,
        { mode: 'driving', language: 'fr', region: 'cd' },
      );
      const result = this.parse(leg, data, dest);
      this.cache.set(key, { from: { lat: from.lat, lng: from.lng }, result, at: now });
      return result;
    } catch (e: any) {
      this.logger.warn(`getNavigation ${key}: ${e?.message}`);
      // Repli minimal : pas d'étapes, juste la destination
      return { leg, polyline: null, distanceM: null, durationSec: null, steps: [], destination: dest };
    }
  }

  /** Invalide le cache d'une course (après change-route / extend / fin) */
  clear(rideId: string): void {
    this.cache.delete(`${rideId}:PICKUP`);
    this.cache.delete(`${rideId}:DROPOFF`);
  }

  isValidLatLng(p: any): p is LatLng {
    return this.valid(p);
  }
}
