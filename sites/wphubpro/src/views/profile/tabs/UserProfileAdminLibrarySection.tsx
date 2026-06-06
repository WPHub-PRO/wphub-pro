import { useAuth } from '@/domains/auth';

const UserProfileAdminLibrarySection = () => {
  const { isAdmin } = useAuth();

  if (!isAdmin) return null;

  return (
    <div className="mt-5 pt-4 border-top">
      <p className="text-muted fs-xs text-uppercase fw-semibold mb-2">Library (admin)</p>
      <p className="text-muted fs-sm mb-0">
        In any team workspace, your personal library plugins and themes are available for installs, updates, and site
        matching. When the same slug exists in both personal and team libraries, the team entry is used.
      </p>
    </div>
  );
};

export default UserProfileAdminLibrarySection;
