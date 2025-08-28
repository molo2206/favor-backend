import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  Min,
} from 'class-validator';
import { BedType } from '../enum/bedtype.enum';
import { RoomStatus } from '../enum/roomStatus.enum';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  capacity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsEnum(BedType)
  bedType: BedType;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsUUID()
  measureId?: string;
}
