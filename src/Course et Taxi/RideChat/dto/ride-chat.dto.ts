import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);
/** multipart/form-data : "12.5" → 12.5 ; "" → absent */
const toNum = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));
const toBool = ({ value }: { value: any }) => (value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value);

/** ✅ Message texte */
export class SendRideChatTextDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  /** Identifiant unique généré par l'application (renvoi sans doublon) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;

  /** ✅ Répondre à un message de la même course */
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}

/** ✅ Message vocal (multipart/form-data : champ fichier « audio ») */
export class SendRideChatAudioDto {
  /** Durée en secondes mesurée par l'application (utilisée si le serveur ne peut pas la lire) */
  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(0)
  @Max(3600)
  duration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;

  /** ✅ Répondre à un message de la même course (multipart : champ texte) */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  replyToId?: string;
}

/** ✅ Suppression d'un message par un participant */
export class DeleteRideChatMessageQueryDto {
  /**
   * true (défaut) : supprimer POUR TOUS (seulement son propre message, dans le délai RIDE_CHAT_DELETE_MINUTES) ;
   * false : supprimer POUR MOI (n'importe quel message de la conversation, sans délai).
   * Dans les deux cas l'administration voit toujours le message.
   */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  forEveryone?: boolean;
}

/** ✅ Messages d'une conversation (pagination par curseur : plus anciens que `before`) */
export class RideChatMessagesQueryDto {
  /** Date ISO : messages envoyés AVANT cette date (charger l'historique en remontant) */
  @IsOptional()
  @IsDateString()
  before?: string;

  /** Date ISO : messages envoyés APRÈS cette date (rattrapage après une coupure) */
  @IsOptional()
  @IsDateString()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** ✅ Mes conversations (passager ou chauffeur) */
export class MyRideChatsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

// ============================================================
// ADMINISTRATION : historique des conversations
// ============================================================

export class AdminRideChatConversationsQueryDto {
  /** Nom / téléphone / email du passager ou du chauffeur, identifiant de course, texte d'un message */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  rideId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  riderId?: string;

  /** Statut de la course */
  @IsOptional()
  @IsIn(['PENDING', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;

  /** Conversations contenant au moins un message vocal */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hasAudio?: boolean;

  /** Conversations contenant au moins un message supprimé */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hasDeleted?: boolean;

  /** Dernier message entre ces dates (ISO) */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminRideChatMessagesQueryDto {
  @IsOptional()
  @IsIn(['TEXT', 'AUDIO'])
  type?: 'TEXT' | 'AUDIO';

  /** true (défaut) : messages supprimés inclus ; false : masqués */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AdminRideChatStatsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** ✅ Modération : masquer un message aux participants */
export class AdminDeleteRideChatMessageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}


// ============================================================
// ✅ SÉCURITÉ DU CHAT : signalement + blocage (exigence Apple 1.2)
// ============================================================

export const RIDE_CHAT_REPORT_REASONS = ['HARASSMENT', 'HATE', 'SEXUAL', 'THREAT', 'SPAM', 'SCAM', 'OTHER'] as const;
export const RIDE_CHAT_REPORT_STATUSES = ['PENDING', 'REVIEWED', 'ACTION_TAKEN', 'DISMISSED'] as const;

/** ✅ Signaler un message (messageId) ou l'autre participant de la course (sans messageId) */
export class ReportRideChatDto {
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @IsIn(RIDE_CHAT_REPORT_REASONS as unknown as string[])
  reason: (typeof RIDE_CHAT_REPORT_REASONS)[number];

  /** Obligatoire pour OTHER */
  @ValidateIf((o) => o.reason === 'OTHER' || (o.details !== undefined && o.details !== null && o.details !== ''))
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  details?: string;

  /** Bloquer aussi l'utilisateur signalé */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  block?: boolean;
}

/** ✅ Bloquer un utilisateur */
export class BlockRideChatUserDto {
  @IsOptional()
  @IsUUID()
  rideId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** ✅ Admin : liste des signalements */
export class AdminRideChatReportsQueryDto {
  @IsOptional()
  @IsIn(RIDE_CHAT_REPORT_STATUSES as unknown as string[])
  status?: (typeof RIDE_CHAT_REPORT_STATUSES)[number];

  @IsOptional()
  @IsIn(RIDE_CHAT_REPORT_REASONS as unknown as string[])
  reason?: (typeof RIDE_CHAT_REPORT_REASONS)[number];

  @IsOptional()
  @IsUUID()
  rideId?: string;

  @IsOptional()
  @IsUUID()
  reportedUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** ✅ Admin : traiter un signalement (et masquer le message signalé si besoin) */
export class AdminReviewRideChatReportDto {
  @IsIn(['REVIEWED', 'ACTION_TAKEN', 'DISMISSED'])
  status: 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  adminNote?: string;

  /** Masquer le message signalé aux participants (conservé dans l'historique admin) */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hideMessage?: boolean;
}
