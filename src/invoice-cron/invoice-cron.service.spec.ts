import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceCronService } from './invoice-cron.service';

describe('InvoiceCronService', () => {
  let service: InvoiceCronService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceCronService],
    }).compile();

    service = module.get<InvoiceCronService>(InvoiceCronService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
