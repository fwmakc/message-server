import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { EventBusEnvelope, EventBusPattern } from "./event-bus.constants";
import { EVENT_BUS_CLIENT } from "./event-bus.module";

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(@Inject(EVENT_BUS_CLIENT) private readonly client: ClientProxy) {}

  emit<T>(pattern: EventBusPattern, payload: T, source: string): void {
    const envelope: EventBusEnvelope<T> = {
      pattern,
      payload,
      timestamp: Date.now(),
      source,
    };
    this.client.emit(pattern, envelope);
    this.logger.log(`Event emitted: ${pattern} from ${source}`);
  }
}
