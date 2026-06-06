import { fetchAccountsByUserIds } from '../../lib/accounts.ts';
import {WPHUB_APPWRITE_IDS, Query, Users} from '@code045/wphubpro-shared';

function userMatchesFilters(user, account, status, role, plan) {
  if (status && status !== "all") {
    const active = user.status !== false;
    if (status === "active" && !active) return false;
    if (status === "inactive" && active) return false;
  }
  if (role && role !== "all") {
    const labels = Array.isArray(user.labels) ? user.labels : [];
    const isAdmin = labels.some((l) => String(l).toLowerCase() === "admin");
    if (role === "admin" && !isAdmin) return false;
    if (role === "user" && isAdmin) return false;
  }
  if (plan && plan !== "all") {
    const stripeId = account && account.stripe_customer_id;
    const hasStripe = stripeId != null && String(stripeId).length > 0;
    if (plan === "stripe" && !hasStripe) return false;
    if (plan === "free" && hasStripe) return false;
  }
  return true;
}

export default async function handleList({ req, res, log }, ctx) {
  const payload = req._parsedPayload || {};
  const limit = Number.isFinite(Number(payload.limit))
    ? Math.max(1, Math.min(100, Number(payload.limit)))
    : 100;
  const offset = Number.isFinite(Number(payload.offset)) ? Math.max(0, Number(payload.offset)) : 0;
  const search = typeof payload.search === "string" ? payload.search.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "all";
  const role = typeof payload.role === "string" ? payload.role.trim().toLowerCase() : "all";
  const plan = typeof payload.plan === "string" ? payload.plan.trim().toLowerCase() : "all";

  const { client, databases } = ctx;
  const users = new Users(client);
  const dbId =
    process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
  const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;

  const filtersActive = status !== "all" || role !== "all" || plan !== "all";
  const MAX_SCAN = 10000;

  if (!filtersActive) {
    const queries = [Query.limit(limit), Query.offset(offset)];
    log(`users list: limit=${limit} offset=${offset} search=${search || "none"} (no extra filters)`);
    const response = search ? await users.list(queries, search) : await users.list(queries);
    const rawUsers = response.users || response.documents || [];
    const ids = rawUsers.map((u) => u.$id);
    const accMap = await fetchAccountsByUserIds(databases, dbId, accountsColl, ids);
    const merged = rawUsers.map((u) => ({ ...u, account: accMap[u.$id] || null }));
    return res.json({
      success: true,
      users: merged,
      total: response.total !== undefined ? response.total : rawUsers.length,
      limit,
      offset,
    });
  }

  log(`users list: filters status=${status} role=${role} plan=${plan} search=${search || "none"}`);
  const pageSize = 100;
  const matches = [];
  let apiOffset = 0;

  while (apiOffset < MAX_SCAN) {
    const queries = [Query.limit(pageSize), Query.offset(apiOffset)];
    const response = search ? await users.list(queries, search) : await users.list(queries);
    const batch = response.users || response.documents || [];
    if (!batch.length) break;

    const ids = batch.map((u) => u.$id);
    const accMap = await fetchAccountsByUserIds(databases, dbId, accountsColl, ids);
    for (const u of batch) {
      const acc = accMap[u.$id] || null;
      if (userMatchesFilters(u, acc, status, role, plan)) {
        matches.push({ ...u, account: acc });
      }
    }
    apiOffset += batch.length;
    if (batch.length < pageSize) break;
  }

  const totalFiltered = matches.length;
  const page = matches.slice(offset, offset + limit);

  return res.json({
    success: true,
    users: page,
    total: totalFiltered,
    limit,
    offset,
  });
};
