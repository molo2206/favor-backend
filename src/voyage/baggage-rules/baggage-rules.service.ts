import { Injectable } from '@nestjs/common';
import { CreateBaggageRuleDto } from './dto/create-baggage-rule.dto';
import { UpdateBaggageRuleDto } from './dto/update-baggage-rule.dto';

@Injectable()
export class BaggageRulesService {
  create(createBaggageRuleDto: CreateBaggageRuleDto) {
    return 'This action adds a new baggageRule';
  }

  findAll() {
    return `This action returns all baggageRules`;
  }

  findOne(id: number) {
    return `This action returns a #${id} baggageRule`;
  }

  update(id: number, updateBaggageRuleDto: UpdateBaggageRuleDto) {
    return `This action updates a #${id} baggageRule`;
  }

  remove(id: number) {
    return `This action removes a #${id} baggageRule`;
  }
}
