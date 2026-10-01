import { WebhooksService } from "./webhooks.service";

/**
 * WebhooksService persists a dedupe marker and the mail job in ONE
 * transaction (DataSource.transaction). The mock emulates that contract:
 * `transaction(cb)` invokes cb with a fake EntityManager whose
 * insert..orIgnore..execute chain reports the ON CONFLICT outcome.
 */
function makeEm(insertRaw: any[]) {
  const execute = jest.fn().mockResolvedValue({ raw: insertRaw });
  const qb: any = {
    insert: () => qb,
    into: () => qb,
    values: jest.fn(() => qb),
    orIgnore: () => qb,
    returning: () => qb,
    execute,
  };
  const em: any = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((_cls: any, data: any) => data),
    save: jest.fn().mockResolvedValue({ id: 1 }),
  };
  return { em, qb, execute };
}

function makeDataSource(insertRaw: any[]) {
  const { em, qb, execute } = makeEm(insertRaw);
  const transaction = jest.fn(async (cb: (em: any) => Promise<any>) => cb(em));
  return { dataSource: { transaction } as any, em, qb, execute, transaction };
}

function makeEvent(pattern: string, payload: any, eventId = "evt-1") {
  return {
    eventId,
    pattern,
    payload,
    source: "auth-server",
    timestamp: new Date().toISOString(),
    attempt: 1,
  } as any;
}

describe("WebhooksService — transactional idempotency", () => {
  it("marks processed and enqueues the mail job in one transaction", async () => {
    const ctx = makeDataSource([{ id: 1 }]);
    const service = new WebhooksService(ctx.dataSource);

    await service.handleEvent(
      makeEvent("user.registered", {
        userId: 1,
        username: "test@example.com",
        email: "test@example.com",
        subject: "Welcome!",
        confirmUrl: "https://app.com/confirm?token=abc",
      }),
    );

    expect(ctx.transaction).toHaveBeenCalledTimes(1);
    expect(ctx.qb.values).toHaveBeenCalledWith({ eventId: "evt-1" });
    expect(ctx.em.save).toHaveBeenCalledWith({
      data: {
        to: "test@example.com",
        subject: "Welcome!",
        template: "register",
        payload: { url: "https://app.com/confirm?token=abc" },
      },
    });
  });

  it("skips the side effect for an already-processed eventId", async () => {
    const ctx = makeDataSource([]); // ON CONFLICT — nothing inserted
    const service = new WebhooksService(ctx.dataSource);

    await service.handleEvent(
      makeEvent("password.reset", {
        username: "test@example.com",
        email: "test@example.com",
        resetUrl: "https://app.com/reset?token=xyz",
      }),
    );

    expect(ctx.em.save).not.toHaveBeenCalled();
  });

  it("re-throws handler failures so event-server retries the delivery", async () => {
    const ctx = makeDataSource([{ id: 2 }]);
    ctx.em.save.mockRejectedValue(new Error("db down"));
    const service = new WebhooksService(ctx.dataSource);

    await expect(
      service.handleEvent(
        makeEvent("user.two_factor_code", {
          userId: 5,
          email: "test@example.com",
          code: "123456",
        }),
      ),
    ).rejects.toThrow("db down");
  });

  it("unknown patterns touch neither the ledger nor the mail queue", async () => {
    const ctx = makeDataSource([{ id: 3 }]);
    const service = new WebhooksService(ctx.dataSource);

    await service.handleEvent(makeEvent("unknown.event", { foo: "bar" }));

    expect(ctx.transaction).not.toHaveBeenCalled();
    expect(ctx.em.save).not.toHaveBeenCalled();
  });

  it("user.confirmed writes the marker but sends no mail", async () => {
    const ctx = makeDataSource([{ id: 4 }]);
    const service = new WebhooksService(ctx.dataSource);

    await service.handleEvent(
      makeEvent("user.confirmed", {
        userId: 4,
        username: "test@example.com",
        email: "test@example.com",
      }),
    );

    expect(ctx.qb.values).toHaveBeenCalledWith({ eventId: "evt-1" });
    expect(ctx.em.save).not.toHaveBeenCalled();
  });

  it("uses default subjects when the payload omits them", async () => {
    const ctx = makeDataSource([{ id: 5 }]);
    const service = new WebhooksService(ctx.dataSource);

    await service.handleEvent(
      makeEvent("user.two_factor_code", {
        userId: 6,
        email: "test@example.com",
        code: "654321",
      }),
    );

    expect(ctx.em.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          subject: "Your verification code",
          template: "code",
          payload: { code: "654321" },
        }),
      }),
    );
  });
});
