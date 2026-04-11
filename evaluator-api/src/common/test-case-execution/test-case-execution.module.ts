import { Global, Module } from '@nestjs/common';
import { TestCaseExecutionService } from './test-case-execution.service';

@Global()
@Module({
  providers: [TestCaseExecutionService],
  exports: [TestCaseExecutionService],
})
export class TestCaseExecutionModule {}
