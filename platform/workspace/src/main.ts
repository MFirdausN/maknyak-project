import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { requestTelemetry, serviceConfig } from "@maknyak/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const config = serviceConfig("workspace");
  const app = await NestFactory.create(AppModule);
  app.use(requestTelemetry("workspace"));
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1");
  await app.listen(config.PORT, "0.0.0.0");
}

void bootstrap();
