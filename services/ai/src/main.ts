import "reflect-metadata";
import { requestTelemetry, serviceConfig } from "@maknyak/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const config = serviceConfig("ai");
  const app = await NestFactory.create(AppModule);
  app.use(requestTelemetry("ai"));
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1");
  await app.listen(config.PORT, "0.0.0.0");
}

void bootstrap();
