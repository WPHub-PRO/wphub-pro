import { ok, fail } from '@code045/wphubpro-shared';
import { handleSaveAdminWorkspaceInbox } from '../lib/adminWorkspaceInbox.ts';
import { mailSecretsKey } from '../lib/mailSecrets.ts';

export default async function handleSaveAdminWorkspaceInboxAction({ res, error, databases, payload }) {
  try {
    const out = await handleSaveAdminWorkspaceInbox(databases, payload.mailboxes, mailSecretsKey());
    if (out && out.error) return fail(res, out.error, out.status || 500);
    return ok(res, out);
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
