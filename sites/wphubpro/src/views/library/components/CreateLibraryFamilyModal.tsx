import { useCreateLibraryFamily } from '@/hooks/useLibraryFamiliesAndCollections';
import { useEffect, useState } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';

type CreateLibraryFamilyModalProps = {
  show: boolean;
  onHide: () => void;
  onCreated: (familyId: string) => void;
};

const CreateLibraryFamilyModal = ({ show, onHide, onCreated }: CreateLibraryFamilyModalProps) => {
  const [name, setName] = useState('');
  const createMutation = useCreateLibraryFamily();

  useEffect(() => {
    if (!show) return;
    setName('');
  }, [show]);

  const handleSubmit = () => {
    createMutation.mutate(
      { name: name.trim() || undefined, memberSlugs: [] },
      {
        onSuccess: (familyId) => {
          setName('');
          onHide();
          onCreated(familyId);
        },
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>New family</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label>Name (optional)</Form.Label>
          <Form.Control
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. WooCommerce stack"
            autoFocus
          />
          <Form.Text className="text-muted">
            You can add member slugs on the family detail page after creating.
          </Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" disabled={createMutation.isPending} onClick={handleSubmit}>
          {createMutation.isPending ? <Spinner size="sm" /> : 'Create'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CreateLibraryFamilyModal;
