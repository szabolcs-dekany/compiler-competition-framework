import { Global, Module } from '@nestjs/common';
import { RedisLogService } from './redis-log.service';

@Global()
@Module({
  providers: [RedisLogService],
  exports: [RedisLogService],
})
export class RedisLogModule {}
