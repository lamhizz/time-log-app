// [SEC-01] IMPORTANT: The WEB_APP_URL is now stored in chrome.storage.sync

// --- Alarm Management ---

// Create the alarm when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("Work Log extension installed (v1.9). Creating 1-min alarm...");

  // --- Set all default settings on install ---
  // This will set defaults, but not overwrite existing settings
  chrome.storage.sync.get(null, (existingSettings) => {
    const defaults = {
      logInterval: 15,
      logTags: "Meeting\nFocus Time\nSlack\nJira Tasks\nEmailing\nBreak",
      isDebugMode: false,
      workingDays: ["1", "2", "3", "4", "5"],
      workStartHour: 9,
      workEndHour: 18,
      blockedDomains: "meet.google.com\nzoom.us\nyoutube.com\ntwitch.tv",
      webAppUrl: "https://script.google.com/macros/s/AKfycbyHWeCBtEU1oW1RTnK-mtlXA2dvXJ6c-ULz221_HAIy_3QRDl_9s1v8YvOpzH99iipUCQ/exec",
      isDomainLogEnabled: false // --- New: [FEAT-03] ---
    };
    
    // Only set defaults for keys that are not already in storage
    let newSettings = {};
    for (let key in defaults) {
      if (existingSettings[key] === undefined) {
        newSettings[key] = defaults[key];
      }
    }
    
    if (Object.keys(newSettings).length > 0) {
      chrome.storage.sync.set(newSettings, () => {
        console.log("Default settings saved:", newSettings);
      });
    }
  });


  createWorkLogAlarm(1); // Start 1 minute after install
  // Set default badge color
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
  
  // --- New: [UX-03] Context Menu ---
  chrome.contextMenus.create({
    id: "logWorkContextMenu",
    title: "Log Work",
    contexts: ["page"]
  });
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
  
  // [UX-02] Renamed from "postponeAlarm"
  if (alarm.name === "snoozeAlarm") {
    console.log("Snooze Alarm triggered.");
    checkDayAndTriggerPopup();
    // After the snooze alarm fires, re-create the main alarm.
    // This restarts the main cycle, with the first alarm
    // firing after the *full* interval.
    createWorkLogAlarm(); // No param = use full interval for delay
  }
});

// --- New: [UX-03] Listen for Context Menu ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "logWorkContextMenu") {
    console.log("Manual log popup triggered by context menu.");
    // `tab` is provided by the listener
    // We pass `true` to bypassDnd check, as this is an explicit user action.
    triggerPopupOnTab(tab, true); 
  }
});

// --- New: [UX-03] Listen for keyboard shortcut ---
chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger-log-popup") {
    console.log("Manual log popup triggered by keyboard shortcut.");
    // We trigger the popup directly, bypassing work-hour/day checks
    // as this is an explicit user action.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        // We pass `true` to bypassDnd check
        triggerPopupOnTab(tabs[0], true);
      }
    });
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
      // Get active tab and trigger popup (which will include DND check)
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          triggerPopupOnTab(tabs[0], false); // Pass `false` to NOT bypassDnd
        } else {
          console.warn("No active tab found.");
        }
      });
    } else if (!isWorkingDay) {
      console.log("It's not a working day. No log needed.");
    } else if (!isWorkingHour) {
      console.log(`It's not a working hour (${currentHour}h is outside ${data.workStartHour}-${data.workEndHour}). No log needed.`);
    }
  });
}

/**
 * [UX-01] Refactored function to trigger popup on a specific tab
 * and includes the "Do Not Disturb" check.
 * @param {chrome.tabs.Tab} tab - The tab to trigger the popup on.
 * @param {boolean} bypassDnd - If true, skip the DND check (for manual triggers).
 */
