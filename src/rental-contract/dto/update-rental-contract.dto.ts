import { PartialType } from '@nestjs/swagger';
import { CreateRentalContractDto } from './create-rental-contract.dto';

export class UpdateRentalContractDto extends PartialType(CreateRentalContractDto) {}
