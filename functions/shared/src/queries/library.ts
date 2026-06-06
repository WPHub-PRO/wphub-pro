import * as sdk from 'node-appwrite';

/**
 * @param {string} wpSlug
 * @param {'plugin' | 'theme'} type
 */
export function libraryByWpSlugAndTypeQueries(wpSlug, type) {
  return [sdk.Query.equal('wpSlug', wpSlug), sdk.Query.equal('type', type), sdk.Query.limit(5)];
}
