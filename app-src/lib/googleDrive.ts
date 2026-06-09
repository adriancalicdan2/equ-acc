export interface GoogleUploadFile {
  name: string;
  base64: string;
}

/**
 * Creates a folder in the user's Google Drive.
 * @param folderName Name of the folder to create.
 * @param accessToken User's Google OAuth 2.0 Access Token.
 * @returns The created folder's ID.
 */
export async function createGoogleDriveFolder(folderName: string, accessToken: string): Promise<string> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create Google Drive folder: ${errText}`);
  }

  const folder = await response.json();
  return folder.id;
}

/**
 * Uploads a file (Base64) to a specific Google Drive folder.
 * @param file The file name and base64 content.
 * @param parentFolderId The ID of the parent folder.
 * @param accessToken User's Google OAuth 2.0 Access Token.
 * @returns The created file metadata.
 */
export async function uploadFileToGoogleDrive(
  file: GoogleUploadFile,
  parentFolderId: string,
  accessToken: string
): Promise<any> {
  const metadata = {
    name: file.name,
    parents: [parentFolderId],
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const boundary = 'foo_bar_boundary_docx';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata);
  const mediaPart = 'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\nContent-Transfer-Encoding: base64\r\n\r\n' + file.base64;

  const multipartBody = delimiter + metadataPart + delimiter + mediaPart + closeDelimiter;

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
    throw new Error(`Failed to upload file "${file.name}" to Google Drive: ${errText}`);
  }

  return response.json();
}
