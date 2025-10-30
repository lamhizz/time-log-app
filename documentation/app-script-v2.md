/*

Google Apps Script for Work Log Chrome Extension (v1.5)

This script is updated to match the data structure sent by

background.js (v1.5), which includes log, tag, and drifted.

Your Google Sheet Headers (Row 1) should be:

A1: Timestamp

B1: Log Entry

C1: Tag

D1: Drifted
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