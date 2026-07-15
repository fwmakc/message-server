import { ApiProperty } from "@nestjs/swagger";

export class CommonDto {
  @ApiProperty({
    required: false,
    description: "Id",
  })
  id?: number;
}
