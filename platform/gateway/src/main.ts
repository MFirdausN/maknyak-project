import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { requestTelemetry, serviceConfig } from "@maknyak/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const config = serviceConfig("gateway");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(requestTelemetry("gateway"));
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("x-frame-options", "DENY");
      response.setHeader("referrer-policy", "no-referrer");
      response.setHeader(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=()",
      );
      next();
    },
  );
  app.useBodyParser("json", { limit: "256kb" });
  app.enableCors({
    origin: process.env.NODE_ENV === "production" ? false : true,
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix("api/v1");
  await app.listen(config.PORT, "0.0.0.0");
}

void bootstrap();
