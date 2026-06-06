import { useAuth } from '@/domains/auth';
import {
  NOTIFICATION_PREF_DEFINITIONS,
  NOTIFICATION_RETENTION_OPTIONS,
} from '@/domains/notifications/prefDefinitions';
import {
  parseTopbarNotificationPrefsFromRecord,
  TOPBAR_NOTIF_PERSONAL_PREF,
  TOPBAR_NOTIF_TEAM_IDS_PREF,
} from '@/domains/notifications/topbarPrefs';
import { mergeProfilePrefs, parseProfilePrefs } from '@/domains/profile/profilePrefs';
import { useTeamsList } from '@/domains/teams';
import { account } from '@/services/appwrite';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';

function isEventEnabled(map: Record<string, boolean> | undefined, key: string): boolean {
  if (!map) return true;
  return map[key] !== false;
}

const UserProfileNotificationsTab = () => {
  const { user, refreshUser } = useAuth();
  const teamsQ = useTeamsList(Boolean(user));
  const teamRows = teamsQ.data ?? [];
  const initial = useMemo(() => parseProfilePrefs(user?.prefs), [user?.prefs]);

  const [emailOn, setEmailOn] = useState(initial.notifyEmail !== false);
  const [platformOn, setPlatformOn] = useState(initial.notifyPlatform !== false);
  const [eventMap, setEventMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const { key } of NOTIFICATION_PREF_DEFINITIONS) {
      m[key] = isEventEnabled(initial.notificationEventPrefs, key);
    }
    return m;
  });
  const [retentionSelect, setRetentionSelect] = useState(() =>
    initial.notificationRetentionDays != null && initial.notificationRetentionDays > 0
      ? String(initial.notificationRetentionDays)
      : '',
  );
  const [topbarPersonal, setTopbarPersonal] = useState(true);
  const [topbarTeamOn, setTopbarTeamOn] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    const p = parseProfilePrefs(user?.prefs);
    setEmailOn(p.notifyEmail !== false);
    setPlatformOn(p.notifyPlatform !== false);
    const m: Record<string, boolean> = {};
    for (const { key } of NOTIFICATION_PREF_DEFINITIONS) {
      m[key] = isEventEnabled(p.notificationEventPrefs, key);
    }
    setEventMap(m);
    setRetentionSelect(
      p.notificationRetentionDays != null && p.notificationRetentionDays > 0
        ? String(p.notificationRetentionDays)
        : '',
    );

    const rawPrefs = user?.prefs && typeof user.prefs === 'object' ? (user.prefs as Record<string, unknown>) : undefined;
    const tb = parseTopbarNotificationPrefsFromRecord(rawPrefs);
    setTopbarPersonal(tb.explicit ? tb.personalEnabled : true);
    const nextTeams: Record<string, boolean> = {};
    for (const row of teamRows) {
      const id = row.team.$id;
      if (!tb.explicit) {
        nextTeams[id] = true;
      } else {
        nextTeams[id] = tb.enabledTeamIds.has(id);
      }
    }
    setTopbarTeamOn(nextTeams);
  }, [user?.prefs, teamRows]);

  const setEventOn = useCallback((key: string, on: boolean) => {
    setEventMap((prev) => ({ ...prev, [key]: on }));
  }, []);

  const grouped = useMemo(() => {
    type Def = (typeof NOTIFICATION_PREF_DEFINITIONS)[number];
    const by = new Map<string, Def[]>();
    for (const def of NOTIFICATION_PREF_DEFINITIONS) {
      const g = def.group;
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push(def);
    }
    return [...by.entries()] as [string, Def[]][];
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in.');
      const notificationEventPrefs: Record<string, boolean> = {};
      for (const { key } of NOTIFICATION_PREF_DEFINITIONS) {
        notificationEventPrefs[key] = eventMap[key] !== false;
      }
      const next = mergeProfilePrefs(user.prefs, {
        notifyEmail: emailOn,
        notifyPlatform: platformOn,
        notificationEventPrefs,
        [TOPBAR_NOTIF_PERSONAL_PREF]: topbarPersonal,
        [TOPBAR_NOTIF_TEAM_IDS_PREF]: teamRows.filter((r) => topbarTeamOn[r.team.$id] !== false).map((r) => r.team.$id),
      });
      if (retentionSelect === '') {
        delete (next as Record<string, unknown>).notificationRetentionDays;
      } else {
        (next as Record<string, unknown>).notificationRetentionDays = Number.parseInt(retentionSelect, 10);
      }
      await account.updatePrefs(next);
    },
    onSuccess: async () => {
      setMessage({ variant: 'success', text: 'Notification preferences saved.' });
      await refreshUser();
    },
    onError: (err: unknown) => {
      setMessage({ variant: 'danger', text: err instanceof Error ? err.message : 'Could not save preferences.' });
    },
  });

  return (
    <div>
      <p className="text-muted fs-xs text-uppercase fw-semibold mb-2">Channels</p>
      <p className="text-muted fs-sm mb-4">
        Choose where you want to receive product updates, alerts, and subscription-related messages. Delivery still depends on features enabled for
        your workspace.
      </p>

      {message ? (
        <Alert variant={message.variant} className="py-2 fs-sm mb-3">
          {message.text}
        </Alert>
      ) : null}

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          saveMutation.mutate();
        }}
      >
        <div className="border rounded p-3 mb-3">
          <Form.Check
            type="switch"
            id="notify-email"
            className="mb-3"
            label={
              <span>
                <span className="fw-semibold d-block">Email</span>
                <span className="text-muted fs-xs fw-normal">Important notices and digests sent to your account email.</span>
              </span>
            }
            checked={emailOn}
            onChange={(e) => setEmailOn(e.target.checked)}
          />
          <Form.Check
            type="switch"
            id="notify-platform"
            className="mb-0"
            label={
              <span>
                <span className="fw-semibold d-block">On platform</span>
                <span className="text-muted fs-xs fw-normal">In-app notifications and badges while you use WPHub.Pro.</span>
              </span>
            }
            checked={platformOn}
            onChange={(e) => setPlatformOn(e.target.checked)}
          />
        </div>

        <p className="text-muted fs-xs text-uppercase fw-semibold mb-2">Top bar inbox</p>
        <p className="text-muted fs-sm mb-3">
          Choose which workspaces appear in the header notification list. The full notifications page always shows the current workspace only.
        </p>

        <div className="border rounded p-3 mb-3">
          <Form.Check
            type="switch"
            id="topbar-personal"
            className="mb-3"
            disabled={!platformOn}
            label={
              <span>
                <span className="fw-semibold d-block">Personal workspace</span>
                <span className="text-muted fs-xs fw-normal">Alerts not tied to a specific team.</span>
              </span>
            }
            checked={platformOn && topbarPersonal}
            onChange={(e) => setTopbarPersonal(e.target.checked)}
          />
          {teamsQ.isLoading ? (
            <p className="text-muted small mb-0">Loading teams…</p>
          ) : teamRows.length === 0 ? (
            <p className="text-muted small mb-0">You are not a member of any teams yet.</p>
          ) : (
            teamRows.map((row) => (
              <Form.Check
                key={row.team.$id}
                type="switch"
                id={`topbar-team-${row.team.$id}`}
                className="mb-2"
                disabled={!platformOn}
                label={
                  <span>
                    <span className="fw-semibold d-block">{row.team.name}</span>
                  </span>
                }
                checked={platformOn && topbarTeamOn[row.team.$id] !== false}
                onChange={(e) =>
                  setTopbarTeamOn((prev) => ({
                    ...prev,
                    [row.team.$id]: e.target.checked,
                  }))
                }
              />
            ))
          )}
        </div>

        <p className="text-muted fs-xs text-uppercase fw-semibold mb-2">In-app events</p>
        <p className="text-muted fs-sm mb-3">
          Turn off categories you do not want as in-app notifications. Email and other channels are not changed here.
        </p>

        <div className="border rounded p-3 mb-3">
          {grouped.map(([group, defs], i) => (
            <div key={group} className={i < grouped.length - 1 ? 'mb-3 pb-3 border-bottom' : 'mb-0'}>
              <p className="fw-semibold fs-sm mb-2">{group}</p>
              {defs.map((def) => (
                <Form.Check
                  key={def.key}
                  type="switch"
                  id={`notif-pref-${def.key}`}
                  className="mb-2"
                  disabled={!platformOn}
                  label={
                    <span>
                      <span className="fw-semibold d-block">{def.label}</span>
                    </span>
                  }
                  checked={platformOn && (eventMap[def.key] !== false)}
                  onChange={(e) => setEventOn(def.key, e.target.checked)}
                />
              ))}
            </div>
          ))}
        </div>

        <p className="text-muted fs-xs text-uppercase fw-semibold mb-2">Inbox retention</p>
        <p className="text-muted fs-sm mb-2">
          Optionally hide in-app notifications older than the selected age (read or unread). Does not delete data for other users or workspaces.
        </p>
        <Form.Group className="mb-4">
          <Form.Label className="fs-sm">Show notifications from the last</Form.Label>
          <Form.Select
            value={retentionSelect}
            onChange={(e) => setRetentionSelect(e.target.value)}
            disabled={!platformOn}
            className="fs-sm"
            style={{ maxWidth: '20rem' }}
          >
            {NOTIFICATION_RETENTION_OPTIONS.map((o) => (
              <option key={o.value || 'none'} value={o.value}>
                {o.label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Button type="submit" variant="primary" size="sm" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Saving…
            </>
          ) : (
            'Save notification settings'
          )}
        </Button>
      </Form>
    </div>
  );
};

export default UserProfileNotificationsTab;
