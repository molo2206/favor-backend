import { ApiProperty } from '@nestjs/swagger';

class PermissionDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() create: boolean;
  @ApiProperty() read: boolean;
  @ApiProperty() update: boolean;
  @ApiProperty() delete: boolean;
  @ApiProperty() status: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

class CompanyDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() logo: string;
  @ApiProperty() adresse: string;
}

class UserHasCompanyDto {
  @ApiProperty() id: string;
  @ApiProperty() isOwner: boolean;
  @ApiProperty({ type: CompanyDto, nullable: true }) company: CompanyDto | null;
  @ApiProperty({ type: [PermissionDto] }) permissions: PermissionDto[];
}

class UserDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: [UserHasCompanyDto] })
  userHasCompany: UserHasCompanyDto[];
}

export class SigninResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty()
  access_token: string;
}
