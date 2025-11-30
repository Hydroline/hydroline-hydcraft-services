import { AttachmentsService } from '../../attachments/attachments.service';
import { buildPublicUrl } from '../../lib/shared/url';

type MaybeUser = Record<string, unknown> & {
  avatarAttachmentId?: string | null;
  profile?: Record<string, unknown> | null;
  avatarUrl?: string | null;
};

type LatestAttachment = { id: string; isPublic: boolean };

export async function enrichUserAvatar<T extends MaybeUser>(
  attachmentsService: AttachmentsService,
  user: T,
  latestAttachment?: LatestAttachment,
): Promise<
  T & { avatarAttachmentId: string | null; avatarUrl: string | null }
> {
  const currentAttachmentId =
    (user?.avatarAttachmentId as string | null | undefined) ?? null;
  const effectiveAttachmentId =
    latestAttachment?.id ?? currentAttachmentId ?? null;

  if (!effectiveAttachmentId) {
    const profile = user?.profile
      ? { ...(user.profile as Record<string, unknown>), avatarUrl: null }
      : { avatarUrl: null };
    const enriched = {
      ...(user as Record<string, unknown>),
      avatarAttachmentId: null,
      avatarUrl: null,
      profile,
    };
    return enriched as unknown as T & {
      avatarAttachmentId: string | null;
      avatarUrl: string | null;
    };
  }

  let isPublic = latestAttachment?.isPublic ?? false;
  if (latestAttachment === undefined) {
    try {
      const attachment = await attachmentsService.getAttachmentOrThrow(
        effectiveAttachmentId,
      );
      isPublic = attachment.isPublic;
    } catch {
      isPublic = false;
    }
  }

  const avatarUrl =
    isPublic && effectiveAttachmentId
      ? buildPublicUrl(`/attachments/public/${effectiveAttachmentId}`)
      : null;

  const profile = user?.profile
    ? { ...(user.profile as Record<string, unknown>), avatarUrl }
    : { avatarUrl };

  const enriched = {
    ...(user as Record<string, unknown>),
    avatarAttachmentId: avatarUrl ? effectiveAttachmentId : null,
    avatarUrl,
    profile,
  };
  return enriched as unknown as T & {
    avatarAttachmentId: string | null;
    avatarUrl: string | null;
  };
}
