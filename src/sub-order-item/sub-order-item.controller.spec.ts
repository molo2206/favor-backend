import { Test, TestingModule } from '@nestjs/testing';
import { SubOrderItemController } from './sub-order-item.controller';
import { SubOrderItemService } from './sub-order-item.service';

describe('SubOrderItemController', () => {
  let controller: SubOrderItemController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubOrderItemController],
      providers: [SubOrderItemService],
    }).compile();

    controller = module.get<SubOrderItemController>(SubOrderItemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
