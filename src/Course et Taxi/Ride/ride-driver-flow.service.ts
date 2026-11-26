import { Injectable } from '@nestjs/common';
import { haversineKm } from './ride-dispatch.service';
import { RideStatus } from './enum/RideStatus.enum';
import { RidePaymentMethod, RidePaymentStatus, RIDE_ONLINE_PAYMENT_METHODS } from './enum/ride-event.enum';

type LatLng = { lat: number; lng: number };

/** Étapes du parcours chauffeur (clés stables, libellées côté application) */
export type DriverStepKey =
  | 'GO_TO_PICKUP'
  | 'ARRIVE'
  | 'WAIT_RIDER'
  | 'START_RIDE'
  | 'GO_TO_DROPOFF'
  | 'COMPLETE'
  | 'COLLECT_PAYMENT';

const STEP_ORDER: DriverStepKey[] = [
  'GO_TO_PICKUP',
  'ARRIVE',
  'WAIT_RIDER',
  'START_RIDE',
  'GO_TO_DROPOFF',
  'COMPLETE',
  'COLLECT_PAYMENT',
];

/** Étape « en cours » selon le statut de la course */
const CURRENT_STEP_BY_STATUS: Partial<Record<RideStatus, DriverStepKey>> = {
  [RideStatus.ACCEPTED]: 'GO_TO_PICKUP',
  [RideStatus.ARRIVED]: 'WAIT_RIDER',
  [RideStatus.IN_PROGRESS]: 'GO_TO_DROPOFF',
  [RideStatus.COMPLETED]: 'COLLECT_PAYMENT',
};

export interface DriverFlowStep {
  key: DriverStepKey;
  status: 'done' | 'current' | 'todo';
}

export interface DriverFlow {
  currentStep: DriverStepKey | null;
  steps: DriverFlowStep[];
  allowedActions: string[];
  primaryAction: string | null;
  hints: Record<string, any>;
}

export interface BuildDriverFlowOptions {
  /** Position actuelle du chauffeur (pour activer/désactiver « Je suis arrivé » / « Terminer ») */
  driverPos?: LatLng | null;
  /** Attente (après ARRIVED) : temps gratuit et prix par minute (du tarif de la catégorie) */
  freeWaitingSec?: number | null;
  waitingFeePerMin?: number | null;
}

/**
 * ✅ Section 3 — Parcours du chauffeur.
 *
 * Construit `driverFlow` (étape en cours, liste des étapes, action principale, indices)
 * pour toutes les charges utiles destinées au chauffeur, et porte les règles de
 * géorepérage (« Je suis arrivé » < 150 m, « Terminer » < 300 m).
 */
@Injectable()
export class RideDriverFlowService {
  private num(key: string, def: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }
  /** Rayon d'activation de « Je suis arrivé » (m) */
  get arriveRadiusM(): number {
    return this.num('RIDE_ARRIVE_RADIUS_M', 150);
  }
  /** Rayon d'activation de « Terminer » (m) */
  get completeRadiusM(): number {
    return this.num('RIDE_COMPLETE_RADIUS_M', 300);
  }
  /** Temps d'attente gratuit par défaut (s) si le tarif ne le précise pas */
  get defaultFreeWaitingSec(): number {
    return this.num('RIDE_FREE_WAITING_SEC', 180);
  }

  private valid(p: any): p is LatLng {
    return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  }

