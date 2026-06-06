import * as sdk from 'node-appwrite';

/** @param {string} key */
export function platformSettingByKeyQueries(key) {
  return [sdk.Query.equal('key', String(key || '').trim()), sdk.Query.limit(1)];
}

export function platformSettingsListQueries() {
  return [sdk.Query.limit(500)];
}
