import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { bootstrap } from "api-server-toolkit/bootstrap";
import { Sentry, Helmet, Morgan, Cors, CookieParser, Passport, ValidationPipe, Log, Prefix, Swagger } from "api-server-toolkit/bootstrap/setup";
import { join } from "path";
import { AppModule } from "@src/app.module";

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  Sentry.setup(app);
  Helmet.setup(app);
  Cors.setup(app);
  CookieParser.setup(app);
  Passport.setup(app);
  ValidationPipe.setup(app);
  Log.setup(app);
  Morgan.setup(app);
  Prefix.setup(app);
  Swagger.setup(app);

  app.setBaseViewsDir(join(process.env.ROOT_PATH || ".", "views"));
  app.setViewEngine("ejs");

  await bootstrap(app, { port: 3003 });
}

main();
