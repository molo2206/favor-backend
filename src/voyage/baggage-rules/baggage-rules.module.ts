import { Module } from '@nestjs/common';
import { BaggageRulesService } from './baggage-rules.service';
import { BaggageRulesController } from './baggage-rules.controller';

@Module({
  controllers: [BaggageRulesController],
  providers: [BaggageRulesService],
})
export class BaggageRulesModule {}
