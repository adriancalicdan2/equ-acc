import crypto from 'crypto';

/**
 * Helper to generate a signed JWT for Google Service Account OAuth.
 */
function signServiceAccountJwt(privateKey: string, clientEmail: string): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64ClaimSet = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
  const signatureInput = `${base64Header}.${base64ClaimSet}`;

  const formattedKey = privateKey.replace(/\\n/g, '\n');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(formattedKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Exchanges a Service Account JWT for a Google OAuth Access Token.
 */
export async function getGoogleServiceAccountToken(privateKey: string, clientEmail: string): Promise<string> {
  const jwt = signServiceAccountJwt(privateKey, clientEmail);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google OAuth token exchange failed: ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Creates a folder inside a parent folder on Google Drive.
 */
export async function createGoogleFolderServer(
  folderName: string,
  parentFolderId: string,
  accessToken: string
): Promise<string> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create folder on Google Drive: ${errText}`);
  }

  const folder = await response.json();
  return folder.id;
}

/**
 * Uploads a raw file Buffer to a Google Drive folder.
 */
export async function uploadFileServer(
  fileName: string,
  fileBuffer: Buffer,
  parentFolderId: string,
  accessToken: string
): Promise<any> {
  const metadata = {
    name: fileName,
    parents: [parentFolderId],
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const boundary = 'server_upload_boundary_docx';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata);
  const mediaPart = 'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\nContent-Transfer-Encoding: base64\r\n\r\n' + fileBuffer.toString('base64');

  const multipartBody = Buffer.concat([
    Buffer.from(delimiter + metadataPart + delimiter + mediaPart + closeDelimiter),
  ]);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to upload file "${fileName}" to Google Drive: ${errText}`);
  }

  return response.json();
}

/**
 * Exchanges a Google OAuth refresh token for a live access token on behalf of a user account.
 */
export async function getAccessTokenFromRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to refresh Google access token: ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}
