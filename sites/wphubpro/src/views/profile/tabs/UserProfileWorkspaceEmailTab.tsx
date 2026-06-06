import MailboxSettingsForm from '@/views/mailbox/MailboxSettingsForm';

export default function UserProfileWorkspaceEmailTab() {
  return (
    <div>
      <p className="text-muted mb-3">
        Personal mailbox settings are stored on your account and used when you use the <strong>Inbox</strong> in personal
        workspace. Use app passwords for providers like Gmail.
      </p>
      <MailboxSettingsForm variant="personal" canEdit />
    </div>
  );
}
