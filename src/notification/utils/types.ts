// types/ride-notification.types.ts
import { Ride } from 'src/Course et Taxi/Ride/entity/Ride.entity';
import { RideStatus } from 'src/Course et Taxi/Ride/enum/RideStatus.enum';
import { UserEntity } from 'src/users/entities/user.entity';

export interface RideNotificationData {
  // Données de la course
  rideId?: string;
  ride?: Partial<Ride>;
  
  // Relations
  driver?: Partial<UserEntity>;
  rider?: Partial<UserEntity>;
  
  // Informations de localisation
  pickupLocation?: Ride['pickupLocation'];
  dropoffLocation?: Ride['dropoffLocation'];
  
  // Métriques (présentes dans votre entité Ride)
  distance?: number;
  duration?: number;
  price?: number;
  
  // Statut
  status?: RideStatus;
  cancelledBy?: 'RIDER' | 'DRIVER' | 'SYSTEM';
  cancellationReason?: string;
  
  // Informations supplémentaires
  driverName?: string;
  driverFullName?: string;
  riderName?: string;
  companyName?: string;

}