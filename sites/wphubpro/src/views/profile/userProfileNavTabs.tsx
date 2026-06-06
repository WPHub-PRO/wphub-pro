import type { IconType } from 'react-icons';
import { TbBell, TbCreditCard, TbMail, TbSettings, TbShieldLock } from 'react-icons/tb';

export const USER_PROFILE_TAB_CONFIG: Record<
  'subscription' | 'security' | 'account' | 'workspace_email' | 'notifications',
  { label: string; Icon: IconType }
> = {
  subscription: { label: 'Subscription', Icon: TbCreditCard },
  security: { label: 'Security', Icon: TbShieldLock },
  account: { label: 'Account settings', Icon: TbSettings },
  workspace_email: { label: 'Workspace email', Icon: TbMail },
  notifications: { label: 'Notifications', Icon: TbBell },
};