async function triggerPopupOnTab(tab, bypassDnd = false) {
  if (!tab || !tab.id || !tab.url) {
    console.warn("Invalid tab object.", tab);
    return;
  }
  
  const tabId = tab.id;
  const tabUrl = tab.url;
  
  // [UX-01] Do Not Disturb check
  // --- New: [FEAT-03] Also get isDomainLogEnabled setting ---
  chrome.storage.sync.get({ 
    blockedDomains: "",
    isDomainLogEnabled: false
  }, (data) => {
    const domains = data.blockedDomains.split('\n').filter(Boolean);
    
    // Check if the tab's URL hostname matches any blocked domain
    let urlHostname = "";
    try {
      urlHostname = new URL(tabUrl).hostname;
    } catch (e) {
      // Invalid URL (e.g., "chrome://", "about:blank"), can't get hostname
    }
    
    const isBlocked = domains.some(domain => urlHostname.includes(domain.trim()));

    // If it's blocked AND we are *not* bypassing the check
    if (isBlocked && !bypassDnd) {
      console.log(`Popup skipped: Active tab (${tabUrl}) is on a "Do Not Disturb" domain.`);
      // We do nothing, and the main alarm will just fire again at its next
      // scheduled interval.
      return;
    }
    
    // [PERF-01] If not blocked, or if check is bypassed,
    // programmatically inject scripts and then send message.
    console.log(`Injecting scripts into tab ${tab.id}`);
    (async () => {
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["style.css"]
        });
        
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        
        // --- New: [FEAT-03] Pass domain to content script if enabled ---
        const domainToLog = data.isDomainLogEnabled ? urlHostname : "";
        
        // Now that scripts are injected, send the message to show the popup
        chrome.tabs.sendMessage(tab.id, { 
          action: "showLogPopup",
          domain: domainToLog // Pass the domain (or "")
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`Could not send message to tab ${tab.id}:`, chrome.runtime.lastError.message);
          } else {
            console.log("Popup message sent, response:", response);
          }
        });

        // Set the badge
        console.log("Setting badge text.");
        chrome.action.setBadgeText({ text: '!' });

      } catch (err) {
        console.error(`Failed to inject scripts into tab ${tab.id} (${tab.url}): ${err.message}. This might be a protected page.`);
      }
    })(); // Execute the async function
  });
}


// --- Data Handling & Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Case 1: User submitted a log
  if (request.action === "logWork") {
    // request.data is now an object: { logText, tag, drifted, domain }
    console.log("Received log object:", request.data);
    
    // [SEC-01] Get URL from storage
    chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
      const WEB_APP_URL = data.webAppUrl;

      if (!WEB_APP_URL) {
          const errorMsg = "Google Apps Script URL is not set. Please set it in the extension options.";
          console.error(errorMsg);
          chrome.storage.local.set({ lastError: errorMsg });
          sendResponse({ status: "error", message: errorMsg });
          return; // Stop execution
      }
        
      // Send the full data object to the Google Sheet
      logToGoogleSheet(request.data, WEB_APP_URL) // Pass URL
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
    });
    
    return true; // Indicates async response
  }
  
  // Case 2: [UX-02] User hit "Snooze" or "Skip"
  if (request.action === "snoozeLog") {
    const minutes = request.minutes;
    
    // Clear the main alarm first
    chrome.alarms.clear("workLogAlarm", (wasCleared) => {
      if (minutes > 0) {
        // Create a new, one-time snooze alarm
        console.log(`Snoozing log for ${minutes} minutes.`);
        chrome.alarms.create("snoozeAlarm", {
          delayInMinutes: minutes
        });
        sendResponse({ status: "snoozed" });
      } else {
        // This is "Skip this log" (minutes = -1)
        console.log("Skipping this log. Resetting main alarm cycle.");
        // Re-create the main alarm to start its *next* full cycle
        createWorkLogAlarm();
        sendResponse({ status: "skipped" });
      }
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
    // [SEC-01] Must fetch URL from storage
    chrome.storage.sync.get({ webAppUrl: "(Not Set)" }, (syncData) => {
      chrome.storage.local.get({ lastError: "No errors yet." }, (localData) => {
        sendResponse({
          webAppUrl: syncData.webAppUrl,
          lastError: localData.lastError
        });
      });
    });
    return true; // Indicates async response
  }

  // --- FIX: [FEAT-03] ---
  // Case 5: The popup.js is asking for the active tab's domain
  if (request.action === "getActiveTabInfo") {
    // Get settings first to see if domain logging is enabled
    chrome.storage.sync.get({ isDomainLogEnabled: false }, (data) => {
      if (!data.isDomainLogEnabled) {
        sendResponse({ domain: "" }); // Send empty domain if disabled
        return;
      }
      
      // If enabled, query for the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].url) {
          let urlHostname = "";
          try {
            urlHostname = new URL(tabs[0].url).hostname;
          } catch (e) {
            // Invalid URL (e.g., "chrome://", "about:blank")
          }
          sendResponse({ domain: urlHostname });
        } else {
          sendResponse({ domain: "" }); // No active tab found or no URL
        }
      });
    });
    return true; // Indicates async response
  }
  
});

// --- Google Sheet Fetch Logic ---

async function logToGoogleSheet(logData, webAppUrl) {
  // logData = { logText, tag, drifted, domain }
  const payload = {
    log: logData.logText,
    tag: logData.tag,
    drifted: logData.drifted
  };
  
  // --- New: [FEAT-03] *** FIX ***
  // Check if .domain exists (even if it's "")
  if (logData.domain !== undefined) {
    payload.domain = logData.domain;
  }
  
  let response;

  try {
    response = await fetch(webAppUrl, {
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

