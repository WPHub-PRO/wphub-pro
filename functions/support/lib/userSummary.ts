async function getUserSummary(users, userId) {
  if (!userId) return null;
  try {
    const u = await users.get(userId);
    return {
      id: u.$id,
      name: u.name || u.email || u.$id,
      email: u.email || '',
    };
  } catch {
    return null;
  }
}

async function listUserSummaries(users, userIds) {
  const uniq = [...new Set((userIds || []).filter(Boolean))];
  const items = await Promise.all(uniq.map((id) => getUserSummary(users, id)));
  return items.filter(Boolean);
}

export { getUserSummary, listUserSummaries };