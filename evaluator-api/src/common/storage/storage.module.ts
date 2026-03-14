import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { storageConfig } from './storage.config';

@Global()
@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
