import { DocHelpButton } from '@/components/docs/DocHelpButton';
import PageBreadcrumb from '@/components/PageBreadcrumb.tsx';
import PageMetaData from '@/components/PageMetaData';
import {
  PLATFORM_BS_THEME_OPTIONS,
  PLATFORM_HUB_SKIN_OPTIONS,
  PLATFORM_LAYOUT_POSITION_OPTIONS,
  PLATFORM_LAYOUT_WIDTH_OPTIONS,
  PLATFORM_MENU_COLOR_OPTIONS,
  PLATFORM_SIDENAV_SIZE_OPTIONS,
  PLATFORM_TOPBAR_COLOR_OPTIONS,
} from '@/config/platformHubLayoutOptions';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import { startBridgeForceUpdateAllSites } from '@/domains/bridge/bridgeForceUpdate';
import { normalizePublicHubLayout, type PublicHubLayoutPayload } from '@/domains/platform/publicHubLayoutApi';
import {
  usePlatformSettingsList,
  usePlatformSettingsUpsert,
  useBridgeReleasedVersionsForAdmin,
  type BridgeReleasedVersionRow,
  type PlatformSettingItem,
} from './usePlatformSettings';
import { BrandingUrlPreview } from '@/views/admin/settings/BrandingUrlPreview';
import MediaLibraryImagePickerModal from '@/components/admin/MediaLibraryImagePickerModal';
import MediaLibraryTab from '@/views/admin/settings/MediaLibraryTab';
import AdminToolsTab from '@/views/admin/settings/AdminToolsTab';
import AdminWorkspaceInboxTab from '@/views/admin/settings/AdminWorkspaceInboxTab';
import AdminApiTab from '@/views/admin/settings/AdminApiTab';
import { useStripePlans } from '@/domains/billing/hooks';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  InputGroup,
  Modal,
  Nav,
  Row,
  Spinner,
  Tab,
} from 'react-bootstrap';
import Select, {
  type CSSObjectWithLabel,
  type GroupBase,
  type SingleValue,
} from 'react-select';
import type { StripePlan, StripePlanAllPrice } from '@/types';
import { useNavigate } from 'react-router';
function recordFromValue(v: unknown): Record<string, string> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(o)) {
      if (k.startsWith('_')) continue;
      out[k] = val == null ? '' : String(val);
    }
    return out;
  }
  return {};
}

function formatPlanMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function isRecurringStripePrice(p: Pick<StripePlanAllPrice, 'interval'>): boolean {
  return p.interval !== 'one_time';
}

function catalogPriceIdSet(plans: StripePlan[]): Set<string> {
  const s = new Set<string>();
  for (const p of plans) {
    for (const ap of p.allPrices ?? []) {
      if (isRecurringStripePrice(ap)) s.add(ap.id);
    }
    if (p.monthlyPriceId) s.add(p.monthlyPriceId);
    if (p.yearlyPriceId) s.add(p.yearlyPriceId);
  }
  return s;
}

function monthYearFallbackPrices(plan: StripePlan): StripePlanAllPrice[] {
  const out: StripePlanAllPrice[] = [];
  if (plan.monthlyPriceId) {
    out.push({
      id: plan.monthlyPriceId,
      amount: plan.monthlyPrice,
      currency: plan.currency,
      interval: 'month',
      interval_count: 1,
    });
  }
  if (plan.yearlyPriceId) {
    out.push({
      id: plan.yearlyPriceId,
      amount: plan.yearlyPrice,
      currency: plan.currency,
      interval: 'year',
      interval_count: 1,
    });
  }
  return out;
}

