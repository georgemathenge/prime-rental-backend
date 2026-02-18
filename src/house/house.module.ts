import { Module } from '@nestjs/common';
import { HouseService } from './house.service.js';
import { HouseController } from './house.controller.js';

@Module({
  controllers: [HouseController],
  providers: [HouseService],
})
export class HouseModule {}
