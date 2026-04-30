import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from '../entities/inventory.entity';
import { Product } from '../../product/entities/product.entity';
import { CleanupService } from './cleanup.service';
import { CleanupJob } from './cleanup.job';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, Product])],
  providers: [CleanupService, CleanupJob],
  exports: [CleanupService, CleanupJob],
})
export class CleanupModule {}
