import UserAvatar from '@/components/user/UserAvatar';
import { BOTTTS_PRESET_SEEDS } from '@/config/dicebearBottts';
import { useAuth } from '@/domains/auth';
import { parseProfilePrefs, type PrefsRecord } from '@/domains/profile/profilePrefs';
import { account, storage, STORAGE_BUCKET_AVATARS_ID } from '@/services/appwrite';
import { ID, Permission, Role } from 'appwrite';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { TbPhoto, TbTrash } from 'react-icons/tb';

const ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 2 * 1024 * 1024;

function extFromFile(f: File): 'png' | 'jpg' | 'webp' | null {
  const t = f.type.toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/webp') return 'webp';
  const n = f.name.toLowerCase();
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
  if (n.endsWith('.webp')) return 'webp';
  return null;
}

const UserProfileAvatarSection = () => {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);

  const parsed = useMemo(() => parseProfilePrefs((user?.prefs ?? null) as PrefsRecord | null), [user?.prefs]);
  const source = parsed.avatarSource ?? 'dicebear';
  const customId = parsed.avatarFileId?.trim() ?? '';

  const effectiveSeed = useMemo(() => {
    if (!user) return '';
    if (typeof parsed.avatarBotttsSeed === 'string' && parsed.avatarBotttsSeed.trim()) return parsed.avatarBotttsSeed.trim();
    return user.$id;
  }, [user, parsed.avatarBotttsSeed]);

  const buildBasePrefs = (): PrefsRecord => {
    if (!user) return {};
    return user.prefs && typeof user.prefs === 'object' && !Array.isArray(user.prefs) ? { ...(user.prefs as PrefsRecord) } : {};
  };

  const saveDicebearMutation = useMutation({
    mutationFn: async ({ seed, fileIdToDelete }: { seed: string | null; fileIdToDelete: string | null }) => {
      if (!user) throw new Error('Not signed in.');
      const next = buildBasePrefs();
      next.avatarSource = 'dicebear';
      if (seed && seed.trim()) next.avatarBotttsSeed = seed.trim();
      else delete next.avatarBotttsSeed;
      delete next.avatarFileId;
      await account.updatePrefs(next);
      if (fileIdToDelete) {
        try {
          await storage.deleteFile(STORAGE_BUCKET_AVATARS_ID, fileIdToDelete);
        } catch {
          /* ignore */
        }
      }
    },
    onSuccess: async () => {
      setMessage({ variant: 'success', text: 'Avatar updated.' });
      await refreshUser();
    },
    onError: (err: unknown) => {
      setMessage({ variant: 'danger', text: err instanceof Error ? err.message : 'Could not save avatar.' });
    },
  });

  const pickDicebear = (seed: string | null) => {
    if (!user) return;
    setMessage(null);
    const fid = customId || null;
    saveDicebearMutation.mutate({ seed, fileIdToDelete: fid });
  };

  const removeCustom = () => {
    if (!user) return;
    setMessage(null);
    saveDicebearMutation.mutate({ seed: effectiveSeed, fileIdToDelete: customId || null });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not signed in.');
      const ext = extFromFile(file);
      if (!ext) throw new Error('Use PNG, JPEG, or WebP.');
      if (file.size > MAX_BYTES) throw new Error('Image must be 2 MB or smaller.');

      const prevId = parseProfilePrefs((user.prefs ?? null) as PrefsRecord | null).avatarFileId?.trim() ?? null;

      const newId = ID.unique();
      const perms = [Permission.read(Role.users()), Permission.update(Role.user(user.$id)), Permission.delete(Role.user(user.$id))];
      const created = await storage.createFile(STORAGE_BUCKET_AVATARS_ID, newId, file, perms);
      if (prevId) {
        try {
          await storage.deleteFile(STORAGE_BUCKET_AVATARS_ID, prevId);
        } catch {
          /* ignore */
        }
      }
      const base: PrefsRecord =
        user.prefs && typeof user.prefs === 'object' && !Array.isArray(user.prefs) ? { ...(user.prefs as PrefsRecord) } : {};
      await account.updatePrefs({
        ...base,
        avatarSource: 'custom' as const,
        avatarFileId: created.$id,
      });
    },
    onSuccess: async () => {
      setMessage({ variant: 'success', text: 'Custom photo saved.' });
      await refreshUser();
    },
    onError: (err: unknown) => {
      setMessage({ variant: 'danger', text: err instanceof Error ? err.message : 'Upload failed.' });
    },
  });

  if (!user) return null;

  return (
    <div className="mb-4 pb-4 border-bottom">
      <p className="text-muted fs-xs text-uppercase fw-semibold mb-2">Profile photo</p>
      <p className="text-muted fs-sm mb-3">
        Choose a Bottts character or upload your own (PNG, JPEG, WebP). Custom images are stored in your WPHub storage.
      </p>

      {message ? (
        <Alert variant={message.variant} className="py-2 fs-sm mb-3" dismissible onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}

      <div className="d-flex flex-wrap align-items-center gap-3 mb-4">
        <div className="position-relative">
          <UserAvatar user={user} sizePx={80} className="rounded-circle border" />
        </div>
        <div className="d-flex flex-wrap gap-2">
          {source === 'custom' && customId ? (
            <Button
              type="button"
              variant="outline-danger"
              size="sm"
              disabled={saveDicebearMutation.isPending}
              onClick={() => !uploadMutation.isPending && removeCustom()}
            >
              <TbTrash className="me-1" /> Use Bottts only
            </Button>
          ) : null}
          <input ref={fileInputRef} type="file" className="d-none" accept={ACCEPT} onChange={onFileChange} />
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            disabled={uploadMutation.isPending || saveDicebearMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" /> Uploading…
              </>
            ) : (
              <>
                <TbPhoto className="me-1" /> Upload photo
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="fs-sm fw-medium mb-2">Bottts (Dicebear)</p>
      <div className="d-flex flex-wrap gap-2 gap-md-2 mb-2">
        <Button
          type="button"
          size="sm"
          variant={source === 'dicebear' && effectiveSeed === user.$id ? 'primary' : 'light'}
          className="border"
          disabled={saveDicebearMutation.isPending}
          onClick={() => !saveDicebearMutation.isPending && pickDicebear(null)}
        >
          Default
        </Button>
      </div>
      <div className="d-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: '0.5rem' }}>
        {BOTTTS_PRESET_SEEDS.map((seed) => {
          const active = source === 'dicebear' && effectiveSeed === seed;
          return (
            <button
              key={seed}
              type="button"
              className={`btn p-0 border rounded-2 overflow-hidden ${active ? 'border-primary border-2' : 'border-light'}`}
              style={{ aspectRatio: '1', minHeight: 56 }}
              onClick={() => !saveDicebearMutation.isPending && pickDicebear(seed)}
              title={seed}
              disabled={saveDicebearMutation.isPending}
            >
              <img
                src={`https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}`}
                alt=""
                className="w-100 h-100 object-fit-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          );
        })}
      </div>
    </div>
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMessage(null);
    uploadMutation.mutate(f);
  }
};

export default UserProfileAvatarSection;
