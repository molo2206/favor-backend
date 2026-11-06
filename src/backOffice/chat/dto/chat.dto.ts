// src/backOffice/chat/dto/chat.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ParticipantRole } from '../enums/chat.enums';
import { PresenceStatus } from 'src/notification/entities/user-presence.entity';

/** Accepte un tableau JSON, une chaîne "a,b,c" ou une valeur unique (multipart/form-data) */
const toStringArray = ({ value }: { value: any }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
      } catch {
        return [trimmed];
      }
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [String(value)];
};

const toNumberArray = ({ value }: { value: any }): number[] | undefined => {
  const arr = toStringArray({ value });
  return arr?.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
};

const toBoolean = ({ value }: { value: any }) => {
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return value;
};

// ============================================================
// CONVERSATIONS
// ============================================================

export class CreateDirectConversationDto {
  @IsUUID()
  userId: string;
}

export class CreateGroupConversationDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(toStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  memberIds: string[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onlyAdminsCanWrite?: boolean;
}

export class UpdateGroupConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onlyAdminsCanWrite?: boolean;
}

export class AddMembersDto {
  @Transform(toStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  memberIds: string[];
}

export class ChangeMemberRoleDto {
  @IsEnum(ParticipantRole)
  role: ParticipantRole;
}

export class UpdateParticipantSettingsDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isMuted?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPinned?: boolean;
}

export class ListConversationsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

// ============================================================
// MESSAGES
// ============================================================

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsUUID('all', { each: true })
  mentions?: string[];

  /** Durée (secondes) des audios/vidéos, dans l'ordre des fichiers envoyés */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @IsNumber({}, { each: true })
  durations?: number[];

  /** Forme d'onde d'une note vocale (1 seul fichier audio) */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @IsNumber({}, { each: true })
  waveform?: number[];
}

/** Payload socket "chat:send" */
export class SocketSendMessageDto extends SendMessageDto {
  @IsUUID()
  conversationId: string;
}

export class EditMessageDto {
  @IsString()
  @MaxLength(10000)
  content: string;
}

export class ReactMessageDto {
  @IsString()
  @MaxLength(32)
  emoji: string;
}

export class ForwardMessageDto {
  @Transform(toStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  conversationIds: string[];
}

export class ListMessagesQueryDto {
  /** Charger les messages plus anciens que ce message (pagination curseur) */
  @IsOptional()
  @IsUUID()
  before?: string;

  /** Charger les messages plus récents que ce message */
  @IsOptional()
  @IsUUID()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

export class SearchMessagesQueryDto {
  @IsString()
  q: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

export class ListMediaQueryDto {
  /** IMAGE | VIDEO | AUDIO | PDF | DOCUMENT | OTHER (plusieurs séparés par virgule) */
  @IsOptional()
  @IsString()
  types?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

export class MarkReadDto {
  @IsOptional()
  @IsUUID()
  messageId?: string;
}

// ============================================================
// CONTACTS / PRÉSENCE
// ============================================================

export class ListContactsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onlineOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

export class SetPresenceStatusDto {
  @IsEnum(PresenceStatus)
  status: PresenceStatus;
}
