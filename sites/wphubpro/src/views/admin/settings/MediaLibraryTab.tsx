import { useNotificationContext } from '@/context/useNotificationContext'
import { useFinanceAdminEnabled } from '@/domains/admin/finance/hooks'
import { mediaLibraryAdminQueryPrefix, mediaLibraryFilesListQueryKey } from '@/domains/admin/mediaLibraryQueryKeys'
import { storage, STORAGE_BUCKET_MEDIA_LIBRARY_ID } from '@/services/appwrite'
import { ID, Query } from 'appwrite'
import type { Models } from 'appwrite'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  CloseButton,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Form,
  Modal,
  ProgressBar,
  Spinner,
  Table,
} from 'react-bootstrap'
import { TbClipboard, TbDotsVertical, TbDownload, TbFileTypePdf, TbLink, TbPhoto, TbPlayerPlay, TbTrash, TbUpload } from 'react-icons/tb'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  const rounded = i === 0 ? String(Math.round(v)) : v < 10 ? v.toFixed(1) : Math.round(v).toString()
  return `${rounded} ${units[i]}`
}

function extensionFromName(name: string): string {
  const i = name.lastIndexOf('.')
  if (i < 0 || i === name.length - 1) return '—'
  return name.slice(i + 1).toLowerCase()
}

function mediaKind(mime: string): 'image' | 'video' | 'pdf' | 'other' {
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m === 'application/pdf') return 'pdf'
  return 'other'
}

function mediaKindLabel(k: ReturnType<typeof mediaKind>): string {
  switch (k) {
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'pdf':
      return 'PDF'
    default:
      return 'Other'
  }
}

function thumbUrlForFile(f: Models.File): string | null {
  const kind = mediaKind(f.mimeType)
  if (kind === 'image' || kind === 'pdf' || kind === 'video') {
    return storage.getFilePreview({
      bucketId: STORAGE_BUCKET_MEDIA_LIBRARY_ID,
      fileId: f.$id,
      width: 72,
      height: 72,
      quality: 75,
    })
  }
  return null
}

function viewUrlForFile(f: Models.File): string {
  return storage.getFileView({
    bucketId: STORAGE_BUCKET_MEDIA_LIBRARY_ID,
    fileId: f.$id,
  })
}

/** Direct download URL (`Content-Disposition: attachment`). */
function downloadUrlForFile(f: Models.File): string {
  return storage.getFileDownload({
    bucketId: STORAGE_BUCKET_MEDIA_LIBRARY_ID,
    fileId: f.$id,
  })
}

/**
 * Same download endpoint with original filename in the query string so the copied URL visibly includes the file name
 * (and extension). Extra params are ignored by Appwrite if unsupported.
 */
function fileUrlWithFilenameQuery(f: Models.File): string {
  const base = downloadUrlForFile(f)
  const q = `filename=${encodeURIComponent(f.name)}`
  return base.includes('?') ? `${base}&${q}` : `${base}?${q}`
}

