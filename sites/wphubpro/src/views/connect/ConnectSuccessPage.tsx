/**
 * WordPress bridge OAuth / connect callback: completes the site row and syncs credentials back to WordPress.
 *
 * Query params (new flow): `site_url`, `site_name` (WordPress blog name), `user_login`, `connect_token` (exchanged for bridge_secret on the site).
 * Legacy: `site_url`, `user_login`, `api_key` (bridge secret already known).
 */
import { ROUTE_PATHS } from '@/config/routePaths'
import { useAuth } from '@/domains/auth'
import { useAddSite, useSites, useUpdateSite } from '@/domains/sites'
import { mapSiteDocumentToSite } from '@/domains/sites/mappers'
import { sitesListQueries } from '@/domains/sites/queries'
import { useSetActiveWorkspace, useWorkspaceContext } from '@/domains/workspace'
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  COLLECTIONS,
  DATABASE_ID,
  databases,
  teams,
} from '@/services/appwrite'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Container, Form, Modal, Spinner } from 'react-bootstrap'
import { TbAlertTriangle, TbCircleCheck, TbLogout } from 'react-icons/tb'
import { useNavigate, useSearchParams } from 'react-router'

async function exchangeToken(siteUrl: string, connectToken: string): Promise<string> {
  const base = siteUrl.replace(/\/$/, '')
  const url = `${base}/wp-json/wphubpro/v1/exchange-token?connect_token=${encodeURIComponent(connectToken)}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string })?.message || `Token exchange failed: ${res.status}`)
  }
  const data = (await res.json()) as { bridge_secret?: string }
  if (!data?.bridge_secret) throw new Error('No bridge_secret in response')
  return data.bridge_secret
}

/** Push Hub connection metadata back to WordPress so the bridge can send heartbeats, etc. */
async function saveConnectionToWordPress(
  siteUrl: string,
  bridgeSecret: string,
  siteId: string,
  siteSecret?: string,
  encryptedApiKey?: string,
  wpAdminUsername?: string,
): Promise<void> {
  const base = siteUrl.replace(/\/$/, '')
  const url = `${base}/wp-json/wphubpro/v1/save-connection`
  try {
    const body: Record<string, unknown> = {
      bridge_secret: bridgeSecret,
      endpoint: APPWRITE_ENDPOINT,
      project_id: APPWRITE_PROJECT_ID,
      site_id: siteId,
    }
    if (siteSecret) body.site_secret = siteSecret
    if (encryptedApiKey) body.encrypted_api_key = encryptedApiKey
    if (wpAdminUsername?.trim()) body.username = wpAdminUsername.trim()
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WPHub-Key': bridgeSecret,
      },
      body: JSON.stringify(body),
    })
  } catch {
    /* Non-fatal: hub ↔ Appwrite connection still works */
  }
}

const normalizeUrl = (url: string) => {
  const s = (url || '').trim()
  if (!s) return ''
  try {
    return s.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  } catch {
    return s
  }
}

export default function ConnectSuccessPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const wsCtx = useWorkspaceContext()
  const setActiveWs = useSetActiveWorkspace()
  const queryClient = useQueryClient()
  const { isLoading: sitesLoading } = useSites()
  const addSite = useAddSite()
  const updateSite = useUpdateSite()

  const flowStartedRef = useRef(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [exchangeBusy, setExchangeBusy] = useState(false)
  const [pendingBridgeSecret, setPendingBridgeSecret] = useState<string | null>(null)
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false)
  const [workspaceChoice, setWorkspaceChoice] = useState<'personal' | string>('personal')
  const [workspaceSwitchError, setWorkspaceSwitchError] = useState<string | null>(null)

  const siteUrl = searchParams.get('site_url') || ''
  const siteNameFromBridge = (searchParams.get('site_name') || '').trim()
  const userLogin = searchParams.get('user_login') || ''
  const connectToken = searchParams.get('connect_token') || ''
  const apiKeyLegacy = searchParams.get('api_key') || ''

  const displaySiteLabel = (() => {
    if (siteNameFromBridge) return siteNameFromBridge
    const s = siteUrl.trim()
    if (!s) return ''
    try {
      const u = s.startsWith('http') ? s : `https://${s}`
      return new URL(u).hostname || s
    } catch {
      return s
    }
  })()

  const teamsQuery = useQuery({
    queryKey: ['connect-workspace-teams', user?.$id],
    queryFn: async () => {
      const res = await teams.list({ total: false })
      return res.teams ?? []
    },
    enabled: Boolean(user && showWorkspaceModal),
    staleTime: 120_000,
  })

  const teamOptions = useMemo(() => {
    return (teamsQuery.data ?? []).map((t) => ({ id: t.$id, name: t.name?.trim() || t.$id }))
  }, [teamsQuery.data])

  useEffect(() => {
    if (!showWorkspaceModal || !teamOptions.length) return
    const ids = new Set(teamOptions.map((t) => t.id))
    if (workspaceChoice !== 'personal' && !ids.has(workspaceChoice)) {
      setWorkspaceChoice('personal')
    }
  }, [showWorkspaceModal, teamOptions, workspaceChoice])

  useEffect(() => {
    setWorkspaceSwitchError(null)
  }, [workspaceChoice])

  useEffect(() => {
    if (flowStartedRef.current || sitesLoading || !user) return
    if (!siteUrl || (!connectToken && !apiKeyLegacy)) return

    const normalized = normalizeUrl(siteUrl)
    if (!normalized) return

    flowStartedRef.current = true

    const fullSiteUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`

    void (async () => {
      try {
        let secret = apiKeyLegacy
        if (connectToken) {
          setExchangeBusy(true)
          secret = await exchangeToken(fullSiteUrl, connectToken)
          setExchangeBusy(false)
        }
        setPendingBridgeSecret(secret)
        if (wsCtx.mode === 'team' && wsCtx.activeTeamId) {
          setWorkspaceChoice(wsCtx.activeTeamId)
        } else {
          setWorkspaceChoice('personal')
        }
        setShowWorkspaceModal(true)
      } catch (err: unknown) {
        setExchangeBusy(false)
        const msg = err instanceof Error ? err.message : 'Token exchange failed'
        setTokenError(msg)
      }
    })()
  }, [user, sitesLoading, siteUrl, connectToken, apiKeyLegacy, wsCtx.mode, wsCtx.activeTeamId])

  const fullSiteUrlMemo = useMemo(
    () => (siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`),
    [siteUrl],
  )

  const attachPayload = useMemo(() => {
    if (workspaceChoice === 'personal') {
      return { attachWorkspace: 'personal' as const }
    }
    return { attachWorkspace: 'team' as const, attachTeamId: workspaceChoice }
  }, [workspaceChoice])

  const ensureWorkspaceMatchesChoice = useCallback(async () => {
    const desiredTeamId: string | null = workspaceChoice === 'personal' ? null : workspaceChoice
    const currentTeamId = wsCtx.activeTeamId
    if (desiredTeamId === currentTeamId) return
    await setActiveWs.mutateAsync({
      activeTeamId: desiredTeamId,
      skipDashboardRedirect: true,
    })
  }, [workspaceChoice, wsCtx.activeTeamId, setActiveWs])

  const handleConfirmWorkspace = useCallback(async () => {
    if (!pendingBridgeSecret || !user) return

    setWorkspaceSwitchError(null)
    try {
      await ensureWorkspaceMatchesChoice()
    } catch (err: unknown) {
      setWorkspaceSwitchError(err instanceof Error ? err.message : 'Could not switch workspace.')
      return
    }

    const workspaceQueryKey =
      workspaceChoice === 'personal' ? 'personal' : `team:${workspaceChoice}`

    const sitesList = await queryClient.fetchQuery({
      queryKey: ['sites', user.$id, workspaceQueryKey],
      queryFn: async () => {
        const uid = user.$id
        if (!uid) return []
        const mode = workspaceChoice !== 'personal' ? 'team' : 'personal'
        const teamId = mode === 'team' ? workspaceChoice : null
        const queries = sitesListQueries(mode, uid, teamId)
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SITES, queries)
        return response.documents.map((doc) => mapSiteDocumentToSite(doc as Record<string, unknown>))
      },
    })

    const normalized = normalizeUrl(siteUrl)
    const existing = sitesList.find((s) => {
      const existingNorm = normalizeUrl(s.siteUrl || '')
      return existingNorm && existingNorm === normalized
    })

    const siteName =
      siteNameFromBridge ||
      (() => {
        try {
          return new URL(fullSiteUrlMemo).hostname || siteUrl
        } catch {
          return siteUrl
        }
      })()

    const goSites = () => navigate(ROUTE_PATHS.SITES, { replace: true })
    const goSiteDetail = (siteId: string) => navigate(ROUTE_PATHS.siteDetailPath(siteId), { replace: true })

    setShowWorkspaceModal(false)

    if (existing) {
      updateSite.mutate(
        {
          siteId: existing.$id,
          apiKey: pendingBridgeSecret,
          ...(siteNameFromBridge ? { siteName: siteNameFromBridge } : {}),
          ...attachPayload,
        },
        {
          onSuccess: (data) => {
            const siteSecret = data.siteSecret ?? data.site_secret
            const encryptedKey = data.encrypted_api_key
            void saveConnectionToWordPress(
              fullSiteUrlMemo,
              pendingBridgeSecret,
              existing.$id,
              siteSecret,
              encryptedKey,
            ).then(() => goSiteDetail(existing.$id))
          },
          onError: () => {},
        },
      )
    } else {
      addSite.mutate(
        {
          siteUrl: siteUrl.replace(/\/$/, ''),
          siteName,
          username: userLogin || undefined,
          apiKey: pendingBridgeSecret,
          ...attachPayload,
        },
        {
          onSuccess: (data) => {
            const newSiteId = data?.$id
            const siteSecret = data.siteSecret ?? data.site_secret
            const encryptedKey = data.encrypted_api_key
            if (newSiteId) {
              void saveConnectionToWordPress(
                fullSiteUrlMemo,
                pendingBridgeSecret,
                newSiteId,
                siteSecret,
                encryptedKey,
                userLogin || undefined,
              ).then(() => goSiteDetail(newSiteId))
            } else {
              goSites()
            }
          },
          onError: () => {},
        },
      )
    }
  }, [
    pendingBridgeSecret,
    user,
    siteUrl,
    siteNameFromBridge,
    fullSiteUrlMemo,
    userLogin,
    workspaceChoice,
    attachPayload,
    navigate,
    queryClient,
    updateSite,
    addSite,
    ensureWorkspaceMatchesChoice,
  ])

  if (sitesLoading || !user || exchangeBusy) {
    return (
      <Container className="py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '50vh' }}>
        <Spinner animation="border" role="status" variant="primary" className="mb-3" />
        <p className="text-muted small mb-0">{exchangeBusy ? 'Verifying connection…' : 'Loading your sites…'}</p>
      </Container>
    )
  }

  if (!siteUrl || (!connectToken && !apiKeyLegacy)) {
    return (
      <Container className="py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '50vh' }}>
        <TbAlertTriangle className="text-warning mb-3" size={48} aria-hidden />
        <p className="fw-medium mb-1">Invalid callback</p>
        <p className="text-muted small mb-3 text-center">Missing site_url or connect_token / api_key.</p>
        <Button variant="primary" size="sm" onClick={() => navigate(ROUTE_PATHS.DASHBOARD)}>
          Back to dashboard
        </Button>
      </Container>
    )
  }

  if (tokenError) {
    return (
      <Container className="py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '50vh' }}>
        <TbLogout className="text-danger mb-3" size={48} aria-hidden />
        <p className="fw-medium mb-1">Token exchange failed</p>
        <p className="text-muted small mb-3 text-center">{tokenError}</p>
        <Button variant="primary" size="sm" onClick={() => navigate(ROUTE_PATHS.DASHBOARD)}>
          Back to dashboard
        </Button>
      </Container>
    )
  }

  const isPending = addSite.isPending || updateSite.isPending
  const isError = addSite.isError || updateSite.isError

  if (isError) {
    const err = addSite.error || updateSite.error
    return (
      <Container className="py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '50vh' }}>
        <TbLogout className="text-danger mb-3" size={48} aria-hidden />
        <p className="fw-medium mb-1">Connection failed</p>
        <p className="text-muted small mb-3 text-center">{err?.message}</p>
        <Button variant="primary" size="sm" onClick={() => navigate(ROUTE_PATHS.SITES)}>
          View sites
        </Button>
      </Container>
    )
  }

  return (
    <>
      <Modal
        show={showWorkspaceModal}
        onHide={() => {}}
        backdrop="static"
        keyboard={false}
        centered
        aria-labelledby="connect-workspace-title"
      >
        <Modal.Header>
          <Modal.Title id="connect-workspace-title">Choose workspace</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Link this site to your personal workspace or to a team you belong to. You can change this later from site settings
            when supported.
          </p>
          {teamsQuery.isLoading ? (
            <div className="d-flex align-items-center gap-2 text-muted py-2">
              <Spinner animation="border" size="sm" role="status" />
              <span className="fs-sm">Loading teams…</span>
            </div>
          ) : null}
          <Form.Group className="d-flex flex-column gap-2">
            <Form.Check
              type="radio"
              id="connect-ws-personal"
              name="connect-workspace"
              label="Personal workspace"
              checked={workspaceChoice === 'personal'}
              onChange={() => setWorkspaceChoice('personal')}
            />
            {teamOptions.map((t) => (
              <Form.Check
                key={t.id}
                type="radio"
                id={`connect-ws-team-${t.id}`}
                name="connect-workspace"
                label={`Team: ${t.name}`}
                checked={workspaceChoice === t.id}
                onChange={() => setWorkspaceChoice(t.id)}
              />
            ))}
          </Form.Group>
          {teamOptions.length === 0 && !teamsQuery.isLoading ? (
            <p className="text-muted fs-xs mb-0 mt-2">You are not a member of any team yet. Use personal workspace or create a team in the Hub.</p>
          ) : null}
          {workspaceSwitchError ? (
            <Alert variant="danger" className="small mb-0 mt-3 py-2">
              {workspaceSwitchError}
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="d-flex align-items-center gap-2">
          {setActiveWs.isPending ? <Spinner animation="border" size="sm" role="status" /> : null}
          <Button
            variant="primary"
            onClick={() => void handleConfirmWorkspace()}
            disabled={!pendingBridgeSecret || setActiveWs.isPending}
          >
            Continue
          </Button>
        </Modal.Footer>
      </Modal>

      <Container className="py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '50vh' }}>
        {isPending ? (
          <Spinner animation="border" role="status" variant="primary" className="mb-3" style={{ width: '3rem', height: '3rem' }} />
        ) : showWorkspaceModal ? (
          <Spinner animation="border" role="status" variant="secondary" className="mb-3" />
        ) : (
          <TbCircleCheck className="text-success mb-3" size={48} aria-hidden />
        )}
        <p className="fw-medium mb-1">
          {isPending ? 'Linking site…' : showWorkspaceModal ? 'Choose workspace' : 'Site linked'}
          {displaySiteLabel ? (
            <>
              {' '}
              <span className="text-body-secondary fw-normal">({displaySiteLabel})</span>
            </>
          ) : null}
        </p>
        <p className="text-muted small">
          {isPending
            ? 'Saving connection…'
            : showWorkspaceModal
              ? 'Pick where this site should live, then continue.'
              : 'Redirecting to your site.'}
        </p>
      </Container>
    </>
  )
}
