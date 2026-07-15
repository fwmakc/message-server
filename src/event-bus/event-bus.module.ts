import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";

export const EVENT_BUS_CLIENT = "EVENT_BUS_CLIENT";

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: EVENT_BUS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.REDIS,
          options: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: Number(configService.get("REDIS_PORT", 6379)),
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class EventBusModule {}
