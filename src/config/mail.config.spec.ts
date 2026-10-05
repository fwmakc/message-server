import { getMailConfig } from "./mail.config";

const configOf = (env: Record<string, string>) =>
  ({
    get: (key: string) => env[key],
  }) as any;

describe("getMailConfig", () => {
  it("builds a credential-free transport when SMTP_USER is unset", async () => {
    const config = await getMailConfig(
      configOf({
        SMTP_HOST: "mailhog",
        SMTP_PORT: "1025",
        ROOT_PATH: "/app",
        SMTP_SENDER_EMAIL: "noreply@test.local",
      }),
    );
    expect(config.transport).toBe("smtp://mailhog:1025");
  });

  it("omits credentials for an empty SMTP_USER (compose default)", async () => {
    const config = await getMailConfig(
      configOf({
        SMTP_HOST: "mailhog",
        SMTP_PORT: "1025",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        ROOT_PATH: "/app",
        SMTP_SENDER_EMAIL: "noreply@test.local",
      }),
    );
    expect(config.transport).toBe("smtp://mailhog:1025");
  });

  it("embeds url-encoded credentials when SMTP_USER is set", async () => {
    const config = await getMailConfig(
      configOf({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "user@example.com",
        SMTP_PASSWORD: "p@ss:word",
        ROOT_PATH: "/app",
        SMTP_SENDER_EMAIL: "noreply@test.local",
      }),
    );
    expect(config.transport).toBe(
      "smtp://user%40example.com:p%40ss%3Aword@smtp.example.com:587",
    );
  });

  it("uses the smtps scheme when SMTP_SECURE=true", async () => {
    const config = await getMailConfig(
      configOf({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_USER: "user@example.com",
        SMTP_PASSWORD: "secret",
        SMTP_SECURE: "true",
        ROOT_PATH: "/app",
        SMTP_SENDER_EMAIL: "noreply@test.local",
      }),
    );
    expect(config.transport).toBe(
      "smtps://user%40example.com:secret@smtp.example.com:465",
    );
  });
});

// Journal №3, part 2: the mailer library's compile hook only skips mails
// that already carry html — a plain-text letter used to crash EjsAdapter on
// path.extname(undefined). The wrapper must pass templateless mail through
// untouched and still hand template mail to EJS.
describe("SkipTemplatelessAdapter (config.template.adapter)", () => {
  const callback = jest.fn();

  it("passes templateless mail through without touching EJS", async () => {
    const config = await getMailConfig(
      configOf({ SMTP_HOST: "m", SMTP_PORT: "1", ROOT_PATH: "/nowhere" }),
    );
    callback.mockClear();

    config.template.adapter.compile(
      { data: { to: "a@b.com", text: "hello" } },
      callback,
      config,
    );
    // resolved with no error and no template resolution attempt
    expect(callback).toHaveBeenCalledWith();
  });

  it("still routes template mail to the EJS adapter", async () => {
    const config = await getMailConfig(
      configOf({ SMTP_HOST: "m", SMTP_PORT: "1", ROOT_PATH: "/nowhere" }),
    );
    callback.mockClear();

    config.template.adapter.compile(
      { data: { to: "a@b.com", template: "register" } },
      callback,
      config,
    );
    // /nowhere/views/mail has no register.ejs — EJS must fail on the
    // missing file, proving the wrapper did not swallow the call
    expect(callback).toHaveBeenCalledWith(expect.anything());
    expect(callback.mock.calls[0][0]).toBeDefined();
  });
});
