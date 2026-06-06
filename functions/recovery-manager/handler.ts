import jwt from 'jsonwebtoken';
import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  WPHUB_APPWRITE_IDS,
  hasAppwriteServerEnv,
  createServerClientAndDatabases,
  readEnv,
} from '@code045/wphubpro-shared';

/**
 * Decryptie helper functie (Matcht exact jouw encrypt logica)
 */
function decrypt(encryptedData, encryptionKey) {
  try {
    const [ivHex, encryptedHex, tagHex] = encryptedData.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const derivedKey = crypto.createHash('sha256').update(String(encryptionKey), 'utf8').digest();

    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]).toString('utf8');

    return decrypted;
  } catch (err) {
    throw new Error('Decryptie van API sleutel mislukt: ' + err.message);
  }
}

export default async ({ req, res, log, error }) => {
  if (!hasAppwriteServerEnv(req)) {
    return res.json({ success: false, message: 'Function environment is not configured' }, 500);
  }

  let databases;
  try {
    ({ databases } = await createServerClientAndDatabases({ req }));
  } catch (err) {
    error(`recovery-manager: ${err.message}`);
    return res.json({ success: false, message: err.message || 'Appwrite credentials failed' }, 500);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    return res.json({ success: false, message: 'Invalid JSON body' }, 400);
  }

  const { siteId, action, plugin_slug } = body;
  const ENCRYPTION_KEY = readEnv('ENCRYPTION_KEY');

  if (!siteId || !action) {
    return res.json({ success: false, message: 'siteId and action are required' }, 400);
  }

  try {
    log(`Ophalen site gegevens voor: ${siteId}`);

    const site = await databases.getDocument(
      WPHUB_APPWRITE_IDS.defaults.platformDatabaseId,
      WPHUB_APPWRITE_IDS.platformTables.sites,
      siteId,
    );

    const targetUrl = site.site_url || site.siteUrl;

    if (!site.api_key) {
      throw new Error('Geen api_key gevonden in het site document.');
    }

    const decryptedApiKey = decrypt(site.api_key, ENCRYPTION_KEY);
    log(`Sleutel succesvol ontsleuteld.`);

    const token = jwt.sign(
      {
        action,
        plugin_slug: plugin_slug || null,
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      decryptedApiKey,
    );

    const urlWithToken = new URL(targetUrl);
    urlWithToken.searchParams.append('wphub_token', token);

    log(`Verbinding maken met agent op: ${targetUrl}`);

    const response = await fetch(urlWithToken.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-WPHubPro-Recovery': 'true',
        Accept: 'application/json',
      },
    });

    const responseText = await response.text();

    try {
      const data = JSON.parse(responseText);
      return res.json({ success: true, data });
    } catch (parseError) {
      error(`WP stuurde geen JSON: ${responseText.substring(0, 200)}`);
      return res.json(
        {
          success: false,
          message:
            'Site stuurde HTML (Fatal Error). Controleer of de ontsleutelde sleutel overeenkomt met de waarde in de WP database.',
          debug: responseText.substring(0, 100),
        },
        500,
      );
    }
  } catch (err) {
    error(`Fout: ${err.message}`);
    return res.json({ success: false, message: err.message }, 500);
  }
};
