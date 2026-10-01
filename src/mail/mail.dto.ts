import { IsEmail, IsString, IsOptional, MaxLength, Matches } from "class-validator";
import { CommonDto } from "@src/common/common.dto";

export class MailDto extends CommonDto {
  @IsOptional()
  @IsEmail()
  from?: string;

  @IsEmail()
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
