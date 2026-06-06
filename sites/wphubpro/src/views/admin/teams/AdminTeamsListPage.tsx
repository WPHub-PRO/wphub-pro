import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useAuth } from '@/domains/auth';
import { useAdminTeamsList } from '@/domains/admin/useAdminTeams';
import AdminTeamsTable from '@/views/admin/teams/AdminTeamsTable';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Container, Form, Pagination, Row, Spinner } from 'react-bootstrap';
import { LuSearch } from 'react-icons/lu';
import { useNavigate } from 'react-router';

const PER_PAGE_OPTIONS = [12, 24, 48] as const;

export default function AdminTeamsListPage() {
  const { isAdmin } = useAuth();
  const { mode } = useDashboardNav();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState<number>(24);

  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
      return;
    }
    if (mode !== 'admin') {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
    }
  }, [isAdmin, mode, navigate]);

  const { data, isLoading, isError, error, refetch } = useAdminTeamsList(limit, page * limit, search);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(0);
  }, [searchInput]);

  if (!isAdmin || mode !== 'admin') {
    return null;
  }

  return (
    <>
      <PageMetaData title="Admin — Teams" />
      <Container fluid>
        <PageBreadcrumb
          title="Teams (platform)"
          subtitle="Teams and billing metadata"
          titleEnd={
            <Button variant="outline-primary" size="sm" onClick={() => void refetch()}>
              Refresh
            </Button>
          }
        />

        <Row className="mb-3">
          <Col lg={12}>
            <Card className="border">
              <Card.Body className="p-3">
                <Row className="g-3 align-items-end">
                  <Col md={5} lg={4}>
                    <Form.Label className="small text-muted mb-1 d-block">Search</Form.Label>
                    <div className="app-search">
                      <input
                        type="search"
                        className="form-control"
                        placeholder="Search team name or id…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        aria-label="Search teams"
                      />
                      <LuSearch className="app-search-icon text-muted" />
                    </div>
                  </Col>
                  <Col md="auto">
                    <Button variant="primary" type="button" onClick={handleSearch}>
                      Search
                    </Button>
                  </Col>
                  <Col md="auto" className="ms-md-auto">
                    <Form.Label className="small text-muted mb-1 d-block">Per page</Form.Label>
                    <Form.Select
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(0);
                      }}
                      style={{ minWidth: '5.5rem' }}
                      aria-label="Teams per page"
                    >
                      {PER_PAGE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                </Row>

                <hr className="border-dashed my-3" />

                {isLoading && (
                  <div className="d-flex justify-content-center py-5">
                    <Spinner animation="border" variant="primary" role="status">
                      <span className="visually-hidden">Loading…</span>
                    </Spinner>
                  </div>
                )}

                {isError && (
                  <p className="text-danger small mb-0">
                    {error instanceof Error ? error.message : 'Could not load teams.'}
                  </p>
                )}

                {!isLoading && !isError && rows.length === 0 && (
                  <p className="text-muted text-center py-5 mb-0">
                    {search.trim() ? 'No teams match your search.' : 'No team rows yet.'}
                  </p>
                )}

                {!isLoading && !isError && rows.length > 0 && (
                  <>
                    <AdminTeamsTable rows={rows} />

                    <div className="d-flex flex-column flex-sm-row align-items-center justify-content-between gap-2 mt-3 pt-2 border-top border-dashed">
                      <span className="text-muted small">
                        Showing {total === 0 ? 0 : page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                      </span>
                      {totalPages > 1 && (
                        <Pagination className="pagination-rounded pagination-boxed mb-0 flex-wrap justify-content-center">
                          <Pagination.Prev disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />
                          {Array.from({ length: totalPages }, (_, i) => (
                            <Pagination.Item key={i} active={i === page} onClick={() => setPage(i)}>
                              {i + 1}
                            </Pagination.Item>
                          ))}
                          <Pagination.Next
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                          />
                        </Pagination>
                      )}
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
}
