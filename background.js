// IMPORTANT: REPLACE THIS URL with your *new* v1.2 Google Apps Script URL.
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxn5eukQ3sSLrrQsMbUo6PzyyY7aEz9b2Y6xgQFHQdLmSc7csGcc4irUOuxqsO4YbI/exec";

// --- Alarm Management ---

// Create the alarm when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("Work Log extension installed (v1.5). Creating 1-min alarm...");
  createWorkLogAlarm(1); // Start 1 minute after install
  // Set default badge color
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
});

// Create the alarm on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser starting up. Creating 1-min alarm...");
  createWorkLogAlarm(1); // Start 1 minute after startup
});

/**
 * Creates the main repeating work log alarm.
 * @param {number | null} initialDelayInMinutes - The delay for the *first* alarm.
 * If null, defaults to the full logInterval.
 */
function createWorkLogAlarm(initialDelayInMinutes = null) {
  // Clear all alarms first to prevent duplicates
  chrome.alarms.clearAll((wasCleared) => {
    if (wasCleared) console.log("Cleared all previous alarms.");
    
    // Get the user-defined interval from storage, default to 15
    chrome.storage.sync.get({ logInterval: 15 }, (data) => {
      const logInterval = parseInt(data.logInterval, 10) || 15;
      
      // Use the provided initial delay, or default to the full interval
      const firstDelay = initialDelayInMinutes !== null ? initialDelayInMinutes : logInterval;
      
      console.log(`Creating 'workLogAlarm'. First run in ${firstDelay} min(s), then every ${logInterval} min(s).`);
      
      // Create the repeating alarm
      chrome.alarms.create("workLogAlarm", {
        delayInMinutes: firstDelay,
        periodInMinutes: logInterval
      });
    });
  });
}

// Listen for all alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  // Main timer
  if (alarm.name === "workLogAlarm") {
    console.log("Work Log Alarm triggered.");
    checkDayAndTriggerPopup();
  }
  
  // Special 5-minute postpone timer
  if (alarm.name === "postponeAlarm") {
    console.log("Postpone Alarm triggered.");
    checkDayAndTriggerPopup();
    // After the postpone alarm fires, re-create the main alarm.
    // This restarts the main cycle, with the first alarm
    // firing after the *full* interval.
    createWorkLogAlarm(); // No param = use full interval for delay
  }
});

// --- New: Listen for keyboard shortcut ---
chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger-log-popup") {
    console.log("Manual log popup triggered by keyboard shortcut.");
    // We trigger the popup directly, bypassing work-hour/day checks
    // as this is an explicit user action.
    triggerPopupOnActiveTab();
  }
});

function checkDayAndTriggerPopup() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ...
  const currentHour = today.getHours(); // 0-23
  
  // Get working days and hours from storage
  chrome.storage.sync.get({
    // Default to Mon-Fri
    workingDays: ["1", "2", "3", "4", "5"],
    // Default to 9:00 - 18:00
    workStartHour: 9,
    workEndHour: 18 
  }, (data) => {
    
    const isWorkingDay = data.workingDays.includes(dayOfWeek.toString());
    // Check if current hour is between start (inclusive) and end (exclusive)
    // e.g., 9 to 18 means 9:00:00 up to 17:59:59
    const isWorkingHour = currentHour >= data.workStartHour && currentHour < data.workEndHour;

    if (isWorkingDay && isWorkingHour) {
      console.log("It's a working day and hour. Triggering popup on active tab.");
      triggerPopupOnActiveTab();
    } else if (!isWorkingDay) {
      console.log("It's not a working day. No log needed.");
    } else if (!isWorkingHour) {
      console.log(`It's not a working hour (${currentHour}h is outside ${data.workStartHour}-${data.workEndHour}). No log needed.`);
    }
  });
}

function triggerPopupOnActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "showLogPopup" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Could not send message:", chrome.runtime.lastError.message);
        } else {
          console.log("Popup message sent, response:", response);
        }
      });
    } else {
      console.warn("No active tab found.");
    }
  });
  
  // --- New: Set badge text ---
  console.log("Setting badge text.");
  chrome.action.setBadgeText({ text: '!' });
}


// --- Data Handling & Message Listeners ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Case 1: User submitted a log
  if (request.action === "logWork") {
    // request.data is now an object: { logText, tag, drifted }
    console.log("Received log object:", request.data);
    
    if (WEB_APP_URL === "YOUR_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_HERE") {
        const errorMsg = "Extension not configured. Please update WEB_APP_URL in background.js with your new v1.2 URL.";
        console.error(errorMsg);
        chrome.storage.local.set({ lastError: errorMsg });
        sendResponse({ status: "error", message: errorMsg });
        return true;
    }
      
    // Send the full data object to the Google Sheet
    logToGoogleSheet(request.data)
      .then((jsonResponse) => {
        console.log("Log successfully sent:", jsonResponse);
        // Save this log as the "last successful log"
        chrome.storage.local.set({ 
          lastLog: request.data.logText,
          lastTag: request.data.tag,
          lastError: "" 
        });
        // --- New: Clear badge on success ---
        chrome.action.setBadgeText({ text: '' });
        sendResponse({ status: "success" });
      })
      .catch((error) => {
        console.error("Error sending log to Google Sheet:", error.message);
        chrome.storage.local.set({ lastError: error.message });
        sendResponse({ status: "error", message: error.message });
      });
    
    return true; // Indicates async response
  }
  
  // Case 2: User hit "Postpone 5 min"
  if (request.action === "postponeLog") {
    console.log("Postponing log for 5 minutes.");
    // Clear the main alarm first
    chrome.alarms.clear("workLogAlarm", (wasCleared) => {
      // Create a new, one-time alarm
      chrome.alarms.create("postponeAlarm", {
        delayInMinutes: 5
      });
      sendResponse({ status: "postponed" });
    });
    return true; // Indicates async response
  }
  
  // Case 3: User changed settings in the Options page
  if (request.action === "settingsUpdated") {
    console.log("Settings updated. Re-creating alarm (1-min delay).");
    // Re-create the main alarm with the new interval, firing in 1 min
    createWorkLogAlarm(1);
    sendResponse({ status: "settings acknowledged" });
    return true;
  }

  // Case 4: The popup.html is asking for debug info
  if (request.action === "getDebugInfo") {
    chrome.storage.local.get({ lastError: "No errors yet." }, (data) => {
      sendResponse({
        webAppUrl: WEB_APP_URL,
        lastError: data.lastError
      });
    });
    return true; // Indicates async response
  }
  
});

// --- Google Sheet Fetch Logic ---

async function logToGoogleSheet(logData) {
  // logData = { logText, tag, drifted }
  const payload = {
    log: logData.logText,
    tag: logData.tag,
    drifted: logData.drifted
  };
  
  let response;

  try {
    response = await fetch(WEB_APP_URL, {
      method: "POST",
      cache: "no-cache",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      redirect: "follow",
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Network error: ${response.status} - ${response.statusText}`);
    }

    const json = await response.json();

    if (json.status !== "success") {
      throw new Error(`Google Script Error: ${json.message || 'Unknown error'}`);
    }

    return json;

  } catch (error) {
    console.error("Fetch error details:", error);
    let errorMessage = error.message;
    if (error.message.includes("Failed to fetch")) {
        errorMessage = "Fetch failed. Check URL, network, or CORS. Did you re-deploy and update the URL?";
    } else if (error.message.includes("Unexpected token")) {
        errorMessage = "Google Script did not return valid JSON. Check your Apps Script code for errors.";
    }
    throw new Error(errorMessage);
  }
}



