Here is the Google Apps Script code to paste into your Code.gs file.

/**
 * @file Google Apps Script for WurkWurk Chrome Extension (v3.1 with Connection Doctor)
 * @description This script receives data from the Chrome extension and logs it to a Google Sheet.
 * It also provides data for the dashboard and connection diagnostics.
 */

// --- CONFIGURATION ---

/**
 * @const {string}
 * @description The current version of this Google Apps Script.
 */
const SCRIPT_VERSION = "3.1";

/**
 * @const {string}
 * @description The time zone for formatting dates and times.
 * Find your time zone here: [https://en.wikipedia.org/wiki/List_of_tz_database_time_zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
 * @example "America/New_York", "Europe/London", "Asia/Tokyo"
 */
const TIME_ZONE = "Europe/Vilnius";

/**
 * @const {string}
 * @description The name of the sheet (the tab at the bottom) where logs will be added.
 * IMPORTANT: If you rename your sheet, you must update this value.
 */
const SHEET_NAME = "Sheet1";

// --- END CONFIGURATION ---


/**
 * @description Handles GET requests for connection testing, diagnostics, and dashboard data.
 * @param {object} e - The event parameter containing the request details.
 * @returns {ContentService.TextOutput} A JSON response.
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
        throw new Error(`Sheet not found: ${SHEET_NAME}`);
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
        throw new Error(`Sheet not found: ${SHEET_NAME}`);
      }
      const data = sheet.getDataRange().getValues();
      const header = data.shift(); // Remove header row

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentData = data.filter(row => new Date(row[6]) >= thirtyDaysAgo);

      // --- Calculate Stats ---

      // 1. Tag Pie Chart Data (Count occurrences)
      const tagCounts = recentData.reduce((acc, row) => {
        const tag = row[3] || "Untagged"; // Column D
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {});
      const tagData = {
        labels: Object.keys(tagCounts),
        values: Object.values(tagCounts)
      };

      // 2. Keyword Bar Chart Data
      const stopWords = new Set(["a", "an", "the", "and", "in", "on", "for", "with", "to", "is", "of", "it", "i", "was"]);
      const keywordCounts = recentData.reduce((acc, row) => {
        const log = (row[2] || "").toLowerCase(); // Column C
        const words = log.match(/\b(\w+)\b/g) || [];
        words.forEach(word => {
          if (word.length > 3 && !stopWords.has(word) && !/\d+/.test(word)) {
            acc[word] = (acc[word] || 0) + 1;
          }
        });
        return acc;
      }, {});
      const sortedKeywords = Object.entries(keywordCounts).sort(([,a],[,b]) => b-a).slice(0, 10);
      const keywordData = {
        labels: sortedKeywords.map(item => item[0]),
        values: sortedKeywords.map(item => item[1])
      };

      // 3. Focus Over Time Data (Last 7 days)
      const focusByDay = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayString = d.toLocaleDateString('en-US', { weekday: 'short' });
        focusByDay[dayString] = { total: 0, drifted: 0 };
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const last7DaysData = recentData.filter(row => new Date(row[6]) >= sevenDaysAgo);

      last7DaysData.forEach(row => {
          const date = new Date(row[6]); // Column G
          const dayString = date.toLocaleDateString('en-US', { weekday: 'short' });
          if (focusByDay[dayString]) {
            focusByDay[dayString].total++;
            if (row[4] === "Yes") { // Column E is Drifted
              focusByDay[dayString].drifted++;
            }
          }
      });

      const focusData = {
        labels: Object.keys(focusByDay),
        values: Object.values(focusByDay).map(day => {
          if (day.total === 0) return 0;
          return Math.round(((day.total - day.drifted) / day.total) * 100);
        })
      };

      // --- Assemble Response ---
      const responseData = { tagData, keywordData, focusData };
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", data: responseData })
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
 * @description Handles POST requests from the Chrome extension to log new data.
 * @param {object} e - The event parameter containing the POST data.
 * @returns {ContentService.TextOutput} A JSON response indicating success or failure.
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
        throw new Error(`Sheet not found: ${SHEET_NAME}`);
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
      throw new Error(`Sheet not found. Please ensure a sheet named "${SHEET_NAME}" exists.`);
    }
    
    const now = new Date();
    const fullTimestamp = now.toISOString();
    const dateFormatted = Utilities.formatDate(now, TIME_ZONE, "yyyy-MM-dd");
    const timeFormatted = Utilities.formatDate(now, TIME_ZONE, "HH:mm:ss");

    let minsSinceLast = "N/A";
    const lastRow = sheet.getLastRow();
    
    if (lastRow >= 1) {
      const lastTimestampStr = sheet.getRange(lastRow, 7).getValue(); 
      if (lastTimestampStr) {
        const lastTimestamp = new Date(lastTimestampStr);
        const diffMs = now.getTime() - lastTimestamp.getTime();
        minsSinceLast = Math.round(diffMs / 60000);
      }
    }

    const newRow = [
      dateFormatted, timeFormatted, logEntry, tag, drifted,
      minsSinceLast, fullTimestamp, domain, reactive, keywords
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
