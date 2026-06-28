import { Button } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'

type SiteExtensionRemoveConfirmModalProps = {
  show: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isBusy: boolean;
  onHide: () => void;
  onConfirm: () => void;
};

export default function SiteExtensionRemoveConfirmModal({
  show,
  title,
  description,
  confirmLabel = 'Remove',
  isBusy,
  onHide,
  onConfirm,
}: SiteExtensionRemoveConfirmModalProps) {
  return (
    <Modal show={show} onHide={onHide} centered backdrop={isBusy ? 'static' : true} keyboard={!isBusy}>
      <Modal.Header closeButton>
        <Modal.Title className="fs-lg">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-0 text-body-secondary">{description}</p>
      </Modal.Body>
      <Modal.Footer className="gap-2">
        <Button variant="light" size="sm" onClick={onHide} disabled={isBusy}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={isBusy}>
          {isBusy ? 'Removing…' : confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
