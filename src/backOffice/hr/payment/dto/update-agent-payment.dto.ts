import { PartialType } from '@nestjs/mapped-types';
import { CreateAgentPaymentDto } from './create-agent-payment.dto';

export class UpdateAgentPaymentDto extends PartialType(CreateAgentPaymentDto) {}