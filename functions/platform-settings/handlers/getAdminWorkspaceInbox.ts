import { ok, fail } from '@code045/wphubpro-shared';
import { handleGetAdminWorkspaceInbox } from '../lib/adminWorkspaceInbox.ts';
import { mailSecretsKey } from '../lib/mailSecrets.ts';

export default async function handleGetAdminWorkspaceInboxAction({ res, error, databases }) {
  try {
    const out = await handleGetAdminWorkspaceInbox(databases, mailSecretsKey());
    if (out && out.error) return fail(res, out.error, out.status || 500);
    return ok(res, out);
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
