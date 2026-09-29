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
