/*
 * Google Apps Script for Work Log Chrome Extension (v1.3)
 * - Splits Date and Time
 * - Allows empty tags
 * - Calculates time since last log using a new FullTimestamp column
 */

// This function runs when the web app receives a POST request.
function doPost(e) {
  try {
    // *** RENAME "Sheet1" if your sheet has a different name ***
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    
    if (!sheet) {
      throw new Error("Sheet named 'Sheet1' not found. Please create it or update the script.");
    }

    // --- Parse Data ---
    var data = JSON.parse(e.postData.contents);
    var logEntry = data.log;
    var tag = data.tag || ""; // Default to empty string if no tag
    var drifted = data.drifted || false; // Default to false
    
    if (!logEntry) {
       throw new Error("Missing 'log' property in data payload.");
    }
    
    // --- Timestamp and Formatting ---
    var timestamp = new Date();
    // Get the script's timezone to format dates correctly
    var scriptTimeZone = Session.getScriptTimeZone();
    var dateStr = Utilities.formatDate(timestamp, scriptTimeZone, "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(timestamp, scriptTimeZone, "HH:mm");
    
    var minsSinceLast = 0;

    // --- Calculate Time Since Last ---
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) { // Check if there's data beyond the header
        // Get the timestamp from the last row, Column G (FullTimestamp)
        var lastFullTimestamp = sheet.getRange(lastRow, 7).getValue();
        
        if (lastFullTimestamp && lastFullTimestamp.getTime) {
          var diffMs = timestamp.getTime() - lastFullTimestamp.getTime();
          minsSinceLast = Math.round(diffMs / 60000); // Convert milliseconds to minutes
        }
      }
    } catch (timeErr) {
      // If time calculation fails, log it but don't stop the script
      Logger.log("Error calculating time since last: " + timeErr.message);
      minsSinceLast = -1; // Use -1 to indicate an error
    }

    // --- Add New Row ---
    // Columns: Date, Time, Log Entry, Tag, Drifted, Mins Since Last, FullTimestamp
    sheet.appendRow([dateStr, timeStr, logEntry, tag, drifted, minsSinceLast, timestamp]);

    // --- Return Success ---
    return ContentService.createTextOutput(JSON.stringify({ 
        "status": "success", 
        "row": sheet.getLastRow(),
        "data": {
          "date": dateStr,
          "time": timeStr,
          "log": logEntry,
          "tag": tag,
          "drifted": drifted,
          "minsSinceLast": minsSinceLast
        }
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // --- Return Error ---
    Logger.log(err);
    return ContentService.createTextOutput(JSON.stringify({ 
        "status": "error", 
        "message": err.message 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
