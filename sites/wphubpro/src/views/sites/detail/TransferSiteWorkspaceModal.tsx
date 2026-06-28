import type { Site } from '@/types';
import { useMemo, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'

export type WorkspaceTransferChoice = 'personal' | string;

export type TransferWorkspaceOption = {
  id: WorkspaceTransferChoice;
  label: string;
};

export type TransferSiteWorkspaceModalProps = {
  show: boolean;
  onHide: () => void;
  site: Site;
  options: TransferWorkspaceOption[];
  teamsLoading?: boolean;
  isTransferring: boolean;
  onConfirm: (choice: WorkspaceTransferChoice) => void;
};

function currentWorkspaceChoice(site: Site): WorkspaceTransferChoice {
  const tid = site.teamId?.trim();
  return tid ? tid : 'personal';
}

const TransferSiteWorkspaceModal = ({
  show,
  onHide,
  site,
  options,
  teamsLoading = false,
  isTransferring,
  onConfirm,
}: TransferSiteWorkspaceModalProps) => {
  const current = currentWorkspaceChoice(site);
  const selectable = useMemo(
    () => options.filter((o) => o.id !== current),
    [options, current],
  );
  const [choice, setChoice] = useState<WorkspaceTransferChoice>(
    () => selectable[0]?.id ?? 'personal',
  );

  const siteLabel = site.siteName?.trim() || site.siteUrl?.trim() || site.$id;
  const noTargets = !teamsLoading && selectable.length === 0;

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      backdrop={isTransferring ? 'static' : true}
      keyboard={!isTransferring}
      onEnter={() => {
        const first = selectable[0]?.id ?? 'personal';
        setChoice(first);
      }}
    >
      <Modal.Header closeButton={!isTransferring}>
        <Modal.Title>Transfer site</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Move <strong className="text-break">{siteLabel}</strong> to your personal workspace or a team you{' '}
          <strong>own</strong> (not member-only teams). The WordPress connection stays the same.
        </p>
        {teamsLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted py-2">
            <Spinner animation="border" size="sm" role="status" />
            <span className="fs-sm">Loading teams…</span>
          </div>
        ) : null}
        {!teamsLoading && selectable.length > 0 ? (
          <Form.Group className="d-flex flex-column gap-2">
            {selectable.map((opt) => (
              <Form.Check
                key={opt.id}
                type="radio"
                id={`transfer-ws-${opt.id}`}
                name="transfer-workspace"
                label={opt.label}
                checked={choice === opt.id}
                onChange={() => setChoice(opt.id)}
              />
            ))}
          </Form.Group>
        ) : null}
        {noTargets ? (
          <Alert variant="light" className="small mb-0">
            This site is already in your only available workspace. Create a team (as owner) to transfer sites into a
            team workspace.
          </Alert>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" type="button" onClick={onHide} disabled={isTransferring}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          disabled={isTransferring || noTargets || selectable.length === 0}
          onClick={() => onConfirm(choice)}
        >
          {isTransferring ? (
            <>
              <Spinner animation="border" size="sm" className="me-2 align-middle" role="status" aria-hidden />
              Transferring…
            </>
          ) : (
            'Transfer'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TransferSiteWorkspaceModal;
