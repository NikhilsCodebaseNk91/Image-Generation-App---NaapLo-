import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { loadGoogleOAuthClient } from '../server/services/driveSource.ts';

const credentials = loadGoogleOAuthClient();
const tokenPath = process.env.GOOGLE_OAUTH_REFRESH_TOKEN_FILE?.trim();
if (!credentials || !tokenPath) {
  throw new Error('Set GOOGLE_OAUTH_CLIENT_JSON_FILE and GOOGLE_OAUTH_REFRESH_TOKEN_FILE before running OAuth setup.');
}

const redirectUri = credentials.redirect_uris.find((uri) => uri.startsWith('http://localhost:'));
if (!redirectUri) throw new Error('The OAuth client must include an http://localhost redirect URI.');
const redirect = new URL(redirectUri);
const state = crypto.randomBytes(32).toString('hex');
const authorize = new URL(credentials.auth_uri || 'https://accounts.google.com/o/oauth2/auth');
authorize.search = new URLSearchParams({
  client_id: credentials.client_id,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive',
  access_type: 'offline',
  prompt: 'consent',
  state,
}).toString();

const server = http.createServer(async (request, response) => {
  try {
    const incoming = new URL(request.url || '/', redirectUri);
    if (incoming.pathname !== redirect.pathname) {
      response.writeHead(404).end('Not found');
      return;
    }
    if (incoming.searchParams.get('state') !== state) throw new Error('OAuth state validation failed.');
    const code = incoming.searchParams.get('code');
    if (!code) throw new Error(incoming.searchParams.get('error') || 'Google did not return an authorization code.');

    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const token = await tokenResponse.json() as { refresh_token?: string; error_description?: string };
    if (!tokenResponse.ok || !token.refresh_token) {
      throw new Error(token.error_description || 'Google did not return an offline refresh token.');
    }
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, JSON.stringify({ refresh_token: token.refresh_token, obtained_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>NaapLo Drive Connected</title><h1>Google Drive connected</h1><p>You can close this tab and return to Codex.</p>');
    console.log(`OAUTH_REFRESH_TOKEN_SAVED=${tokenPath}`);
  } catch (error) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`Authorization failed: ${(error as Error).message}`);
    console.error(`OAUTH_SETUP_FAILED=${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port || '80'), redirect.hostname, () => {
  console.log(`AUTHORIZATION_URL=${authorize}`);
});
