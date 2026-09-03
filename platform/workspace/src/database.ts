import { databaseConfigSchema } from "@maknyak/config";
import type { Provider } from "@nestjs/common";
import { Pool } from "pg";

export const DATABASE = Symbol("workspace.database");

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE,
    useFactory: () => {
      const config = databaseConfigSchema.parse(process.env);
      return new Pool({ connectionString: config.DATABASE_URL, max: 10 });
    },
  },
];
