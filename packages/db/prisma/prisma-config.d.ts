declare module 'prisma/config' {
  export interface PrismaConfig {
    datasource?: {
      url?: string;
    };
  }

  export function defineConfig<T extends PrismaConfig>(config: T): T;
}
