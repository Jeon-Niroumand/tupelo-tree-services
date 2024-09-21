const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const os = require('os');
require('dotenv').config(); // To manage sensitive info like email credentials

async function getAuthClient() {
  const client_id = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirect_uris = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris
  );

  // Use the refresh token from the environment variables
  oAuth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });

  return oAuth2Client;
}

async function downloadFile(fileId, destinationPath) {
  try {
    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const dest = fs.createWriteStream(destinationPath);

    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    response.data.pipe(dest);

    return new Promise((resolve, reject) => {
      dest.on('finish', () => resolve('File downloaded successfully.'));
      dest.on('error', reject);
    });
  } catch (err) {
    console.error('Error downloading file:', err.message);
    throw new Error('Error downloading file: ' + err.message);
  }
}

async function uploadFile(filePath, fileId) {
  try {
    const auth = await getAuthClient();
    const service = google.drive({ version: 'v3', auth });

    const media = {
      mimeType: 'text/csv',
      body: fs.createReadStream(filePath),
    };

    const file = await service.files.update({
      fileId: fileId,
      media: media,
      fields: 'id',
    });

    console.log('Updated File Id:', file.data.id);
    return file.data.id;
  } catch (err) {
    console.error('Error updating file:', err.message);
    throw err;
  }
}

// Main function to handle download, append, and upload
async function handleFileUpdate(fileId, newData) {
  const tempLocalPath = path.join(__dirname, './contacts.csv');

  try {
    // Step 1: Download existing file from Google Drive
    await downloadFile(fileId, tempLocalPath);

    // Step 2: Append new data to the downloaded file
    fs.appendFileSync(tempLocalPath, newData);

    // Step 3: Upload the updated file back to Google Drive
    await uploadFile(tempLocalPath, fileId);

    // Clean up: Delete temporary local file
    fs.unlinkSync(tempLocalPath);

    console.log('File updated successfully.');
  } catch (error) {
    console.error('Error handling file update:', error.message);
    throw error;
  }
}

module.exports = { downloadFile, uploadFile, handleFileUpdate, getAuthClient };