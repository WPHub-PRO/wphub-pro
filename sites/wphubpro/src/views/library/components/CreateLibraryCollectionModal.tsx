import { useCreateLibraryCollection } from '@/hooks/useLibraryFamiliesAndCollections';
import { useEffect, useState } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'

type CreateLibraryCollectionModalProps = {
  show: boolean;
  onHide: () => void;
  onCreated: (collectionId: string) => void;
};

const CreateLibraryCollectionModal = ({ show, onHide, onCreated }: CreateLibraryCollectionModalProps) => {
  const [name, setName] = useState('');
  const createMutation = useCreateLibraryCollection();

  useEffect(() => {
    if (!show) return;
    setName('');
  }, [show]);

  const handleSubmit = () => {
    const n = name.trim();
    if (!n) return;
    createMutation.mutate(
      { name: n, items: [] },
      {
        onSuccess: (collectionId) => {
          setName('');
          onHide();
          onCreated(collectionId);
        },
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>New collection</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label>Name</Form.Label>
          <Form.Control
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Starter site bundle"
            autoFocus
          />
          <Form.Text className="text-muted">
            You can add library items on the collection detail page after creating.
          </Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!name.trim() || createMutation.isPending} onClick={handleSubmit}>
          {createMutation.isPending ? <Spinner size="sm" /> : 'Create'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CreateLibraryCollectionModal;
