import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthmeService } from '../../authme/authme.service';
import { AuthmeBindingService } from '../../authme/authme-binding.service';
import { LuckpermsService } from '../../luckperms/luckperms.service';
import { IpLocationService } from '../../../lib/ip2region/ip-location.service';
import { AdminAuditService } from '../admin-audit.service';
import { MailService } from '../../mail/mail.service';
import { UsersServiceContext } from './users.context';
import {
  initializeUserRecords,
  listUsers,
  getSessionUser,
  updateCurrentUser,
  getUserDetail,
  deleteUser,
  updateProfile,
  updateJoinDate,
  updateOwnPassword,
  resetUserPassword,
  ensureUser,
} from './users-core.manager';
import {
  addContact,
  addContactAdmin,
  updateContact,
  removeContact,
  sendEmailVerificationCode,
  verifyEmailContact,
  listEmailContacts,
  setPrimaryEmailContact,
} from './users-contacts.manager';
import {
  updateAuthmeBinding,
  createAuthmeBindingAdmin,
  listAuthmeBindingHistoryByUser,
  setPrimaryAuthmeBinding,
  unbindAuthmeBinding,
} from './users-authme.manager';
import {
  addMinecraftProfile,
  updateMinecraftProfile,
  removeMinecraftProfile,
} from './users-minecraft.manager';
import { addStatusEvent, addLifecycleEvent } from './users-status.manager';
import { regeneratePiic } from './users-piic.manager';
import { assignRoles, assignPermissionLabels } from './users-rbac.manager';
import { UpdateCurrentUserDto } from '../../dto/update-current-user.dto';
import { UpdateUserProfileDto } from '../../dto/update-user-profile.dto';
import { ResetUserPasswordDto } from '../../dto/reset-user-password.dto';
import { UpdateAuthmeBindingAdminDto } from '../../dto/update-authme-binding-admin.dto';
import { CreateAuthmeBindingAdminDto } from '../../dto/create-authme-binding-admin.dto';
import { AssignPermissionLabelsDto } from '../../dto/assign-permission-labels.dto';
import { CreateMinecraftProfileDto } from '../../dto/create-minecraft-profile.dto';
import { UpdateMinecraftProfileDto } from '../../dto/update-minecraft-profile.dto';
import { CreateStatusEventDto } from '../../dto/create-status-event.dto';
import { CreateLifecycleEventDto } from '../../dto/create-lifecycle-event.dto';
import { CreateUserContactDto } from '../../dto/create-user-contact.dto';
import { UpdateUserContactDto } from '../../dto/update-user-contact.dto';
import { RegeneratePiicDto } from '../../dto/regenerate-piic.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly piicPrefix = 'HC';
  private readonly emailVerificationIdentifierPrefix = 'email-verify:';
  private readonly verificationTtlMs = 10 * 60 * 1000;
  private readonly ctx: UsersServiceContext;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authmeService: AuthmeService,
    private readonly authmeBindingService: AuthmeBindingService,
    private readonly luckpermsService: LuckpermsService,
    private readonly ipLocationService: IpLocationService,
    private readonly adminAuditService: AdminAuditService,
    private readonly mailService: MailService,
  ) {
    this.ctx = {
      prisma: this.prisma,
      authmeService: this.authmeService,
      authmeBindingService: this.authmeBindingService,
      luckpermsService: this.luckpermsService,
      ipLocationService: this.ipLocationService,
      adminAuditService: this.adminAuditService,
      mailService: this.mailService,
      logger: this.logger,
      piicPrefix: this.piicPrefix,
      verificationTtlMs: this.verificationTtlMs,
      emailVerificationIdentifierPrefix: this.emailVerificationIdentifierPrefix,
    };
  }

  async initializeUserRecords(
    userId: string,
    options?: Parameters<typeof initializeUserRecords>[2],
  ) {
    return initializeUserRecords(this.ctx, userId, options);
  }

  async listUsers(params: Parameters<typeof listUsers>[1]) {
    return listUsers(this.ctx, params);
  }

  async getSessionUser(userId: string) {
    return getSessionUser(this.ctx, userId);
  }

  async updateCurrentUser(userId: string, dto: UpdateCurrentUserDto) {
    return updateCurrentUser(this.ctx, userId, dto);
  }

  async getUserDetail(userId: string) {
    return getUserDetail(this.ctx, userId);
  }

  async deleteUser(userId: string) {
    return deleteUser(this.ctx, userId);
  }

  async updateOwnPassword(userId: string, password: string) {
    return updateOwnPassword(this.ctx, userId, password);
  }

  async resetUserPassword(
    userId: string,
    dto: ResetUserPasswordDto,
    actorId?: string,
  ) {
    return resetUserPassword(this.ctx, userId, dto, actorId);
  }

  async updateAuthmeBinding(
    userId: string,
    bindingId: string,
    dto: UpdateAuthmeBindingAdminDto,
    actorId?: string,
  ) {
    return updateAuthmeBinding(this.ctx, userId, bindingId, dto, actorId);
  }

  async createAuthmeBindingAdmin(
    userId: string,
    dto: CreateAuthmeBindingAdminDto,
    actorId?: string,
  ) {
    return createAuthmeBindingAdmin(this.ctx, userId, dto, actorId);
  }

  async listAuthmeBindingHistoryByUser(
    userId: string,
    params?: Parameters<typeof listAuthmeBindingHistoryByUser>[2],
  ) {
    return listAuthmeBindingHistoryByUser(this.ctx, userId, params);
  }

  async assignPermissionLabels(
    userId: string,
    dto: AssignPermissionLabelsDto,
    actorId?: string,
  ) {
    return assignPermissionLabels(this.ctx, userId, dto, actorId);
  }

  async updateJoinDate(userId: string, joinDateIso: string) {
    return updateJoinDate(this.ctx, userId, joinDateIso);
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto) {
    return updateProfile(this.ctx, userId, dto);
  }

  async addMinecraftProfile(userId: string, dto: CreateMinecraftProfileDto) {
    return addMinecraftProfile(this.ctx, userId, dto);
  }

  async updateMinecraftProfile(
    userId: string,
    profileId: string,
    dto: UpdateMinecraftProfileDto,
  ) {
    return updateMinecraftProfile(this.ctx, userId, profileId, dto);
  }

  async removeMinecraftProfile(userId: string, profileId: string) {
    return removeMinecraftProfile(this.ctx, userId, profileId);
  }

  async addStatusEvent(
    userId: string,
    dto: CreateStatusEventDto,
    actorId?: string,
  ) {
    return addStatusEvent(this.ctx, userId, dto, actorId);
  }

  async addLifecycleEvent(
    userId: string,
    dto: CreateLifecycleEventDto,
    createdById?: string,
  ) {
    return addLifecycleEvent(this.ctx, userId, dto, createdById);
  }

  async addContact(userId: string, dto: CreateUserContactDto) {
    return addContact(this.ctx, userId, dto);
  }

  async addContactAdmin(userId: string, dto: CreateUserContactDto) {
    return addContactAdmin(this.ctx, userId, dto);
  }

  async updateContact(
    userId: string,
    contactId: string,
    dto: UpdateUserContactDto,
  ) {
    return updateContact(this.ctx, userId, contactId, dto);
  }

  async removeContact(userId: string, contactId: string) {
    return removeContact(this.ctx, userId, contactId);
  }

  async sendEmailVerificationCode(userId: string, emailRaw: string) {
    return sendEmailVerificationCode(this.ctx, userId, emailRaw);
  }

  async verifyEmailContact(userId: string, emailRaw: string, code: string) {
    return verifyEmailContact(this.ctx, userId, emailRaw, code);
  }

  async listEmailContacts(userId: string) {
    return listEmailContacts(this.ctx, userId);
  }

  async setPrimaryEmailContact(userId: string, contactId: string) {
    return setPrimaryEmailContact(this.ctx, userId, contactId);
  }

  async regeneratePiic(
    userId: string,
    dto: RegeneratePiicDto,
    actorId?: string,
  ) {
    return regeneratePiic(this.ctx, userId, dto, actorId);
  }

  async assignRoles(userId: string, roleKeys: string[], actorId?: string) {
    return assignRoles(this.ctx, userId, roleKeys, actorId);
  }

  async setPrimaryAuthmeBinding(
    userId: string,
    bindingId: string,
    actorId?: string,
  ) {
    return setPrimaryAuthmeBinding(this.ctx, userId, bindingId, actorId);
  }

  async unbindAuthmeBinding(
    userId: string,
    bindingId: string,
    actorId?: string,
  ) {
    return unbindAuthmeBinding(this.ctx, userId, bindingId, actorId);
  }

  async ensureUser(userId: string) {
    return ensureUser(this.ctx, userId);
  }
}
