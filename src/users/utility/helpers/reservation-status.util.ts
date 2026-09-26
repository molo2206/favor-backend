// utils/reservation-status.util.ts

import { ReservationStatus } from 'src/HotelRoomAvailability/enum/reservation-room.enum';

export function isValidReservationStatusTransition(
  current: ReservationStatus,
  next: ReservationStatus,
): boolean {
  const transitions: Record<ReservationStatus, ReservationStatus[]> = {
    [ReservationStatus.PENDING]: [ReservationStatus.CONFIRMED, ReservationStatus.REJECTED],
    [ReservationStatus.CONFIRMED]: [],
    [ReservationStatus.REJECTED]: [],
    [ReservationStatus.RESERVED]: [],
    [ReservationStatus.CANCELLED]: [],
    [ReservationStatus.EXPIRED]: [],
    [ReservationStatus.CHECKED_IN]: [],
    [ReservationStatus.CHECKED_OUT]: [],
  };

  return transitions[current]?.includes(next) ?? false;
}
