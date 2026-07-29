import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiExcludeController } from "@nestjs/swagger";
import { MailDto } from "./mail.dto";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailQueueService } from "./mail.queue.service";
import { InternalAuthGuard } from "api-server-toolkit/guard";

@ApiExcludeController()
@Controller("mail")
export class MailController {
  constructor(private readonly mailQueueService: MailQueueService) {}

  @Get("status/:id")
  @UseGuards(InternalAuthGuard)
  async getStatus(@Param("id", ParseIntPipe) id: number) {
    const job = await this.mailQueueService.getStatus(id);
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return {
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
    };
  }

  @Post("send")
  @UseInterceptors(FilesInterceptor("file"))
  async send(
    @Body("options") options: MailDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const attachments = this.toAttachments(files);
    const job = await this.mailQueueService.enqueueEmail(options, attachments);
    return { jobId: job.id, status: job.status };
  }

  @Post("send_by_template")
  @UseInterceptors(FilesInterceptor("file"))
  async sendByTemplate(
    @Body("options") options: MailDto,
    @Body("data") data: object,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const attachments = this.toAttachments(files);
    const job = await this.mailQueueService.enqueueTemplate(
      options,
      data,
      attachments,
    );
    return { jobId: job.id, status: job.status };
  }

  private toAttachments(
    files?: Express.Multer.File[],
  ): MailAttachmentEntity[] | undefined {
    if (!files?.length) return undefined;
    return files.map(
      (f) =>
        ({
          filename: f.originalname,
          contentType: f.mimetype,
          content: f.buffer.toString("base64"),
        }) as MailAttachmentEntity,
    );
  }
}
