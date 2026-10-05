import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * Normalized provider feedback payload (design note 7.6 §5). Real provider
 * webhooks (SES/SNS JSON, Postmark JSON) are translated to this shape by
 * thin per-provider adapters; the internal/SMTP path posts it directly.
 */
export class MailWebhookDto {
  @IsIn(["bounce", "complaint"])
  event: "bounce" | "complaint";

  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(["hard", "soft"])
  type?: "hard" | "soft";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  messageId?: string;
}
