import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchEmailDelivery,
  fetchEmailShell,
  fetchEmailTemplates,
  previewEmail,
  sendEmailTest,
  upsertEmailDelivery,
  upsertEmailShell,
  upsertEmailTemplate,
} from './api';
import type { SystemEmailEventKey } from './events';

const Q = ['admin', 'messaging', 'email'] as const;

export function useEmailDelivery() {
  return useQuery({
    queryKey: [...Q, 'delivery'],
    queryFn: () => fetchEmailDelivery(),
  });
}

export function useEmailDeliveryUpsert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertEmailDelivery,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...Q, 'delivery'] });
    },
  });
}

export function useEmailTestSend() {
  return useMutation({
    mutationFn: ({ to, subject }: { to: string; subject?: string }) => sendEmailTest(to, subject),
  });
}

export function useEmailShell() {
  return useQuery({
    queryKey: [...Q, 'shell'],
    queryFn: () => fetchEmailShell(),
  });
}

export function useEmailShellUpsert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertEmailShell,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...Q, 'shell'] });
    },
  });
}

export function useEmailTemplatesList() {
  return useQuery({
    queryKey: [...Q, 'templates'],
    queryFn: () => fetchEmailTemplates(),
  });
}

export function useEmailTemplateUpsert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertEmailTemplate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...Q, 'templates'] });
    },
  });
}

export function useEmailPreview() {
  return useMutation({
    mutationFn: (p: { event_key: SystemEmailEventKey; mockContext?: Record<string, string> }) =>
      previewEmail(p),
  });
}
