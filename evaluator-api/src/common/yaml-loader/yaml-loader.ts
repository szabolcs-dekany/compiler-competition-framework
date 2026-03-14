import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class YamlLoader<T extends { id: string }> {
  private cache: Map<string, T> | null = null;

  constructor(private readonly directory: string) {}

  loadAll(): Map<string, T> {
    if (this.cache) {
      return this.cache;
    }

    this.cache = new Map();

    if (!fs.existsSync(this.directory)) {
      return this.cache;
    }

    const files = fs.readdirSync(this.directory);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
        continue;
      }

      const filePath = path.join(this.directory, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const item = yaml.load(content) as T;

      this.cache.set(item.id, item);
    }

    return this.cache;
  }

  get(id: string): T | undefined {
    return this.loadAll().get(id);
  }

  getAll(): T[] {
    return Array.from(this.loadAll().values());
  }

  clearCache(): void {
    this.cache = null;
  }
}
