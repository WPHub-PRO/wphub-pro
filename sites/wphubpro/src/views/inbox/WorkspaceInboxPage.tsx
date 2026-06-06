import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useMailboxFoldersQuery, useMailboxWorkspaceParts } from '@/domains/mailbox/useMailboxQueries';
import { Offcanvas } from 'react-bootstrap';
import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { InboxLayoutContext } from '@/views/inbox/inboxLayoutContext';
import MailboxLiveSidebar from '@/views/inbox/MailboxLiveSidebar';

export default function WorkspaceInboxPage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('INBOX');
  const foldersQ = useMailboxFoldersQuery();
  const mbParts = useMailboxWorkspaceParts();

  useEffect(() => {
    const boxes = foldersQ.data?.mailboxes;
    if (!boxes?.length) return;
    if (!boxes.some((b) => b.path === selectedFolder)) {
      const inbox =
        boxes.find((b) => (b.special || '').toLowerCase().includes('inbox')) ||
        boxes.find((b) => /^INBOX$/i.test(b.path)) ||
        boxes[0];
      if (inbox) setSelectedFolder(inbox.path);
    }
  }, [foldersQ.data?.mailboxes, mbParts.routeKey, selectedFolder]);

  const layoutValue = useMemo(
    () => ({
      selectedFolder,
      setSelectedFolder,
      toggleMailSidebar: () => setShowSidebar(true),
      closeMailSidebar: () => setShowSidebar(false),
    }),
    [selectedFolder],
  );

  return (
    <InboxLayoutContext.Provider value={layoutValue}>
      <div className="container-fluid">
        <PageBreadcrumb title="Email" subtitle="Inbox" />
        <div className="outlook-box gap-1 email-app d-flex flex-column flex-lg-row align-items-stretch">
          <Offcanvas
            show={showSidebar}
            onHide={() => setShowSidebar(false)}
            responsive="lg"
            placement="start"
            className="offcanvas-lg offcanvas-start outlook-left-menu outlook-left-menu-sm pe-lg-0"
            tabIndex={-1}
            id="emailSidebaroffcanvas">
            <MailboxLiveSidebar />
          </Offcanvas>
          <div className="flex-grow-1 min-w-0 ps-lg-0">
            <Outlet context={{ toggleSidebar: layoutValue.toggleMailSidebar }} />
          </div>
        </div>
      </div>
    </InboxLayoutContext.Provider>
  );
}
