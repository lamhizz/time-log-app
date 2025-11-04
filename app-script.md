Here is the Google Apps Script code to paste into your Code.gs file.

/**

@file Google Apps Script for WurkWurk Chrome Extension (v3.2 with Gap Fix)

@description This script receives data from the Chrome extension and logs it to a Google Sheet.

It also provides data for the dashboard and connection diagnostics.

@changelog

v3.2: - Added logic to reset 'Mins Since Last' to "N/A" on the first log of a new day.

v3.1: - Removed data processing from getWeeklyData. Now returns raw row data.
*/

// --- CONFIGURATION ---

/**

@const {string}

@description The current version of this Google Apps Script.
*/
const SCRIPT_VERSION = "3.2";

/**

@const {string}

@description The time zone for formatting dates and times.

Find your time zone here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

@example "America/New_York", "Europe/London", "Asia/Tokyo"
*/
const TIME_ZONE = "Europe/Vilnius"; // <<< SET YOUR TIME ZONE HERE

/**

@const {string}

@description The name of the sheet (the tab at the bottom) where logs will be added.

IMPORTANT: If you rename your sheet, you must update this value.
*/
const SHEET_NAME = "Sheet1";

// --- END CONFIGURATION ---

/**

@description Handles GET requests for connection testing, diagnostics, and dashboard data.

@param {object} e - The event parameter containing the request details.

@returns {ContentService.TextOutput} A JSON response.
*/
function doGet(e) {
try {
const action = e.parameter.action;

// Action: Basic Test Connection
if (action === "test") {
Logger.log("WurkWurk: Received successful test ping.");
return ContentService.createTextOutput(
JSON.stringify({
status: "success",
message: "Connection successful!",
})
).setMimeType(ContentService.MimeType.JSON);
}

// Action: Advanced Connection Diagnostics
if (action === "diagnose") {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
if (!sheet) {
throw new Error(Sheet not found: ${SHEET_NAME});
}
// Get only the columns that have content in the first row
const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

Logger.log("WurkWurk: Received successful diagnose ping.");
return ContentService.createTextOutput(
JSON.stringify({
status: "success",
version: SCRIPT_VERSION,
headers: headers
})
).setMimeType(ContentService.MimeType.JSON);
}

// Action: Get Weekly Data for Dashboard
if (action === "getWeeklyData") {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
if (!sheet) {
throw new Error(Sheet not found: ${SHEET_NAME});
}
const data = sheet.getDataRange().getValues();
const header = data.shift(); // Remove header row

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

// Filter for recent data and convert to object array for dashboard.js
const recentData = data.filter(row => new Date(row[6]) >= thirtyDaysAgo)
.map(row => ({
date: row[0],
time: row[1],
logEntry: row[2],
tag: row[3],
drifted: row[4] === "Yes",
minutesSinceLast: row[5],
timestamp: row[6],
domain: row[7],
reactive: row[8] === "Yes",
keywords: row[9]
}));

// --- Assemble Response ---
// Return the raw recentData array. The dashboard.js will process it.
return ContentService.createTextOutput(
JSON.stringify({ status: "success", data: recentData })
).setMimeType(ContentService.MimeType.JSON);
}

// Fallback for unknown GET requests (like a redirect)
return ContentService.createTextOutput(
JSON.stringify({ status: "error", message: "Invalid GET request. Use POST to log data." })
).setMimeType(ContentService.MimeType.JSON);

} catch (err) {
Logger.log("WurkWurk: doGet Error - " + err.message);
return ContentService.createTextOutput(
JSON.stringify({ status: "error", message: err.message })
).setMimeType(ContentService.MimeType.JSON);
}
}

/**

@description Handles POST requests from the Chrome extension to log new data.

@param {object} e - The event parameter containing the POST data.

@returns {ContentService.TextOutput} A JSON response indicating success or failure.
*/
function doPost(e) {
let sheet;
try {
const data = JSON.parse(e.postData.contents);

// --- [FIX] Handle POST-based diagnostic actions ---
if (data.action === "test") {
Logger.log("WurkWurk: Received successful test POST ping.");
return ContentService.createTextOutput(
JSON.stringify({ status: "success", message: "Connection successful!" })
).setMimeType(ContentService.MimeType.JSON);
}

if (data.action === "diagnose") {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
if (!sheet) {
throw new Error(Sheet not found: ${SHEET_NAME});
}
const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
Logger.log("WurkWurk: Received successful diagnose POST ping.");
return ContentService.createTextOutput(
JSON.stringify({
status: "success",
version: SCRIPT_VERSION,
headers: headers
})
).setMimeType(ContentService.MimeType.JSON);
}
// --- [END FIX] ---

// Original logging logic starts here
const logEntry = data.log || "";
const tag = data.tag || "";
const drifted = data.drifted ? "Yes" : "No";
const domain = data.domain || "";
const reactive = data.reactive ? "Yes" : "No";
const keywords = data.keywords || "";

sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
if (!sheet) {
throw new Error(Sheet not found. Please ensure a sheet named "${SHEET_NAME}" exists.);
}

const now = new Date();
const fullTimestamp = now.toISOString();
// Get formatted date/time for the new log
const dateFormatted = Utilities.formatDate(now, TIME_ZONE, "yyyy-MM-dd");
const timeFormatted = Utilities.formatDate(now, TIME_ZONE, "HH:mm:ss");

let minsSinceLast = "N/A";
const lastRow = sheet.getLastRow();

if (lastRow >= 1) {
// Get the date (Col A) and timestamp (Col G) from the previous row
// We read 7 columns (A to G)
const lastRowData = sheet.getRange(lastRow, 1, 1, 7).getValues()[0];
const lastDateFormatted = lastRowData[0]; // Column A is at index 0
const lastTimestampStr = lastRowData[6]; // Column G is at index 6

// Check if the last log was on the same day
if (lastTimestampStr && lastDateFormatted === dateFormatted) {
const lastTimestamp = new Date(lastTimestampStr);
const diffMs = now.getTime() - lastTimestamp.getTime();
minsSinceLast = Math.round(diffMs / 60000); // Convert milliseconds to minutes
}
// If it's a new day, minsSinceLast remains "N/A"
}

// The order MUST match your 10-column header setup in the sheet.
const newRow = [
dateFormatted,    // A: Date
timeFormatted,    // B: Time
logEntry,         // C: Log Entry
tag,              // D: Tag
drifted,          // E: Drifted
minsSinceLast,    // F: Mins Since Last
fullTimestamp,    // G: FullTimestamp
domain,           // H: Domain
reactive,         // I: Reactive
keywords          // J: Keywords
];

sheet.appendRow(newRow);

return ContentService.createTextOutput(
JSON.stringify({ status: "success", row: sheet.getLastRow() })
).setMimeType(ContentService.MimeType.JSON);

} catch (err) {
Logger.log("WurkWurk: doPost Error - " + err.message);
return ContentService.createTextOutput(
JSON.stringify({ status: "error", message: err.message, sheetName: SHEET_NAME })
).setMimeType(ContentService.MimeType.JSON);
}
}