  private distanceM(a: any, b: any): number | null {
    if (!this.valid(a) || !this.valid(b)) return null;
    return Math.round(haversineKm({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) }) * 1000);
  }

  // ---- Géorepérage ----

  /** « Je suis arrivé » autorisé sans motif ? (< 150 m du point de prise en charge) */
  canArrive(ride: { pickupLocation?: any }, driverPos?: any): { within: boolean; distanceM: number | null } {
    const d = this.distanceM(driverPos, ride.pickupLocation);
    return { within: d != null && d <= this.arriveRadiusM, distanceM: d };
  }

  /** « Terminer » autorisé sans motif ? (< 300 m de la destination) */
  canComplete(ride: { dropoffLocation?: any }, driverPos?: any): { within: boolean; distanceM: number | null } {
    const d = this.distanceM(driverPos, ride.dropoffLocation);
    return { within: d != null && d <= this.completeRadiusM, distanceM: d };
  }

  // ---- Attente ----

  /** Secondes d'attente facturées + montant, au moment du départ */
  computeWaiting(
    waitingStartedAt: Date | null | undefined,
    freeWaitingSec: number | null | undefined,
    waitingFeePerMin: number | null | undefined,
    now: number = Date.now(),
  ): { chargedSec: number; amount: number } {
    if (!waitingStartedAt) return { chargedSec: 0, amount: 0 };
    const free = Number(freeWaitingSec ?? this.defaultFreeWaitingSec);
    const perMin = Number(waitingFeePerMin ?? 0);
    const waited = Math.max(0, Math.round((now - new Date(waitingStartedAt).getTime()) / 1000));
    const chargedSec = Math.max(0, waited - free);
    const amount = perMin > 0 ? Math.round((chargedSec / 60) * perMin * 100) / 100 : 0;
    return { chargedSec, amount };
  }

  // ---- driverFlow ----

  private steps(current: DriverStepKey | null): DriverFlowStep[] {
    const idx = current ? STEP_ORDER.indexOf(current) : STEP_ORDER.length;
    return STEP_ORDER.map((key, i) => ({
      key,
      status: current == null ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo',
    }));
  }

  /** Message d'encaissement à l'étape COLLECT_PAYMENT */
  private collectHint(ride: {
    paymentMethod?: string | null;
    paymentStatus?: string | null;
    totalToPay?: any;
    finalPrice?: any;
    currency?: string | null;
  }): Record<string, any> {
    const method = ride.paymentMethod ?? RidePaymentMethod.CASH;
    const paid = ride.paymentStatus === RidePaymentStatus.PAID;
    const amount = ride.totalToPay != null ? Number(ride.totalToPay) : ride.finalPrice != null ? Number(ride.finalPrice) : null;
    const online = RIDE_ONLINE_PAYMENT_METHODS.includes(method);
    return {
      paymentMethod: method,
      paymentStatus: ride.paymentStatus ?? RidePaymentStatus.PENDING,
      currency: ride.currency ?? null,
      // Espèces / carte → montant à encaisser ; en ligne et déjà payé → rien à encaisser
      collectCash: method === RidePaymentMethod.CASH && !paid,
      amountToCollect: method === RidePaymentMethod.CASH && !paid ? amount : 0,
      alreadyPaid: paid || (online && paid),
    };
  }

  /**
   * Construit l'objet driverFlow pour une course assignée à un chauffeur.
   * Renvoie null si la course n'est pas (ou plus) dans une étape chauffeur.
   */
  build(
    ride: {
      status: RideStatus;
      pickupLocation?: any;
      dropoffLocation?: any;
      waitingStartedAt?: Date | null;
      paymentMethod?: string | null;
      paymentStatus?: string | null;
      totalToPay?: any;
      finalPrice?: any;
      currency?: string | null;
    },
    opts: BuildDriverFlowOptions = {},
  ): DriverFlow | null {
    const current = CURRENT_STEP_BY_STATUS[ride.status] ?? null;
    if (!current) return null;

    const steps = this.steps(current);
    let allowedActions: string[] = [];
    let primaryAction: string | null = null;
    const hints: Record<string, any> = {};

    switch (ride.status) {
      case RideStatus.ACCEPTED: {
        const g = this.canArrive(ride, opts.driverPos);
        allowedActions = ['ARRIVED', 'NAVIGATE', 'CALL_RIDER', 'CHAT', 'CANCEL'];
        primaryAction = 'ARRIVED';
        hints.arrivedEnabled = g.within;
        hints.arrivedDistanceM = g.distanceM;
        hints.arriveRadiusM = this.arriveRadiusM;
        // Hors zone : « Je suis arrivé » accepté mais avec un motif obligatoire
        hints.arrivedRequiresReason = !g.within;
        break;
      }
      case RideStatus.ARRIVED: {
        const waiting = this.computeWaiting(ride.waitingStartedAt, opts.freeWaitingSec, opts.waitingFeePerMin);
        allowedActions = ['START_RIDE', 'NAVIGATE', 'CALL_RIDER', 'CHAT', 'CANCEL'];
        primaryAction = 'START_RIDE';
        hints.waitingStartedAt = ride.waitingStartedAt ?? null;
        hints.freeWaitingSec = Number(opts.freeWaitingSec ?? this.defaultFreeWaitingSec);
        hints.waitingFeePerMin = Number(opts.waitingFeePerMin ?? 0);
        hints.waitingChargedSec = waiting.chargedSec;
        hints.waitingFeeSoFar = waiting.amount;
        break;
      }
      case RideStatus.IN_PROGRESS: {
        const g = this.canComplete(ride, opts.driverPos);
        allowedActions = ['COMPLETE', 'NAVIGATE', 'CALL_RIDER', 'CHAT'];
        primaryAction = 'COMPLETE';
        hints.completeEnabled = g.within;
        hints.completeDistanceM = g.distanceM;
        hints.completeRadiusM = this.completeRadiusM;
        hints.completeRequiresReason = !g.within;
        break;
      }
      case RideStatus.COMPLETED: {
        const c = this.collectHint(ride);
        allowedActions = c.collectCash ? ['COLLECT_PAYMENT', 'CALL_RIDER'] : ['CALL_RIDER'];
        primaryAction = c.collectCash ? 'COLLECT_PAYMENT' : null;
        Object.assign(hints, c);
        break;
      }
    }

    return { currentStep: current, steps, allowedActions, primaryAction, hints };
  }
}
