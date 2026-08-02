import { bootstrap } from "api-server-toolkit/bootstrap";
import { join } from "path";
import { AppModule } from "@src/app.module";

bootstrap({
  module: AppModule,
  serviceName: "message-server",
  cors: true,
  morgan: true,
  cookieParser: true,
  passport: true,
  beforeListen: (app) => {
    app.setBaseViewsDir(join(process.env.ROOT_PATH || ".", "views"));
    app.setViewEngine("ejs");
  },
});
