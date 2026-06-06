import { useFinanceAdminEnabled } from '@/domains/admin/finance/hooks'
import { mediaLibraryFilesListQueryKey } from '@/domains/admin/mediaLibraryQueryKeys'
import { storage, STORAGE_BUCKET_MEDIA_LIBRARY_ID } from '@/services/appwrite'
import { Query } from 'appwrite'
import type { Models } from 'appwrite'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Button, Col, Modal, Row, Spinner } from 'react-bootstrap'

export type MediaLibraryImagePickerModalProps = {
  show: boolean
  onHide: () => void
  /** Called with Appwrite Storage **view** URL (HTTPS) suitable for Stripe `images`. */
  onSelect: (imageViewUrl: string) => void
  /** Replaces the default hint (Stripe vs branding, etc.). */
  bodyHint?: string
}

function isImageFile(f: Models.File): boolean {
  return f.mimeType.toLowerCase().startsWith('image/')
}

function viewUrlForFile(f: Models.File): string {
  return storage.getFileView({
    bucketId: STORAGE_BUCKET_MEDIA_LIBRARY_ID,
    fileId: f.$id,
  })
}

function thumbUrlForFile(f: Models.File): string {
  return storage.getFilePreview({
    bucketId: STORAGE_BUCKET_MEDIA_LIBRARY_ID,
    fileId: f.$id,
    width: 96,
    height: 96,
    quality: 80,
  })
}

/**
 * Pick an image from the Appwrite `media_library` bucket (same as Admin → Settings → Media library).
 */
const defaultBodyHint =
  'Only image files from the media_library bucket are shown. The chosen URL is set on the Stripe product as its image.'

const MediaLibraryImagePickerModal = ({
  show,
  onHide,
  onSelect,
  bodyHint = defaultBodyHint,
}: MediaLibraryImagePickerModalProps) => {
  const adminEnabled = useFinanceAdminEnabled()

  const listQuery = useQuery({
    queryKey: [...mediaLibraryFilesListQueryKey],
    queryFn: async () => {
      const res = await storage.listFiles(STORAGE_BUCKET_MEDIA_LIBRARY_ID, [
        Query.orderDesc('$createdAt'),
        Query.limit(200),
      ])
      return res.files
    },
    enabled: adminEnabled && show,
    staleTime: 15_000,
  })

  const images = useMemo(() => (listQuery.data ?? []).filter(isImageFile), [listQuery.data])

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
      scrollable
      backdrop="static"
      enforceFocus={false}
      style={{ zIndex: 1060 }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Select image from library</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">{bodyHint}</p>
        {listQuery.isLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted py-4">
            <Spinner animation="border" size="sm" />
            Loading…
          </div>
        ) : null}
        {listQuery.isError ? (
          <p className="text-danger small mb-0">
            {listQuery.error instanceof Error ? listQuery.error.message : 'Could not load files.'}
          </p>
        ) : null}
        {!listQuery.isLoading && !listQuery.isError && images.length === 0 ? (
          <p className="text-muted small mb-0">No images in the library yet. Upload some under Admin → Settings → Media library.</p>
        ) : null}
        {!listQuery.isLoading && !listQuery.isError && images.length > 0 ? (
          <Row className="g-2">
            {images.map((f) => (
              <Col key={f.$id} xs={6} sm={4} md={3}>
                <Button
                  type="button"
                  variant="outline-secondary"
                  className="w-100 h-100 p-2 d-flex flex-column align-items-center text-center"
                  onClick={() => {
                    onSelect(viewUrlForFile(f))
                    onHide()
                  }}
                >
                  <img
                    src={thumbUrlForFile(f)}
                    alt=""
                    width={96}
                    height={96}
                    className="rounded border object-fit-cover bg-light mb-1"
                    loading="lazy"
                  />
                  <span className="small text-truncate w-100" title={f.name}>
                    {f.name}
                  </span>
                </Button>
              </Col>
            ))}
          </Row>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default MediaLibraryImagePickerModal
