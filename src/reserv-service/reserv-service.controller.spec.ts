import { Test, TestingModule } from '@nestjs/testing';
import { ReservServiceController } from './reserv-service.controller';
import { ReservServiceService } from './reserv-service.service';

describe('ReservServiceController', () => {
  let controller: ReservServiceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReservServiceController],
      providers: [ReservServiceService],
    }).compile();

    controller = module.get<ReservServiceController>(ReservServiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
