import { Test, TestingModule } from '@nestjs/testing';
import { SubOrderItemService } from './sub-order-item.service';

describe('SubOrderItemService', () => {
  let service: SubOrderItemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubOrderItemService],
    }).compile();

    service = module.get<SubOrderItemService>(SubOrderItemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
