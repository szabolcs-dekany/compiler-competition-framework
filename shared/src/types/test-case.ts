export interface TestCaseDto {
  id: string;
  category: string;
  name: string;
  description: string;
  inputPath: string;
  outputPath: string;
  timeoutMs: number;
  points: number;
}
