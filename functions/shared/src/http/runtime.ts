import * as AppwriteSdk from 'node-appwrite';
import { appwriteEndpoint, appwriteProjectId, appwriteApiKey } from '../core/env.ts';

const { AppwriteException } = AppwriteSdk;

function getAppwriteConnection() {
  const endpoint = String(appwriteEndpoint() || '').replace(/\/$/, '');
  const projectId = String(appwriteProjectId() || '').trim();
  return { endpoint, projectId };
}

function appwriteServerApiKey() {
  return String(appwriteApiKey() || '').trim();
}

/**
 * @param {unknown} err
 * @returns {({ status: number, message: string }) | null}
 */
function httpFromAppwriteError(err) {
  if (err instanceof AppwriteException) {
    const code = Number(err.code);
    if (code === 401) return { status: 401, message: err.message || 'Unauthorized' };
    if (code === 403) return { status: 403, message: err.message || 'Forbidden' };
    if (code === 404) return { status: 404, message: err.message || 'Not found' };
    if (code === 429) return { status: 429, message: err.message || 'Too many requests' };
  }
  return null;
}

export { getAppwriteConnection, appwriteServerApiKey, httpFromAppwriteError };
