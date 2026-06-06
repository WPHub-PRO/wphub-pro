import {requireAppwriteServerTriple, Client, Users} from '@code045/wphubpro-shared';

const PREFS_KEY = 'stripe_customer_id';

function usersClient(req) {
  const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(req);
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new Users(client);
}

async function getStripeCustomerIdForUser(userId, req) {
  const users = usersClient(req);
  const u = await users.get(userId);
  const raw = u.prefs?.[PREFS_KEY];
  return typeof raw === 'string' && raw.startsWith('cus_') ? raw : null;
}

async function assertCustomerBelongsToUser(userId, customerId, req) {
  const cid = await getStripeCustomerIdForUser(userId, req);
  if (!cid || cid !== customerId) {
    throw Object.assign(new Error('Forbidden: customer does not match signed-in user'), { statusCode: 403 });
  }
}

export { getStripeCustomerIdForUser, assertCustomerBelongsToUser, PREFS_KEY };