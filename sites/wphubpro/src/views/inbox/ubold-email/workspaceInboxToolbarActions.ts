import type { IconType } from 'react-icons';
import {
  TbAlertCircle,
  TbArchive,
  TbArrowForwardUp,
  TbClockPause,
  TbFolder,
  TbMailOpened,
  TbTag,
  TbTrash,
} from 'react-icons/tb';

/** Matches Ubold `actionData` count/order (toolbar is visual-only unless extended later). */
export const workspaceInboxListToolbarActions: { label: string; icon: IconType }[] = [
  { icon: TbTrash, label: 'Delete' },
  { icon: TbMailOpened, label: 'Mark as Read' },
  { icon: TbTag, label: 'Tag' },
  { icon: TbArchive, label: 'Archive' },
  { icon: TbFolder, label: 'Move to Folder' },
  { icon: TbArrowForwardUp, label: 'Forward' },
  { icon: TbClockPause, label: 'Snooze' },
  { icon: TbAlertCircle, label: 'Mark as Important' },
];
