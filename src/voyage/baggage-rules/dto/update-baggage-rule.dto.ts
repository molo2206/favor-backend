import { PartialType } from '@nestjs/swagger';
import { CreateBaggageRuleDto } from './create-baggage-rule.dto';

export class UpdateBaggageRuleDto extends PartialType(CreateBaggageRuleDto) {}