type UploadRow = {
  id: string
  name: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

const MediaLibraryTab = () => {
  const adminEnabled = useFinanceAdminEnabled()
  const qc = useQueryClient()
  const { showNotification } = useNotificationContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<UploadRow[]>([])
  const [uploading, setUploading] = useState(false)

  const [viewer, setViewer] = useState<Models.File | null>(null)

  useEffect(() => {
    if (!uploadOpen) return
    setUploadQueue([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [uploadOpen])

  const listQuery = useQuery({
    queryKey: [...mediaLibraryFilesListQueryKey],
    queryFn: async () => {
      const res = await storage.listFiles(STORAGE_BUCKET_MEDIA_LIBRARY_ID, [
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ])
      return res.files
    },
    enabled: adminEnabled,
    staleTime: 15_000,
  })

  const deleteMut = useMutation({
    mutationFn: async (fileId: string) => {
      await storage.deleteFile(STORAGE_BUCKET_MEDIA_LIBRARY_ID, fileId)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [...mediaLibraryAdminQueryPrefix] })
    },
  })

  const files = listQuery.data ?? []

  const overallProgress = useMemo(() => {
    if (uploadQueue.length === 0) return 0
    const sum = uploadQueue.reduce((a, r) => a + r.progress, 0)
    return Math.round(sum / uploadQueue.length)
  }, [uploadQueue])

  const copyViewLink = useCallback(
    async (f: Models.File) => {
      const url = viewUrlForFile(f)
      try {
        await navigator.clipboard.writeText(url)
        showNotification({
          title: 'Copied',
          message: 'View link (inline) copied to the clipboard.',
          variant: 'success',
          delay: 2500,
        })
      } catch {
        showNotification({
          title: 'Clipboard',
          message: 'Could not copy. View link: ' + url,
          variant: 'warning',
          delay: 8000,
        })
      }
    },
    [showNotification],
  )

  const copyFileUrl = useCallback(
    async (f: Models.File) => {
      const url = fileUrlWithFilenameQuery(f)
      try {
        await navigator.clipboard.writeText(url)
        showNotification({
          title: 'Copied',
          message: 'File (download) URL copied to the clipboard.',
          variant: 'success',
          delay: 2500,
        })
      } catch {
        showNotification({
          title: 'Clipboard',
          message: 'Could not copy. File URL: ' + url,
          variant: 'warning',
          delay: 8000,
        })
      }
    },
    [showNotification],
  )

  const openViewer = (f: Models.File) => {
    setViewer(f)
  }

  const confirmDelete = (f: Models.File) => {
    if (!window.confirm(`Delete “${f.name}” from the media library? This cannot be undone.`)) return
    deleteMut.mutate(f.$id, {
      onError: (e) => {
        showNotification({
          title: 'Delete failed',
          message: e instanceof Error ? e.message : 'Unknown error',
          variant: 'danger',
          delay: 6000,
        })
      },
      onSuccess: () => {
        showNotification({ title: 'Deleted', message: f.name, variant: 'success', delay: 2500 })
        if (viewer?.$id === f.$id) setViewer(null)
      },
    })
  }

  const runUploads = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    const arr = Array.from(fileList)
    const rows: UploadRow[] = arr.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      name: file.name,
      progress: 0,
      status: 'pending' as const,
    }))
    setUploadQueue(rows)
    setUploading(true)

    let successCount = 0
    for (let i = 0; i < arr.length; i += 1) {
      const file = arr[i]
      const rowId = rows[i].id
      setUploadQueue((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, status: 'uploading', progress: 0 } : r)),
      )
      try {
        const fileId = ID.unique()
        await storage.createFile(
          STORAGE_BUCKET_MEDIA_LIBRARY_ID,
          fileId,
          file,
          undefined,
          (progress) => {
            const pct =
              typeof progress.progress === 'number' && Number.isFinite(progress.progress)
                ? Math.round(progress.progress)
                : progress.chunksTotal
                  ? Math.round((progress.chunksUploaded / progress.chunksTotal) * 100)
                  : 0
            setUploadQueue((prev) => prev.map((r) => (r.id === rowId ? { ...r, progress: pct } : r)))
          },
        )
        successCount += 1
        setUploadQueue((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, status: 'done', progress: 100 } : r)),
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        setUploadQueue((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, status: 'error', error: msg, progress: 0 } : r)),
        )
      }
    }

    setUploading(false)
    await qc.invalidateQueries({ queryKey: [...mediaLibraryAdminQueryPrefix] })
    if (successCount > 0) {
      showNotification({
        title: 'Upload finished',
        message:
          successCount === arr.length
            ? 'All files were uploaded.'
            : `${successCount} of ${arr.length} file(s) uploaded; check errors below.`,
        variant: successCount === arr.length ? 'success' : 'warning',
        delay: 4000,
      })
    } else {
      showNotification({
        title: 'Upload failed',
        message: 'No files were uploaded.',
        variant: 'danger',
        delay: 5000,
      })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const viewerKind = viewer ? mediaKind(viewer.mimeType) : null
  const viewerUrl = viewer ? viewUrlForFile(viewer) : ''

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <p className="text-muted small mb-0">
          Files in the <code className="user-select-all">media_library</code> bucket (images, video, PDF). Push{' '}
          <code>appwrite.config.json</code> if the bucket does not exist yet.
        </p>
        <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
          <TbUpload className="me-1" aria-hidden />
          Upload
        </Button>
      </div>

      {listQuery.isLoading ? (
        <div className="d-flex align-items-center gap-2 text-muted py-4">
          <Spinner animation="border" size="sm" />
          Loading media…
        </div>
      ) : null}

      {listQuery.isError ? (
        <Alert variant="danger">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Could not list files.'}
        </Alert>
      ) : null}

      {!listQuery.isLoading && !listQuery.isError ? (
        <div className="table-responsive border rounded">
          <Table hover className="table table-custom table-centered table-nowrap mb-0 align-middle" size="sm">
            <thead className="bg-light align-middle bg-opacity-25 thead-sm">
              <tr className="text-uppercase fs-xxs">
                <th style={{ width: 88 }}>Preview</th>
                <th>Type</th>
                <th>Filename</th>
                <th>Size</th>
                <th>Extension</th>
                <th>Uploaded</th>
                <th className="text-end" style={{ width: 120 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted text-center py-4">
                    No files yet. Use Upload to add media.
                  </td>
                </tr>
              ) : (
                files.map((f) => {
                  const kind = mediaKind(f.mimeType)
                  const thumb = thumbUrlForFile(f)
                  return (
                    <tr key={f.$id}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-link p-0 border-0 bg-transparent"
                          onClick={() => openViewer(f)}
                          title="Open preview"
                          aria-label="Open preview"
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              width={56}
                              height={56}
                              className="rounded border object-fit-cover bg-light"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="d-flex align-items-center justify-content-center rounded border bg-light text-muted"
                              style={{ width: 56, height: 56 }}
                            >
                              {kind === 'video' ? <TbPlayerPlay size={22} /> : <TbPhoto size={22} />}
                            </div>
                          )}
                        </button>
                      </td>
                      <td>
                        <span className="small text-capitalize">{mediaKindLabel(kind)}</span>
                      </td>
                      <td className="small text-break">
                        <button
                          type="button"
                          className="btn btn-link p-0 text-start text-body text-decoration-underline"
                          onClick={() => openViewer(f)}
                          title="Open preview"
                          aria-label="Open preview"
                        >
                          {f.name}
                        </button>
                      </td>
                      <td className="small text-nowrap">{formatBytes(f.sizeOriginal)}</td>
                      <td className="small font-monospace">{extensionFromName(f.name)}</td>
                      <td className="small text-nowrap">
                        {new Date(f.$createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="text-end text-nowrap">
                        <Dropdown align="end">
                          <DropdownToggle
                            variant="link"
                            className="drop-arrow-none fs-xxl link-reset text-muted p-0"
                            aria-label="File actions"
                            title="File actions"
                          >
                            <TbDotsVertical aria-hidden />
                          </DropdownToggle>
                          <DropdownMenu>
                            <DropdownItem as="button" type="button" onClick={() => void copyViewLink(f)}>
                              <TbLink className="me-1 align-middle" size={18} aria-hidden /> Copy view link
                            </DropdownItem>
                            <DropdownItem as="button" type="button" onClick={() => void copyFileUrl(f)}>
                              <TbClipboard className="me-1 align-middle" size={18} aria-hidden /> Copy file URL
                            </DropdownItem>
                            <DropdownDivider />
                            <DropdownItem as="a" href={downloadUrlForFile(f)} download={f.name} rel="noreferrer" target="_blank">
                              <TbDownload className="me-1 align-middle" size={18} aria-hidden /> Download
                            </DropdownItem>
                            <DropdownDivider />
                            <DropdownItem
                              as="button"
                              type="button"
                              className="text-danger d-flex align-items-center"
                              disabled={deleteMut.isPending}
                              onClick={() => confirmDelete(f)}
                            >
                              <TbTrash className="me-1 align-middle" size={18} aria-hidden /> Delete
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </div>
      ) : null}

      <Modal show={uploadOpen} onHide={() => !uploading && setUploadOpen(false)} centered backdrop={uploading ? 'static' : true}>
        <Modal.Header closeButton={!uploading}>
          <Modal.Title>Upload media</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Images, video (mp4, webm, mov), and PDF — up to 100 MB per file. Multiple files upload one after another.
          </p>
          <Form.Group controlId="media-library-multi-upload">
            <Form.Label className="small">Choose files</Form.Label>
            <Form.Control
              ref={fileInputRef}
              type="file"
              multiple
              disabled={uploading}
              accept="image/*,video/*,.pdf,.mp4,.webm,.mov"
              onChange={(e) => {
                const input = e.currentTarget as HTMLInputElement
                const fl = input.files
                if (fl?.length) void runUploads(fl)
              }}
            />
          </Form.Group>
          {uploadQueue.length > 0 ? (
            <div className="mt-3">
              <div className="d-flex justify-content-between small text-muted mb-1">
                <span>Overall</span>
                <span>{overallProgress}%</span>
              </div>
              <ProgressBar now={overallProgress} label={`${overallProgress}%`} visuallyHidden className="mb-3" />
              <ul className="list-unstyled small mb-0">
                {uploadQueue.map((r) => (
                  <li key={r.id} className="d-flex justify-content-between gap-2 py-1 border-bottom">
                    <span className="text-truncate">{r.name}</span>
                    <span className="text-nowrap text-muted">
                      {r.status === 'uploading' ? `${r.progress}%` : null}
                      {r.status === 'done' ? 'Done' : null}
                      {r.status === 'error' ? <span className="text-danger">{r.error}</span> : null}
                      {r.status === 'pending' ? '…' : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={uploading} onClick={() => setUploadOpen(false)}>
            {uploadQueue.some((r) => r.status === 'done' || r.status === 'error') ? 'Close' : 'Cancel'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={!!viewer} onHide={() => setViewer(null)} size="xl" centered scrollable>
        <Modal.Header className="border-0 pb-0">
          <Modal.Title className="text-truncate me-auto">{viewer?.name}</Modal.Title>
          <CloseButton onClick={() => setViewer(null)} />
        </Modal.Header>
        <Modal.Body className="pt-2">
          {viewer && viewerKind === 'image' ? (
            <div className="text-center bg-dark bg-opacity-10 rounded p-2">
              <img src={viewerUrl} alt={viewer.name} className="img-fluid rounded" style={{ maxHeight: '75vh' }} />
            </div>
          ) : null}
          {viewer && viewerKind === 'video' ? (
            <video key={viewer.$id} controls className="w-100 rounded" style={{ maxHeight: '75vh' }} src={viewerUrl} />
          ) : null}
          {viewer && viewerKind === 'pdf' ? (
            <div className="border rounded overflow-hidden" style={{ minHeight: '70vh' }}>
              <iframe title={viewer.name} src={viewerUrl} className="w-100 border-0" style={{ minHeight: '70vh' }} />
            </div>
          ) : null}
          {viewer && viewerKind === 'other' ? (
            <Alert variant="secondary" className="mb-0">
              <TbFileTypePdf className="me-2" aria-hidden />
              No inline preview for this type.{' '}
              <Button variant="outline-primary" size="sm" href={viewerUrl} target="_blank" rel="noreferrer">
                Open file
              </Button>
            </Alert>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  )
}

export default MediaLibraryTab
