Work Log Timer - Chrome Extension

This extension helps you log your work every 15 minutes on weekdays (Monday-Friday) by showing a pop-up. Your logs are saved directly to a Google Sheet for later analysis.

You MUST follow these setup instructions for the extension to work.

1. Create Your Google Sheet

Go to sheets.google.com and create a New blank spreadsheet.

Name it something clear, like "My Work Logs".

In the first row (Row 1), create your headers. The extension (v1.5) sends four pieces of data: Timestamp, Log Entry, Tag, and Drifted.

In cell A1, type: Timestamp

In cell B1, type: Log Entry

In cell C1, type: Tag

In cell D1, type: Drifted

Your sheet should look like this:



A

B

C

D

1

Timestamp

Log Entry

Tag

Drifted

2









2. Create the Google Apps Script

This script will act as the "bridge" between the Chrome extension and your Google Sheet. It creates a secret web URL that the extension can send data to.

In your new Google Sheet, click Extensions > Apps Script.

A new browser tab will open with the Apps Script editor.

Delete any placeholder code in the Code.gs file (e.g., function myFunction() { ... }).

Copy and paste the entire script below into the Code.gs editor:

/*
 * Google Apps Script for Work Log Chrome Extension (v1.5)
 *
 * This script is updated to match the data structure sent by
 * background.js (v1.5), which includes `log`, `tag`, and `drifted`.
 *
 * Your Google Sheet Headers (Row 1) should be:
 * A1: Timestamp
 * B1: Log Entry
 * C1: Tag
 * D1: Drifted
 */

// This function runs when the web app receives a POST request.
function doPost(e) {
  try {
    // Get the active spreadsheet and the sheet named "Sheet1".
    // !!! IMPORTANT: If your sheet has a different name, change "Sheet1" below.
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    
    if (!sheet) {
      // Handle case where sheet name is wrong
      throw new Error("Could not find a sheet named 'Sheet1'. Please check your sheet name.");
    }

    // Parse the data object sent from the extension
    var data = JSON.parse(e.postData.contents);
    
    // Extract data from the payload
    var logEntry = data.log || "";       // Get the log text
    var tag = data.tag || "";           // Get the tag
    var drifted = data.drifted || false;  // Get the drifted boolean

    // Get the current date and time
    var timestamp = new Date();

    // Add the new log as a new row, matching the headers
    // [Timestamp, Log Entry, Tag, Drifted]
    sheet.appendRow([timestamp, logEntry, tag, drifted]);

    // Return a success message (JSON format)
    return ContentService.createTextOutput(JSON.stringify({ "status": "success", "row": sheet.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Log any errors (visible in Apps Script -> Executions)
    Logger.log(err);
    
    // Return an error message to the extension
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


Save the script (click the floppy disk icon or Ctrl+S). Give it a name if prompted (e.g., "Work Log Script").

3. Deploy the Apps Script as a Web App

This is the most critical step.

In the Apps Script editor, click the blue Deploy button in the top-right corner.

Select New deployment.

Click the "Select type" gear icon (⚙️) and choose Web app.

In the "New deployment" dialog:

Description: (Optional) "Work Log Receiver".

Execute as: Select Me. (This runs the script as you, with your permission to edit the sheet).

Who has access: Select Anyone.

Note: This does not make your sheet public. It only allows anyone who has the secret, complex URL to send data to the script. It is very secure.

Click Deploy.

Authorize access: Google will ask you to authorize the script.

Click Authorize access.

Choose your Google account.

You may see a "Google hasn't verified this app" warning. This is normal for your own scripts. Click Advanced, then click "Go to [Your Script Name] (unsafe)".

Click Allow to give the script permission to manage your spreadsheets.

Copy the Web App URL: After deploying, you will see a dialog box with a Web app URL. It will look something like https://script.google.com/macros/s/.../exec.

COPY THIS URL. You need it for the next step.

4. Configure the Chrome Extension

Go back to the extension files you downloaded.

Open the background.js file in a text editor.

Find this line at the top:
const WEB_APP_URL = "YOUR_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_HERE";

Replace the text "YOUR_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_HERE" with the Web app URL you just copied.

Save the background.js file.

5. Load the Extension in Chrome

Open Chrome and go to the extensions page: chrome://extensions

In the top-right corner, turn on Developer mode.

Click the Load unpacked button.

Select the folder that contains all the extension files (manifest.json, background.js, etc.).

The "Work Log Timer" extension should now appear in your list.

That's it! The extension is installed. The alarm will create itself and should fire in 1-15 minutes for the first time, and then every 15 minutes after that (on weekdays).