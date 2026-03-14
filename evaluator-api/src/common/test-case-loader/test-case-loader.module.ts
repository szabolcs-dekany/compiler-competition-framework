import { Global, Module } from '@nestjs/common';
import { TestCaseLoaderService } from './test-case-loader.service';

@Global()
@Module({
  providers: [TestCaseLoaderService],
  exports: [TestCaseLoaderService],
})
export class TestCaseLoaderModule {}
