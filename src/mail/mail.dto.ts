import {
  IsEmail,
  IsString,
  IsOptional,
  MaxLength,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidationArguments,
} from "class-validator";
import { CommonDto } from "@src/common/common.dto";

// Journal №3: a letter with no template and no text/html fails at SMTP time
// ("The path argument must be of type string") and burns the whole attempt
// budget — undeliverable by construction. Reject it at enqueue instead.
// Cross-field OR rules can't be a class decorator (legacy decorators resolve
// @Validate as a property decorator), and constraints attached to optional
// fields never fire when the field is absent — so it hangs on `to`, the one
// always-required content-agnostic field; args.object carries the whole DTO.
@ValidatorConstraint({ name: "mailRenderableContent", async: false })
class MailRenderableContentConstraint {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const mail = args.object as MailDto;
    if (!mail || typeof mail !== "object") return false;
    if (mail.template) return true;
    return Boolean(mail.text?.trim() || mail.html?.trim());
  }

  defaultMessage(): string {
    return "mail must set at least one of template, text, html — an empty letter is undeliverable by construction";
  }
}

export class MailDto extends CommonDto {
  @IsOptional()
  @IsEmail()
  from?: string;

  @IsEmail()
  @Validate(MailRenderableContentConstraint)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  html?: string;

  // The EJS adapter resolves absolute paths and `..` segments relative to
  // views/mail — only bare template names are ever legitimate here.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: "template must be a bare template name without path separators",
  })
  @MaxLength(128)
  template?: string;
}
