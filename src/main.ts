import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import * as Sentry from "@sentry/nestjs";
import redoc from "redoc-express";
import { join } from "path";
import { AppModule } from "@src/app.module";
import * as cookieParser from "cookie-parser";
import * as morgan from "morgan";
import * as passport from "passport";

async function bootstrap() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV || "localhost",
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      allowedHeaders: [
        "Content-Type",
        "Accept",
        "Authorization",
        "X-Requested-With",
      ],
      exposedHeaders: ["Content-Type", "Authorization"],
      origin: true,
      credentials: true,
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
      preflightContinue: false,
      optionsSuccessStatus: 204,
    },
    logger: console,
  });

  // Connect Redis microservice for event bus
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
  });

  await app.startAllMicroservices();

  if (process.env.MORGAN_LOG_FORMAT) {
    app.use(morgan(process.env.MORGAN_LOG_FORMAT));
  }

  if (process.env.PREFIX) {
    app.setGlobalPrefix(process.env.PREFIX);
  }

  if (process.env.SWAGGER_PREFIX) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(process.env.SWAGGER_TITLE || "Message Server API")
      .setDescription(
        process.env.SWAGGER_DESCRIPTION || "Email and notification service"
      )
      .setVersion(process.env.SWAGGER_VERSION || "1.0")
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(process.env.SWAGGER_PREFIX, app, swaggerDocument);
  }

  if (process.env.SWAGGER_PREFIX_REDOC) {
    const redocConfig = {
      title: process.env.SWAGGER_TITLE || "Message Server API",
      version: process.env.SWAGGER_VERSION || "1.0",
      specUrl: `${process.env.SWAGGER_PREFIX}-json`,
    };
    app.use(`${process.env.SWAGGER_PREFIX_REDOC}`, redoc(redocConfig));
  }

  app.use(cookieParser());
  app.use(passport.initialize());

  app.setBaseViewsDir(join(process.env.ROOT_PATH || ".", "views"));
  app.setViewEngine("ejs");

  const port = process.env.PORT || 3003;
  const ip = process.env.IP || "localhost";
  const message = `Message server running\nin ${process.env.NODE_ENV} mode on ${port} port\nat http://${ip}:${port}`;

  await app.listen(port, ip).then(() => {
    console.log(message);
  });

  process.on("SIGINT", () => {
    app.close();
  });
}

bootstrap();
