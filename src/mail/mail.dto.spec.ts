import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { MailDto } from "./mail.dto";

// Regression (Wave 6 audit): the EJS adapter resolves absolute paths and `..`
// segments relative to views/mail, so a client-controlled template string was
// an arbitrary-file-read primitive. Only bare template names may pass.
describe("MailDto template validation", () => {
  const base = { to: "user@example.com" };

  async function errs(extra: Record<string, unknown>) {
    const dto = plainToInstance(MailDto, { ...base, ...extra });
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  }

  it("accepts a bare template name", async () => {
    const e = await errs({ template: "welcome_letter" });
    expect(e.filter((x) => x.property === "template")).toHaveLength(0);
  });

  it.each([
    "/etc/passwd",
    "../../etc/passwd",
    "views/../secrets",
    "nested/name",
    "template\\..\\..\\win",
    "tpl;rm -rf",
  ])("rejects path-like template %j", async (template) => {
    const e = await errs({ template });
    expect(e.filter((x) => x.property === "template").length).toBeGreaterThan(0);
  });

  it("caps subject and body length", async () => {
    const e = await errs({ subject: "x".repeat(256), html: "<p>" + "x".repeat(100000) });
    expect(e.map((x) => x.property).sort()).toEqual(["html", "subject"]);
  });

  it("rejects a non-email recipient", async () => {
    const e = await errs({ to: "not-an-email" });
    expect(e.map((x) => x.property)).toContain("to");
  });
});