/** Recurring prices for the dropdown: prefer `allPrices` from Stripe; else monthly/yearly. */
function recurringPricesForSelect(plan: StripePlan): StripePlanAllPrice[] {
  const fromAll = (plan.allPrices ?? []).filter(isRecurringStripePrice);
  const list = fromAll.length > 0 ? fromAll : monthYearFallbackPrices(plan);
  const byId = new Map<string, StripePlanAllPrice>();
  for (const row of list) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function formatBridgeVersionOptionLabel(row: BridgeReleasedVersionRow): string {
  const v = row.version;
  const raw = String(row.created_at || '').trim();
  if (!raw) {
    return row.file_id ? v : `${v} (not found in bridge table)`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return row.file_id ? `${v} · ${raw}` : `${v} (not found in bridge table)`;
  }
  const datePart = d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  return row.file_id ? `${v} · ${datePart}` : `${v} · ${datePart} (not found in bridge table)`;
}

function formatRecurringIntervalLabel(interval: string, intervalCount: number): string {
  if (interval === 'one_time') return 'One-time';
  const n = intervalCount > 1 ? intervalCount : 1;
  if (interval === 'month') {
    return n === 1 ? 'Monthly' : `Every ${n} months`;
  }
  if (interval === 'year') {
    return n === 1 ? 'Yearly' : `Every ${n} years`;
  }
  if (interval === 'week') {
    return n === 1 ? 'Weekly' : `Every ${n} weeks`;
  }
  if (interval === 'day') {
    return n === 1 ? 'Daily' : `Every ${n} days`;
  }
  return n === 1 ? interval : `Every ${n} ${interval}`;
}

type StripePriceSelectOption = { value: string; label: string };

const signupPlanMenuPortalStyles = {
  menuPortal: (base: CSSObjectWithLabel) => ({ ...base, zIndex: 2000 }),
};

function findStripePriceSelectValue(
  groups: GroupBase<StripePriceSelectOption>[],
  priceId: string,
): StripePriceSelectOption | null {
  for (const g of groups) {
    for (const o of g.options) {
      if (o.value === priceId) return o;
    }
  }
  return null;
}

function boolFromAuthRecord(v: Record<string, string>, key: string, defaultVal: boolean): boolean {
  const s = v[key];
  if (s === undefined || s === '') return defaultVal;
  const t = s.toLowerCase();
  if (t === 'true' || t === '1') return true;
  if (t === 'false' || t === '0') return false;
  return defaultVal;
}

const AdminPlatformSettingsPage = () => {
  const { isAdmin } = useAuth();
  const { mode } = useDashboardNav();
  const navigate = useNavigate();
  const { showNotification } = useNotificationContext();
  const { data: items = [], isLoading, isError, error, refetch } = usePlatformSettingsList();
  const { data: bridgeVersions = [], isLoading: bridgeVersionsLoading } = useBridgeReleasedVersionsForAdmin();
  const upsert = usePlatformSettingsUpsert();
  const {
    data: stripePlans = [],
    isLoading: plansLoading,
    isError: plansError,
    error: plansQueryError,
  } = useStripePlans(undefined, { listAllProducts: true });

  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Region, setS3Region] = useState('');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');

  const [activeBridgeVersion, setActiveBridgeVersion] = useState('');
  const [bridgeActiveSetAt, setBridgeActiveSetAt] = useState('');

  const [stripeDefaultPriceId, setStripeDefaultPriceId] = useState('');

  const [forceMfaForAllUsers, setForceMfaForAllUsers] = useState(false);
  const [mfaOtpMailEnabled, setMfaOtpMailEnabled] = useState(true);
  const [mfaAuthenticatorEnabled, setMfaAuthenticatorEnabled] = useState(true);

  const [platformTitle, setPlatformTitle] = useState('');
  const [platformSlogan, setPlatformSlogan] = useState('');
  const [logoUrlLight, setLogoUrlLight] = useState('');
  const [logoUrlDark, setLogoUrlDark] = useState('');
  const [iconUrlLight, setIconUrlLight] = useState('');
  const [iconUrlDark, setIconUrlDark] = useState('');
  const [brandingPicker, setBrandingPicker] = useState<
    null | 'logoLight' | 'logoDark' | 'iconLight' | 'iconDark'
  >(null);
  const [bridgeForceModalOpen, setBridgeForceModalOpen] = useState(false);
  const [bridgeForceStarting, setBridgeForceStarting] = useState(false);

  const [hubLayout, setHubLayout] = useState<PublicHubLayoutPayload>(() => normalizePublicHubLayout(undefined));

  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
      return;
    }
    if (mode !== 'admin') {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
    }
  }, [isAdmin, mode, navigate]);

  useEffect(() => {
    if (!items.length) return;
    const map = new Map(items.map((i: PlatformSettingItem) => [i.key, i.value]));
    const s3 = recordFromValue(map.get('s3'));
    setS3Bucket(s3.bucket ?? '');
    setS3Region(s3.region ?? '');
    setS3AccessKey(s3.accessKey ?? '');
    setS3SecretKey(s3.secretKey ?? '');

    const bridge = recordFromValue(map.get('bridge_plugin'));
    setActiveBridgeVersion((bridge.version || bridge.active_version || '').trim());
    setBridgeActiveSetAt((bridge.active_set_at || bridge.uploaded_at || '').trim());

    const stripe = recordFromValue(map.get('stripe_signup_plan'));
    setStripeDefaultPriceId(stripe.defaultSignupPlanPriceId ?? '');

    const auth = recordFromValue(map.get('auth'));
    setForceMfaForAllUsers(boolFromAuthRecord(auth, 'forceMfaForAllUsers', false));
    setMfaOtpMailEnabled(boolFromAuthRecord(auth, 'mfaOtpMailEnabled', true));
    setMfaAuthenticatorEnabled(boolFromAuthRecord(auth, 'mfaAuthenticatorEnabled', true));

    const pb = recordFromValue(map.get('platform_branding'));
    setPlatformTitle(pb.platformTitle ?? '');
    setPlatformSlogan(pb.platformSlogan ?? '');
    setLogoUrlLight(pb.logoUrlLight ?? '');
    setLogoUrlDark(pb.logoUrlDark ?? '');
    setIconUrlLight(pb.iconUrlLight ?? '');
    setIconUrlDark(pb.iconUrlDark ?? '');

    const hubRaw = map.get('platform_hub_layout');
    setHubLayout(
      normalizePublicHubLayout(
        hubRaw && typeof hubRaw === 'object' && !Array.isArray(hubRaw)
          ? (hubRaw as Partial<PublicHubLayoutPayload>)
          : undefined,
      ),
    );
  }, [items]);

  const catalogPriceIds = useMemo(() => catalogPriceIdSet(stripePlans), [stripePlans]);

  const bridgeVersionSelectOptions = useMemo(() => {
    const rows = [...bridgeVersions];
    const have = new Set(rows.map((r) => r.version));
    if (activeBridgeVersion && !have.has(activeBridgeVersion)) {
      rows.unshift({ version: activeBridgeVersion, file_id: '', document_id: '', created_at: '' });
    }
    return rows;
  }, [bridgeVersions, activeBridgeVersion]);

  const bridgeLastPublished = useMemo(() => {
    const top = bridgeVersions[0];
    if (!top?.version) return null;
    return { version: top.version, created_at: top.created_at ?? '' };
  }, [bridgeVersions]);

  const activeBridgeRow = useMemo(
    () => bridgeVersions.find((r) => r.version === activeBridgeVersion.trim()),
    [bridgeVersions, activeBridgeVersion],
  );

  const orphanSignupPriceId = useMemo(() => {
    const id = stripeDefaultPriceId.trim();
    if (!id || catalogPriceIds.has(id)) return '';
    return id;
  }, [stripeDefaultPriceId, catalogPriceIds]);

  const stripeSignupGroupedOptions = useMemo((): GroupBase<StripePriceSelectOption>[] => {
    const generalOptions: StripePriceSelectOption[] = [
      {
        value: '',
        label: 'None — no automatic subscription for new signups',
      },
    ];
    if (orphanSignupPriceId) {
      generalOptions.push({
        value: orphanSignupPriceId,
        label: `Current (not in catalog): ${orphanSignupPriceId}`,
      });
    }
    const planGroups: GroupBase<StripePriceSelectOption>[] = stripePlans.reduce(
      (acc, plan) => {
        const rows = recurringPricesForSelect(plan);
        if (rows.length === 0) return acc;
        acc.push({
          label: plan.name,
          options: rows.map((row) => ({
            value: row.id,
            label: `${plan.name} · ${formatRecurringIntervalLabel(row.interval, row.interval_count)} · ${formatPlanMoney(row.amount, row.currency)}`,
          })),
        });
        return acc;
      },
      [] as GroupBase<StripePriceSelectOption>[],
    );

    return [{ label: 'Default', options: generalOptions }, ...planGroups];
  }, [stripePlans, orphanSignupPriceId]);

  const stripeSignupSelectValue = useMemo(
    () => findStripePriceSelectValue(stripeSignupGroupedOptions, stripeDefaultPriceId),
    [stripeSignupGroupedOptions, stripeDefaultPriceId],
  );

  const notifyError = (err: unknown) => {
    showNotification({
      title: 'Error',
      message: err instanceof Error ? err.message : 'Something went wrong',
      variant: 'danger',
    });
  };

  const confirmBridgeForceUpdate = async () => {
    setBridgeForceStarting(true);
    try {
      await startBridgeForceUpdateAllSites();
      showNotification({
        title: 'Started',
        message:
          'Bridge force-update is running in the background for all sites (batched, no per-site results in the hub).',
        variant: 'success',
      });
      setBridgeForceModalOpen(false);
    } catch (err) {
      notifyError(err);
    } finally {
      setBridgeForceStarting(false);
    }
  };

  const saveS3 = async () => {
    try {
      await upsert.mutateAsync({
        category: 's3',
        settings: {
          bucket: s3Bucket.trim(),
          region: s3Region.trim(),
          accessKey: s3AccessKey.trim(),
          secretKey: s3SecretKey.trim(),
        },
      });
      showNotification({
        title: 'Saved',
        message: 'S3 settings were updated.',
        variant: 'success',
      });
    } catch (err) {
      notifyError(err);
    }
  };

  const saveBridge = async () => {
    try {
      await upsert.mutateAsync({
        category: 'bridge_plugin',
        settings: {
          version: activeBridgeVersion.trim(),
        },
      });
      showNotification({
        title: 'Saved',
        message: 'Active bridge version was updated.',
        variant: 'success',
      });
    } catch (err) {
      notifyError(err);
    }
  };

  const saveStripe = async () => {
    try {
      await upsert.mutateAsync({
        category: 'stripe_signup_plan',
        settings: {
          defaultSignupPlanPriceId: stripeDefaultPriceId.trim(),
        },
      });
      showNotification({
        title: 'Saved',
        message: 'Stripe signup plan settings were updated.',
        variant: 'success',
      });
    } catch (err) {
      notifyError(err);
    }
  };

  const saveAuth = async () => {
    try {
      await upsert.mutateAsync({
        category: 'auth',
        settings: {
          forceMfaForAllUsers,
          mfaOtpMailEnabled,
          mfaAuthenticatorEnabled,
        },
      });
      showNotification({
        title: 'Saved',
        message: 'Security settings were updated.',
        variant: 'success',
      });
    } catch (err) {
      notifyError(err);
    }
  };

  const saveBranding = async () => {
    try {
      await upsert.mutateAsync({
        category: 'platform_branding',
        settings: {
          platformTitle: platformTitle.trim(),
          platformSlogan: platformSlogan.trim(),
          logoUrlLight: logoUrlLight.trim(),
          logoUrlDark: logoUrlDark.trim(),
          iconUrlLight: iconUrlLight.trim(),
          iconUrlDark: iconUrlDark.trim(),
        },
      });
      showNotification({
        title: 'Saved',
        message: 'Platform name, slogan, and images were updated.',
        variant: 'success',
      });
    } catch (err) {
      notifyError(err);
    }
  };

  const saveHubLayout = async () => {
    try {
      await upsert.mutateAsync({
        category: 'platform_hub_layout',
        settings: {
          skin: hubLayout.skin,
          theme: hubLayout.theme,
          topBarColor: hubLayout.topBarColor,
          menuColor: hubLayout.menuColor,
          sidenavSize: hubLayout.sidenavSize,
          sidenavUser: hubLayout.sidenavUser,
          layoutPosition: hubLayout.layoutPosition,
          layoutWidth: hubLayout.layoutWidth,
        },
      });
      showNotification({
        title: 'Saved',
        message: 'Hub shell layout was updated. All users pick this up on the next page load.',
        variant: 'success',
      });
    } catch (err) {
      notifyError(err);
    }
  };

  if (!isAdmin || mode !== 'admin') {
    return null;
  }

  return (
    <>
      <PageMetaData title="Platform settings · Admin" />
      <Container fluid>
        <PageBreadcrumb
          title="Platform settings"
          subtitle="Admin · platform configuration"
          titleEnd={<DocHelpButton contextKey="admin:settings" />}
        />

        {isLoading && (
          <div className="d-flex align-items-center gap-2 text-muted py-4">
            <Spinner animation="border" size="sm" role="status" />
            Loading settings…
          </div>
        )}

        {isError && !isLoading && (
          <Card className="border border-danger">
            <Card.Body>
              <Card.Title as="h5" className="text-danger">
                Could not load settings
              </Card.Title>
              <Card.Text className="mb-3">
                {error instanceof Error ? error.message : 'Unknown error'}
              </Card.Text>
              <Button variant="outline-primary" type="button" onClick={() => refetch()}>
                Retry
              </Button>
            </Card.Body>
          </Card>
        )}

        {!isLoading && !isError && (
          <Tab.Container defaultActiveKey="general">
            <Nav variant="tabs" className="mb-0 flex-wrap">
              <Nav.Item>
                <Nav.Link eventKey="general">General</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="bridge">Bridge</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="storage">Storage</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="api">API</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="security">Security</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="financial">Financial</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="media-library">Media library</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="admin-inbox">Admin inbox</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="tools">Tools</Nav.Link>
              </Nav.Item>
            </Nav>
            <Tab.Content>
              <Tab.Pane eventKey="general">
                <Row>
                  <Col lg={10} style={{ width: 'fit-content' }} xl={8}>
                    <Card className="border">
                      <Card.Body className="w-100">
                        <Card.Title as="h5">General · branding</Card.Title>
                        <Card.Text className="text-muted small">
                          Title, slogan, and logos shown across the hub. Empty image fields keep the built-in WP Hub Pro
                          assets. Icons are used for the compact sidebar and browser tab; wordmarks when the sidebar or
                          top bar is expanded.
                        </Card.Text>
                        <Form.Group className="mb-2">
                          <Form.Label>Platform title</Form.Label>
                          <Form.Control
                            value={platformTitle}
                            onChange={(e) => setPlatformTitle(e.target.value)}
                            placeholder="Shown in breadcrumbs and browser title suffix"
                            autoComplete="off"
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Platform slogan</Form.Label>
                          <Form.Control
                            value={platformSlogan}
                            onChange={(e) => setPlatformSlogan(e.target.value)}
                            placeholder="Optional subtitle (e.g. next to the top bar logo on wide screens)"
                            autoComplete="off"
                          />
                        </Form.Group>

                        <p className="text-muted small fw-semibold mb-2">Wordmark (expanded logo)</p>
                        <Form.Group className="mb-2">
                          <Form.Label>Logo URL · light chrome</Form.Label>
                          <InputGroup>
                            <Form.Control
                              value={logoUrlLight}
                              onChange={(e) => setLogoUrlLight(e.target.value)}
                              placeholder="HTTPS image URL"
                              autoComplete="off"
                            />
                            <Button type="button" variant="outline-secondary" onClick={() => setBrandingPicker('logoLight')}>
                              Select from library
                            </Button>
                          </InputGroup>
                          <BrandingUrlPreview url={logoUrlLight} maxHeight={48} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Logo URL · dark chrome</Form.Label>
                          <InputGroup>
                            <Form.Control
                              value={logoUrlDark}
                              onChange={(e) => setLogoUrlDark(e.target.value)}
                              placeholder="HTTPS image URL"
                              autoComplete="off"
                            />
                            <Button type="button" variant="outline-secondary" onClick={() => setBrandingPicker('logoDark')}>
                              Select from library
                            </Button>
                          </InputGroup>
                          <BrandingUrlPreview url={logoUrlDark} maxHeight={48} />
                        </Form.Group>

                        <p className="text-muted small fw-semibold mb-2">Icon (compact sidebar &amp; favicon)</p>
                        <Form.Group className="mb-2">
                          <Form.Label>Icon URL · light scheme</Form.Label>
                          <InputGroup>
                            <Form.Control
                              value={iconUrlLight}
                              onChange={(e) => setIconUrlLight(e.target.value)}
                              placeholder="HTTPS image URL (square works best)"
                              autoComplete="off"
                            />
                            <Button type="button" variant="outline-secondary" onClick={() => setBrandingPicker('iconLight')}>
                              Select from library
                            </Button>
                          </InputGroup>
                          <Form.Text muted>Used as favicon when the OS prefers light mode (when both icon URLs are set).</Form.Text>
                          <BrandingUrlPreview url={iconUrlLight} maxHeight={40} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Icon URL · dark scheme</Form.Label>
                          <InputGroup>
                            <Form.Control
                              value={iconUrlDark}
                              onChange={(e) => setIconUrlDark(e.target.value)}
                              placeholder="HTTPS image URL (square works best)"
                              autoComplete="off"
                            />
                            <Button type="button" variant="outline-secondary" onClick={() => setBrandingPicker('iconDark')}>
                              Select from library
                            </Button>
                          </InputGroup>
                          <Form.Text muted>Favicon for <code className="user-select-all">prefers-color-scheme: dark</code> when both icons are set.</Form.Text>
                          <BrandingUrlPreview url={iconUrlDark} maxHeight={40} />
                        </Form.Group>

                        <Button variant="primary" type="button" disabled={upsert.isPending} onClick={() => void saveBranding()}>
                          {upsert.isPending ? 'Saving…' : 'Save branding'}
                        </Button>
                      </Card.Body>
                    </Card>

                    <Card className="border mt-3">
                      <Card.Body>
                        <Card.Title as="h5">General · hub shell (layout)</Card.Title>
                        <Card.Text className="text-muted small">
                          Default theme, colors, and layout for all users. Changes apply after save and on the next page
                          load. The in-app customizer can still override layout for the current session only.
                        </Card.Text>
                        <Row className="g-3">
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>Platform skin</Form.Label>
                              <Form.Select
                                value={hubLayout.skin}
                                onChange={(e) =>
                                  setHubLayout((h) => ({ ...h, skin: e.target.value as PublicHubLayoutPayload['skin'] }))
                                }
                                aria-label="Platform skin theme">
                                {PLATFORM_HUB_SKIN_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-bs-theme</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.theme}
                                onChange={(e) =>
                                  setHubLayout((h) => ({ ...h, theme: e.target.value as PublicHubLayoutPayload['theme'] }))
                                }
                                aria-label="Bootstrap color mode">
                                {PLATFORM_BS_THEME_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-topbar-color</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.topBarColor}
                                onChange={(e) =>
                                  setHubLayout((h) => ({
                                    ...h,
                                    topBarColor: e.target.value as PublicHubLayoutPayload['topBarColor'],
                                  }))
                                }
                                aria-label="Top bar color">
                                {PLATFORM_TOPBAR_COLOR_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-menu-color</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.menuColor}
                                onChange={(e) =>
                                  setHubLayout((h) => ({
                                    ...h,
                                    menuColor: e.target.value as PublicHubLayoutPayload['menuColor'],
                                  }))
                                }
                                aria-label="Sidebar menu color">
                                {PLATFORM_MENU_COLOR_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-sidenav-size</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.sidenavSize}
                                onChange={(e) =>
                                  setHubLayout((h) => ({
                                    ...h,
                                    sidenavSize: e.target.value as PublicHubLayoutPayload['sidenavSize'],
                                  }))
                                }
                                aria-label="Sidebar size">
                                {PLATFORM_SIDENAV_SIZE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-sidenav-user</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.sidenavUser ? 'true' : 'false'}
                                onChange={(e) =>
                                  setHubLayout((h) => ({ ...h, sidenavUser: e.target.value === 'true' }))
                                }
                                aria-label="Show user block in sidebar">
                                <option value="false">false</option>
                                <option value="true">true</option>
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-layout-position</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.layoutPosition}
                                onChange={(e) =>
                                  setHubLayout((h) => ({
                                    ...h,
                                    layoutPosition: e.target.value as PublicHubLayoutPayload['layoutPosition'],
                                  }))
                                }
                                aria-label="Layout position">
                                {PLATFORM_LAYOUT_POSITION_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label>
                                <code className="user-select-all">data-layout-width</code>
                              </Form.Label>
                              <Form.Select
                                value={hubLayout.layoutWidth}
                                onChange={(e) =>
                                  setHubLayout((h) => ({
                                    ...h,
                                    layoutWidth: e.target.value as PublicHubLayoutPayload['layoutWidth'],
                                  }))
                                }
                                aria-label="Layout width">
                                {PLATFORM_LAYOUT_WIDTH_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                        </Row>
                        <Button
                          className="mt-3"
                          variant="primary"
                          type="button"
                          disabled={upsert.isPending}
                          onClick={() => void saveHubLayout()}>
                          {upsert.isPending ? 'Saving…' : 'Save hub shell'}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="bridge">
                <Row>
                  <Col lg={8} xl={6}>
                    <Card className="border h-100">
                      <Card.Body>
                        <Card.Title as="h5">Bridge plugin</Card.Title>
                        <Card.Text className="text-muted small">
                          Choose which released bridge build is <strong>active</strong> for downloads, version display, and
                          site updates. Publish new builds with your release process, then select the active version here and
                          save.
                        </Card.Text>
                        {bridgeLastPublished && (
                          <p className="text-muted small mb-3">
                            Newest published release:{' '}
                            <span className="fw-semibold text-body">{bridgeLastPublished.version}</span>
                            {bridgeLastPublished.created_at ? (
                              <>
                                {' '}
                                · <span className="user-select-all">{bridgeLastPublished.created_at}</span>
                              </>
                            ) : null}
                          </p>
                        )}
                        {bridgeActiveSetAt ? (
                          <p className="text-muted small mb-2">
                            Active version saved at{' '}
                            <span className="user-select-all">{bridgeActiveSetAt}</span>
                          </p>
                        ) : null}
                        <Form.Group className="mb-3">
                          <Form.Label>Active version</Form.Label>
                          {bridgeVersionsLoading ? (
                            <div className="d-flex align-items-center gap-2 text-muted small py-2">
                              <Spinner animation="border" size="sm" />
                              Loading released versions…
                            </div>
                          ) : (
                            <Form.Select
                              value={activeBridgeVersion}
                              onChange={(e) => setActiveBridgeVersion(e.target.value)}
                              disabled={
                                upsert.isPending ||
                                (bridgeVersionSelectOptions.length === 0 && !activeBridgeVersion)
                              }
                              aria-label="Active bridge plugin version">
                              {bridgeVersionSelectOptions.length === 0 ? (
                                <option value="">No published versions yet</option>
                              ) : (
                                bridgeVersionSelectOptions.map((row) => (
                                  <option key={row.version} value={row.version}>
                                    {formatBridgeVersionOptionLabel(row)}
                                  </option>
                                ))
                              )}
                            </Form.Select>
                          )}
                          <Form.Text muted>Only released versions with an uploaded package can be selected.</Form.Text>
                        </Form.Group>
                        <div className="d-flex flex-wrap gap-2 align-items-center">
                          <Button
                            variant="primary"
                            type="button"
                            disabled={
                              upsert.isPending ||
                              bridgeVersionsLoading ||
                              !activeBridgeVersion.trim() ||
                              bridgeVersionSelectOptions.length === 0 ||
                              !activeBridgeRow?.file_id
                            }
                            onClick={() => void saveBridge()}>
                            {upsert.isPending ? 'Saving…' : 'Save active version'}
                          </Button>
                          <Button
                            variant="outline-warning"
                            type="button"
                            disabled={bridgeForceStarting || upsert.isPending || bridgeVersionsLoading}
                            onClick={() => setBridgeForceModalOpen(true)}>
                            Force-update
                          </Button>
                        </div>
                        <p className="text-muted small mt-3 mb-0">
                          <strong>Force-update</strong> installs the active bridge build on connected WordPress sites in
                          batches. The hub does not show per-site outcomes—check site logs if needed.
                        </p>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="storage">
                <Row>
                  <Col lg={8} xl={6}>
                    <Card className="border h-100">
                      <Card.Body>
                        <Card.Title as="h5">S3 storage</Card.Title>
                        <Card.Text className="text-muted small">
                          Fallback credentials when S3 env vars are not set on the function. Stored as JSON under key{' '}
                          <code>s3</code>.
                        </Card.Text>
                        <Form.Group className="mb-2">
                          <Form.Label>Bucket</Form.Label>
                          <Form.Control
                            value={s3Bucket}
                            onChange={(e) => setS3Bucket(e.target.value)}
                            autoComplete="off"
                          />
                        </Form.Group>
                        <Form.Group className="mb-2">
                          <Form.Label>Region</Form.Label>
                          <Form.Control
                            value={s3Region}
                            onChange={(e) => setS3Region(e.target.value)}
                            autoComplete="off"
                          />
                        </Form.Group>
                        <Form.Group className="mb-2">
                          <Form.Label>Access key ID</Form.Label>
                          <Form.Control
                            type="password"
                            value={s3AccessKey}
                            onChange={(e) => setS3AccessKey(e.target.value)}
                            autoComplete="off"
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Secret access key</Form.Label>
                          <Form.Control
                            type="password"
                            value={s3SecretKey}
                            onChange={(e) => setS3SecretKey(e.target.value)}
                            autoComplete="off"
                          />
                        </Form.Group>
                        <Button
                          variant="primary"
                          type="button"
                          disabled={upsert.isPending}
                          onClick={() => void saveS3()}>
                          {upsert.isPending ? 'Saving…' : 'Save storage'}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="api">
                <AdminApiTab />
              </Tab.Pane>

              <Tab.Pane eventKey="security">
                <Row>
                  <Col lg={8} xl={6}>
                    <Card className="border h-100">
                      <Card.Body>
                        <Card.Title as="h5">Security · MFA</Card.Title>
                        <Card.Text className="text-muted small">
                          Multi-factor authentication policy. Stored under platform key <code>auth</code>.
                        </Card.Text>
                        <Form.Group className="mb-3">
                          <Form.Check
                            type="switch"
                            id="admin-force-mfa-all"
                            label="Force MFA for all users"
                            checked={forceMfaForAllUsers}
                            onChange={(e) => setForceMfaForAllUsers(e.target.checked)}
                            disabled={upsert.isPending}
                          />
                          <Form.Text className="d-block">
                            When on, users cannot turn MFA off in their profile; they must complete MFA setup.
                          </Form.Text>
                        </Form.Group>
                        <p className="text-muted small fw-semibold mb-2">Available MFA methods</p>
                        <p className="text-muted small mb-2">
                          Enable or disable each method for the whole platform. Disabled methods are hidden at sign-in and
                          in profile.
                        </p>
                        <Form.Group className="mb-2">
                          <Form.Check
                            type="switch"
                            id="admin-mfa-otp-mail"
                            label="OTP mail"
                            checked={mfaOtpMailEnabled}
                            onChange={(e) => setMfaOtpMailEnabled(e.target.checked)}
                            disabled={upsert.isPending}
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Check
                            type="switch"
                            id="admin-mfa-authenticator"
                            label="Authenticator (TOTP)"
                            checked={mfaAuthenticatorEnabled}
                            onChange={(e) => setMfaAuthenticatorEnabled(e.target.checked)}
                            disabled={upsert.isPending}
                          />
                        </Form.Group>
                        <Button
                          variant="primary"
                          type="button"
                          disabled={upsert.isPending}
                          onClick={() => void saveAuth()}>
                          {upsert.isPending ? 'Saving…' : 'Save security'}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="financial">
                <Row>
                  <Col lg={8} xl={6}>
                    <Card className="border h-100">
                      <Card.Body>
                        <Card.Title as="h5">Stripe signup plan</Card.Title>
                        <Card.Text className="text-muted small">
                          New accounts get this Stripe price as their initial subscription when set here. Stored as{' '}
                          <code>stripe_signup_plan.defaultSignupPlanPriceId</code> in platform settings.
                        </Card.Text>
                        {plansError && (
                          <Alert variant="warning" className="small py-2 mb-3">
                            Could not load Stripe plans:{' '}
                            {plansQueryError instanceof Error ? plansQueryError.message : 'Unknown error'}
                          </Alert>
                        )}
                        <Form.Group className="mb-3">
                          <Form.Label htmlFor="admin-stripe-signup-price-select">Default plan for new signups</Form.Label>
                          {plansLoading ? (
                            <div className="d-flex align-items-center gap-2 text-muted small py-2">
                              <Spinner animation="border" size="sm" />
                              Loading plans…
                            </div>
                          ) : (
                            <Select<StripePriceSelectOption, false, GroupBase<StripePriceSelectOption>>
                              inputId="admin-stripe-signup-price-select"
                              className="react-select"
                              classNamePrefix="react-select"
                              aria-label="Default Stripe price for new signups"
                              placeholder="Select a plan…"
                              options={stripeSignupGroupedOptions}
                              value={stripeSignupSelectValue}
                              onChange={(opt: SingleValue<StripePriceSelectOption>) => {
                                setStripeDefaultPriceId(opt?.value ?? '');
                              }}
                              isDisabled={upsert.isPending}
                              isSearchable
                              isClearable={false}
                              menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                              styles={signupPlanMenuPortalStyles}
                            />
                          )}
                        </Form.Group>
                        <Button
                          variant="primary"
                          type="button"
                          disabled={upsert.isPending || plansLoading}
                          onClick={() => void saveStripe()}>
                          {upsert.isPending ? 'Saving…' : 'Save signup plan'}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="media-library">
                <Row>
                  <Col lg={10} xl={9}>
                    <Card className="border">
                      <Card.Body>
                        <Card.Title as="h5">Media library</Card.Title>
                        <Card.Text className="text-muted small">
                          Upload and manage images used in the admin UI and billing catalog.
                        </Card.Text>
                        <MediaLibraryTab />
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="admin-inbox">
                <AdminWorkspaceInboxTab />
              </Tab.Pane>

              <Tab.Pane eventKey="tools">
                <AdminToolsTab />
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        )}
      </Container>
      <Modal show={bridgeForceModalOpen} onHide={() => !bridgeForceStarting && setBridgeForceModalOpen(false)} centered>
        <Modal.Header closeButton={!bridgeForceStarting}>
          <Modal.Title>Force-update bridge on all sites?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            This starts a <strong>background</strong> job that installs the active bridge build on <strong>every</strong>{' '}
            connected site, in batches to limit load.
          </p>
          <p className="text-muted small mb-0">
            The hub will not list success or failure per site. You can close this dialog while the job continues on the
            server.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" type="button" disabled={bridgeForceStarting} onClick={() => setBridgeForceModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="warning" type="button" disabled={bridgeForceStarting} onClick={() => void confirmBridgeForceUpdate()}>
            {bridgeForceStarting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" role="status" />
                Starting…
              </>
            ) : (
              'Confirm force-update'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
      <MediaLibraryImagePickerModal
        show={brandingPicker !== null}
        onHide={() => setBrandingPicker(null)}
        bodyHint="Choose an image from the media library to use for hub branding."
        onSelect={(url) => {
          if (brandingPicker === 'logoLight') setLogoUrlLight(url);
          else if (brandingPicker === 'logoDark') setLogoUrlDark(url);
          else if (brandingPicker === 'iconLight') setIconUrlLight(url);
          else if (brandingPicker === 'iconDark') setIconUrlDark(url);
        }}
      />
    </>
  );
};

export default AdminPlatformSettingsPage;
