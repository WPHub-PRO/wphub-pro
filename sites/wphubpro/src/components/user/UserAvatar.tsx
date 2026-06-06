import { getUserAvatarImageUrlForUi } from '@/lib/userAvatarUrl';
import type { User } from '@/types';
import { clsx } from 'clsx';
import { useMemo, type HTMLAttributes } from 'react';

export type UserAvatarProps = {
  user: Pick<User, '$id' | 'name' | 'email' | 'prefs'> & { legacyAccountAvatarUrl?: string | null };
  sizePx: number;
  className?: string;
  title?: string;
} & Omit<HTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'>;

/**
 * Renders the current or another member’s profile image (Appwrite + Dicebear Bottts + legacy URLs).
 */
function UserAvatar({ user, sizePx, className, title, style, ...imgRest }: UserAvatarProps) {
  const src = useMemo(
    () =>
      getUserAvatarImageUrlForUi({
        userId: user.$id,
        prefs: user.prefs as never,
        legacyImageUrls: [user.legacyAccountAvatarUrl],
      }),
    [user.$id, user.prefs, user.legacyAccountAvatarUrl],
  );
  const alt = title?.trim() || user.name?.trim() || user.email || 'User';

  return (
    <img
      src={src}
      alt={alt}
      width={sizePx}
      height={sizePx}
      className={clsx('object-fit-cover', className)}
      style={{ width: sizePx, height: sizePx, ...style }}
      loading="lazy"
      decoding="async"
      title={title}
      {...imgRest}
    />
  );
}

export default UserAvatar;
