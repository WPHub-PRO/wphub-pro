import { Button, Spinner } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'

export type DeleteSiteConfirmModalProps = {
  show: boolean;
  onHide: () => void;
  /** Shown in the body (name, URL, or id). */
  siteLabel: string;
  isDeleting: boolean;
  onConfirm: () => void;
};

const DeleteSiteConfirmModal = ({
  show,
  onHide,
  siteLabel,
  isDeleting,
  onConfirm,
}: DeleteSiteConfirmModalProps) => {
  const label = siteLabel.trim() || 'this site';

  return (
    <Modal show={show} onHide={onHide} centered backdrop={isDeleting ? 'static' : true} keyboard={!isDeleting}>
      <Modal.Header closeButton={!isDeleting}>
        <Modal.Title>Remove site from platform</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-0">
          Remove{' '}
          <strong className="fw-bold text-break">{label}</strong> from the platform? This cannot be undone. Your
          WordPress site is not deleted.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" type="button" onClick={onHide} disabled={isDeleting}>
          Cancel
        </Button>
        <Button variant="danger" type="button" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? (
            <>
              <Spinner animation="border" size="sm" className="me-2 align-middle" role="status" aria-hidden />
              Removing…
            </>
          ) : (
            'Remove site'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteSiteConfirmModal;
