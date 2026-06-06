import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import type { SystemEmailEventKey } from './events';

const FN = APPWRITE_FUNCTION_IDS.MESSAGING;

export type EmailDeliverySettings = {
  provider?: string;
  from_email?: string;
  from_name?: string;
  reply_to?: string;
  webhook_url?: string;
};

export async function fetchEmailDelivery() {
  return executeFunction<{
    success?: boolean;
    settings?: EmailDeliverySettings;
    hasResendKey?: boolean;
  }>(FN, { action: 'email_delivery_get' }, { omitImpersonationHeaders: true });
}

export async function upsertEmailDelivery(settings: EmailDeliverySettings) {
  return executeFunction<{ success?: boolean }>(
    FN,
    { action: 'email_delivery_upsert', ...settings },
    { omitImpersonationHeaders: true },
  );
}

export async function sendEmailTest(to: string, subject?: string) {
  return executeFunction<{ success?: boolean; via?: string }>(
    FN,
    { action: 'email_test_send', to, subject },
    { omitImpersonationHeaders: true },
  );
}

export async function fetchEmailShell() {
  return executeFunction<{ success?: boolean; shell?: { header_html?: string; footer_html?: string } }>(
    FN,
    { action: 'email_shell_get' },
    { omitImpersonationHeaders: true },
  );
}

export async function upsertEmailShell(shell: { header_html: string; footer_html: string }) {
  return executeFunction<{ success?: boolean }>(
    FN,
    { action: 'email_shell_upsert', ...shell },
    { omitImpersonationHeaders: true },
  );
}

export type EmailTemplateRow = {
  $id: string;
  event_key: string;
  title: string;
  subject: string;
  body_html: string;
  enabled: boolean;
};

export async function fetchEmailTemplates() {
  return executeFunction<{ success?: boolean; items?: EmailTemplateRow[] }>(
    FN,
    { action: 'email_templates_list' },
    { omitImpersonationHeaders: true },
  );
}

export async function upsertEmailTemplate(p: {
  documentId?: string;
  event_key: SystemEmailEventKey;
  title: string;
  subject: string;
  body_html: string;
  enabled: boolean;
}) {
  return executeFunction<{ success?: boolean; documentId?: string }>(
    FN,
    {
      action: 'email_template_upsert',
      documentId: p.documentId,
      event_key: p.event_key,
      title: p.title,
      subject: p.subject,
      body_html: p.body_html,
      enabled: p.enabled,
    },
    { omitImpersonationHeaders: true },
  );
}

export async function previewEmail(p: {
  event_key: SystemEmailEventKey;
  mockContext?: Record<string, string>;
}) {
  return executeFunction<{
    success?: boolean;
    subject?: string;
    html?: string;
    text?: string;
    usedDbTemplate?: boolean;
  }>(FN, { action: 'email_preview', event_key: p.event_key, mockContext: p.mockContext }, { omitImpersonationHeaders: true });
}
