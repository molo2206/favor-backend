import { Test, TestingModule } from '@nestjs/testing';
import { ReservServiceService } from './reserv-service.service';

describe('ReservServiceService', () => {
  let service: ReservServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReservServiceService],
    }).compile();

    service = module.get<ReservServiceService>(ReservServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
