import { databaseConfigSchema } from "@maknyak/config";
import type { Provider } from "@nestjs/common";
import { Pool } from "pg";

export const DATABASE = Symbol("identity.database");

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE,
    useFactory: () =>
      new Pool({
        connectionString: databaseConfigSchema.parse(process.env).DATABASE_URL,
        max: 10,
      }),
  },
];
