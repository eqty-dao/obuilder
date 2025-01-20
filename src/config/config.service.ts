import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import convict from 'convict';
import * as dotenv from 'dotenv';
import { configurations } from '../configuration';
// Load environment variables from .env file
dotenv.config();

type SchemaOf<T extends convict.Schema<any>> = T extends convict.Schema<infer R> ? R : any;
type Schema = SchemaOf<typeof schema>;
type Path = convict.Path<SchemaOf<typeof schema>>;
type PathValue<K extends Path> = K extends null | undefined
  ? Schema
  : K extends convict.Path<Schema>
  ? convict.PathValue<Schema, K>
  : never;

convict.addFormat({
  name: 'typed-array',
  validate: (items, schema) => {
    if (!Array.isArray(items)) {
      throw new Error('must be of type Array');
    }

    for (const item of items) {
      convict(schema.children).load(item).validate();
    }
  },
});

const schema = {
  ssl: {
    enabled: {
      doc: 'Whether SSL is enabled',
      format: Boolean,
      default: false,
      env: 'SSL_ENABLED'
    },
    key: {
      doc: 'Path to SSL key file',
      format: String,
      default: '',
      env: 'SSL_KEY_PATH'
    },
    cert: {
      doc: 'Path to SSL certificate file',
      format: String,
      default: '',
      env: 'SSL_CERT_PATH'
    }
  }
};

@Injectable()
export class ConfigService implements OnModuleInit, OnModuleDestroy {
  private config: convict.Config<Schema>;
  private readonly ttl: number = 300000; // 5 minutes in milliseconds
  private reloadInterval: NodeJS.Timer;

  async onModuleInit() {
    if (!this.config) {
      await this.load();
    }

    if (!this.reloadInterval) {
      this.reloadInterval = setInterval(async () => {
        await this.load();
      }, this.ttl);
    }
  }

  async onModuleDestroy() {
    if (this.reloadInterval) {
      // clearInterval(this.reloadInterval);
    }
  }

  public async load(): Promise<void> {
    const config = convict(schema);
    const key = config.get('env');

    if (key in configurations) {
      config.load(configurations[key]);
    }

    await config.validate({ allowed: 'warn' });
    this.config = config;
  }

  get<K extends Path>(key: K): PathValue<K> {
    return this.config.get(key);
  }

  has(key: Path): boolean {
    return this.config.has(key);
  }
}
