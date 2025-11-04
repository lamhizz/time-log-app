/**
 * @file background.js
 * @description This is the service worker for the WurkWurk Chrome extension.
 * It manages alarms, handles context menus, listens for keyboard shortcuts,
 * and processes all communication with the content scripts and the Google Apps Script backend.
 */

// --- Global Badge State ---

/**
 * @type {boolean}
 * @description Tracks if the timer badge ('ON') is currently active.
 */
let timerBadgeActive = false;

/**
 * @type {boolean}
 * @description Tracks if the alarm badge ('!') is currently active.
 */
let alarmBadgeActive = false;

/**
 * @type {number|null}
 * @description Stores the ID of the tab where the log prompt is currently active.
 */
let logPromptTabId = null;

// --- NEW: Helper for rate limiting ---
/**
 * @description A simple promise-based sleep function.
 * @param {number} ms - The number of milliseconds to wait.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// --- Extension Lifecycle & Alarm Management ---

/**
 * @description Initializes the extension on installation. Sets default settings,
 * creates a context menu item, sets up an initial alarm, and opens the 'About' page.
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log("WurkWurk extension installed (v3.0).");

  // Set default values in storage if they don't exist
  chrome.storage.sync.get(null, (existingSettings) => {
    const defaults = {
      logInterval: 15,
      logTags: "Meeting\nFocus Time\nSlack\nJira Tasks\nEmailing\nBreak",
      isDebugMode: false,
      workingDays: ["1", "2", "3", "4", "5"],
      workStartHour: 9,
      workEndHour: 18,
      blockedDomains: "meet.google.com\nzoom.us\nyoutube.com\ntwitch.tv",
      webAppUrl: "",
      isDomainLogEnabled: false,
      notificationSound: "ClickUp.wav",
      isPomodoroEnabled: true
    };
    
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
  
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red for alarm state
  
  checkTimerStateOnStartup();
  
  // Only create an alarm if the interval is > 0
  chrome.storage.sync.get({ logInterval: 15 }, (data) => {
    if (data.logInterval > 0) {
      createWorkLogAlarm(1); // Create a short-delay alarm on install
    }
  });

  // Add a context menu item for manual logging
  chrome.contextMenus.create({
    id: "logWorkContextMenu",
    title: "Log to WurkWurk",
    contexts: ["page"]
  });

  // Open the about page on first install
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("about.html") });
  }

  // Request notification permission on first install
  chrome.notifications.getPermissionLevel((level) => {
    if (level === "denied") {
      console.warn("Notification permission has been denied by the user.");
    }
  });

  // --- NEW: Daily Stats Alarm ---
  chrome.alarms.create("midnightReset", {
    when: new Date().setHours(24, 0, 0, 0), // Next midnight
    periodInMinutes: 24 * 60 // Repeat every 24 hours
  });
});

/**
 * @description Re-initializes alarms when the browser starts up.
 */
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser starting up. Checking alarm state...");
  checkTimerStateOnStartup();
  
  // Only create an alarm if the interval is > 0
  chrome.storage.sync.get({ logInterval: 15 }, (data) => {
    if (data.logInterval > 0) {
      createWorkLogAlarm(1);
    } else {
      console.log("Log interval is 0, automatic alarms disabled.");
    }
  });
});

/**
 * @description Checks if a task was active when the browser was last closed
 * and updates the badge accordingly.
 */
function checkTimerStateOnStartup() {
  chrome.storage.local.get({ activeTask: null }, (data) => {
    if (data.activeTask) {
      console.log("Active task found on startup. Setting badge.");
      timerBadgeActive = true;
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green for timer state
    }
  });
}

/**
 * @description Runs a multi-step diagnostic check on the user's Google Apps Script setup.
 * @param {string} url - The Google Apps Script URL to diagnose.
 * @returns {Promise<object>} A promise that resolves to a detailed diagnostic report.
 */
async function runDiagnostics(url) {
  // 1. URL Format Check
  if (!url || !url.startsWith("https://script.google.com/")) {
    return {
      checks: {
        url: { success: false, message: "Invalid URL format. Must be a https://script.google.com/... link." }
      },
      overallStatus: "error"
    };
  }

  const report = {
    checks: {
      url: { success: true, message: "Google Apps Script URL is valid." }
    },
    overallStatus: "pending"
  };

  // 2. Connection & Diagnostics Check (MODIFIED TO USE POST)
  try {
    const response = await fetch(url, { // No query params needed on URL
      method: "POST",
      cache: "no-cache",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "diagnose" }) // Send action in POST body
    });

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.status} - ${response.statusText}. Please ensure the script is deployed and permissions are set to 'Anyone'.`);
    }

    const json = await response.json();
    if (json.status !== "success") {
      throw new Error(`Google Script Error: ${json.message || 'Diagnostics failed'}`);
    }

    report.checks.connection = { success: true, message: "Successfully connected to the script." };

    // 3. Script Version Check
    const requiredVersion = "3.2"; // Updated to check for 3.2
    if (json.version && parseFloat(json.version) >= parseFloat(requiredVersion)) {
      report.checks.version = { success: true, message: `Your Google Apps Script is up-to-date (v${json.version}).` };
    } else {
      report.checks.version = { success: false, message: `Outdated script version. Expected v${requiredVersion} or newer, but found v${json.version || "unknown"}. Please update the script from the Setup Guide.` };
    }

    // 4. Sheet Header Check
    const requiredHeaders = ["Date", "Time", "Log Entry", "Tag", "Drifted", "Mins Since Last", "FullTimestamp", "Domain", "Reactive", "Keywords"];
    const actualHeaders = json.headers || [];
    let headerErrors = [];

    for (let i = 0; i < requiredHeaders.length; i++) {
      if (i >= actualHeaders.length) {
        headerErrors.push(`- Expected '${requiredHeaders[i]}' in Column ${String.fromCharCode(65 + i)}, but found nothing.`);
      } else if (requiredHeaders[i] !== actualHeaders[i]) {
        headerErrors.push(`- Expected '${requiredHeaders[i]}' in Column ${String.fromCharCode(65 + i)}, but found '${actualHeaders[i]}'.`);
      }
    }

    if (headerErrors.length === 0) {
      report.checks.headers = { success: true, message: "Found all 10 required columns in the correct order." };
    } else {
      report.checks.headers = { success: false, message: `Your Google Sheet headers are incorrect.\n${headerErrors.join("\n")}` };
    }

    // Determine overall status
    const allChecksPassed = Object.values(report.checks).every(check => check.success);
    report.overallStatus = allChecksPassed ? "success" : "error";

  } catch (error) {
    let errorMessage = error.message;
    if (error.message.includes("Failed to fetch")) {
        errorMessage = "Fetch failed. Check URL, network, or CORS. Is the script deployed correctly?";
    } else if (error.message.includes("Unexpected token")) {
        errorMessage = "Google Script did not return valid JSON. Check your Apps Script code for errors.";
    }
    report.checks.connection = { success: false, message: errorMessage };
    report.overallStatus = "error";
  }

  return report;
}


/**
 * @description Clears any existing alarms and creates a new periodic "workLogAlarm".
 * @param {number|null} initialDelayInMinutes - The delay for the first alarm trigger.
 * If null, defaults to the user's configured log interval.
 */
function createWorkLogAlarm(initialDelayInMinutes = null) {
  chrome.alarms.clearAll((wasCleared) => {
    if (wasCleared) console.log("Cleared all previous alarms.");
    
    chrome.storage.sync.get({ logInterval: 15 }, (data) => {
      const logInterval = parseInt(data.logInterval, 10) || 15;
      
      // Do not create an alarm if the interval is 0
      if (logInterval <= 0) {
        console.log("Log interval is 0, automatic alarms disabled.");
        return;
      }
      
      const firstDelay = initialDelayInMinutes !== null ? initialDelayInMinutes : logInterval;
      
      console.log(`Creating 'workLogAlarm'. First run in ${firstDelay} min(s), then every ${logInterval} min(s).`);
      
      chrome.alarms.create("workLogAlarm", {
        delayInMinutes: firstDelay,
        periodInMinutes: logInterval
      });
    });
  });
}

/**
 * @description Listens for alarms and triggers the appropriate actions.
 * 'workLogAlarm' and 'snoozeAlarm' will trigger the popup.
 * After a snooze, the main alarm is recreated.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "workLogAlarm") {
    console.log("Work Log Alarm triggered.");
    checkDayAndTriggerPopup();
  }
  
  if (alarm.name === "snoozeAlarm") {
    console.log("Snooze Alarm triggered.");
    checkDayAndTriggerPopup();
    createWorkLogAlarm(); // Re-create the main alarm after a snooze
  }

  if (alarm.name === "midnightReset") {
    console.log("Midnight. Resetting daily stats.");
    chrome.storage.local.set({
      logsToday: 0,
      tasksCompleted: 0,
      driftedLogs: 0,
      recentLogs: []
    });
  }
});

// --- User Interaction Handlers ---

/**
 * @description Listens for clicks on the notification buttons.
 */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === "workLogNotification") {
    if (buttonIndex === 0) { // "Log Now" button
      console.log("Notification 'Log Now' clicked.");
      if (logPromptTabId) {
        chrome.tabs.update(logPromptTabId, { active: true }, (tab) => {
          if (tab) chrome.windows.update(tab.windowId, { focused: true });
        });
      }
    } else if (buttonIndex === 1) { // "Snooze 5 Min" button
      console.log("Notification 'Snooze 5 Min' clicked.");
      chrome.alarms.create("snoozeAlarm", { delayInMinutes: 5 });
      if (logPromptTabId) {
        chrome.tabs.sendMessage(logPromptTabId, { action: "dismissPopup" });
      }
    }
    chrome.notifications.clear("workLogNotification");
    logPromptTabId = null;
  }
});

/**
 * @description Handles clicks on the context menu item to manually trigger the log popup.
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "logWorkContextMenu") {
    console.log("Manual log popup triggered by context menu.");
    triggerPopupOnTab(tab, true); // Bypass Do Not Disturb for manual triggers
  }
});

/**
 * @description Handles the keyboard shortcut (e.g., Ctrl+Shift+L) to manually trigger the log popup.
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger-log-popup") {
    console.log("Manual log popup triggered by keyboard shortcut.");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        triggerPopupOnTab(tabs[0], true); // Bypass DND
      }
    });
  }
});

/**
 * @description Checks if the current day and time fall within the user's defined
 * working hours before triggering the popup.
 */
function checkDayAndTriggerPopup() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, etc.
  const currentHour = today.getHours();
  
  chrome.storage.sync.get({
    workingDays: ["1", "2", "3", "4", "5"], // Default Mon-Fri
    workStartHour: 9,
    workEndHour: 18 
  }, (data) => {
    
    const isWorkingDay = data.workingDays.includes(dayOfWeek.toString());
    const isWorkingHour = currentHour >= data.workStartHour && currentHour < data.workEndHour;

    if (isWorkingDay && isWorkingHour) {
      console.log("It's a working day and hour. Triggering popup on active tab.");
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          triggerPopupOnTab(tabs[0], false);
        } else {
          console.warn("No active tab found.");
        }
      });
    } else {
      console.log("Not a working time. No log needed.");
    }
  });
}

/**
 * @description Injects the content script and CSS into the active tab to show the log popup.
 * It respects the "Do Not Disturb" (DND) domain list unless bypassed.
 * @param {chrome.tabs.Tab} tab - The target tab object.
 * @param {boolean} [bypassDnd=false] - If true, the popup will show even on a blocked domain.
 */
async function triggerPopupOnTab(tab, bypassDnd = false) {
  if (!tab || !tab.id || !tab.url) {
    console.warn("Invalid tab object.", tab);
    return;
  }
  
  // Don't show on other extension pages or protected chrome:// pages
  if (tab.url.startsWith("chrome-extension://") || tab.url.startsWith("chrome://")) {
    console.log("Popup skipped: Cannot inject into protected pages.");
    return;
  }

  chrome.storage.sync.get({ 
    blockedDomains: "",
    isDomainLogEnabled: false,
    notificationSound: "ClickUp.wav",
    notificationVolume: 0.5 // <-- Add volume
  }, (data) => {
    const domains = data.blockedDomains.split('\n').filter(Boolean);
    
    let urlHostname = "";
    try {
      urlHostname = new URL(tab.url).hostname;
    } catch (e) {
      // Handles cases like chrome:// URLs that are not valid URLs
    }
    
    const isBlocked = domains.some(domain => urlHostname.includes(domain.trim()));

    if (isBlocked && !bypassDnd) {
      console.log(`Popup skipped: Active tab (${tab.url}) is on a "Do Not Disturb" domain.`);
      return;
    }
    
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
        
        const domainToLog = data.isDomainLogEnabled ? urlHostname : "";
        
        // --- NEW: Show desktop notification first ---
        showDesktopNotification();
        logPromptTabId = tab.id; // Store the tab ID

        // Send a message to the content script to show the popup
        chrome.tabs.sendMessage(tab.id, {
          action: "showLogPopup",
          domain: domainToLog,
          sound: data.notificationSound,
          volume: data.notificationVolume // <-- Pass volume
        });

        // Set the alarm badge
        alarmBadgeActive = true;
        chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
        chrome.action.setBadgeText({ text: '!' });

      } catch (err) {
        console.error(`Failed to inject scripts into tab ${tab.id} (${tab.url}): ${err.message}. This might be a protected page.`);
      }
    })();
  });
}

/**
 * @description Displays a desktop notification to the user.
 */
function showDesktopNotification() {
  chrome.notifications.create("workLogNotification", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/wurk-wurk-logo-128.png"),
    title: "WurkWurk: Time to Log Your Work",
    message: "Click to quickly log your last task and keep your streak going.",
    buttons: [
      { title: "Log Now" },
      { title: "Snooze 5 Min" }
    ],
    requireInteraction: true // Keep the notification open until user interaction
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error("Notification creation failed:", chrome.runtime.lastError.message);
    } else {
      console.log("Desktop notification created:", notificationId);
    }
  });
}

// --- Data & Utility Functions ---

/**
 * @description Updates the list of Most Recently Used (MRU) tags in local storage.
 * Keeps the list to a maximum of 3 unique tags.
 * @param {string} tag - The tag that was just used.
 */
function updateMruTags(tag) {
  if (!tag) return;

  chrome.storage.local.get({ mruTags: [] }, (data) => {
    let mruTags = data.mruTags || [];
    // Remove the tag if it already exists to avoid duplicates
    mruTags = mruTags.filter(t => t !== tag);
    // Add the new tag to the beginning of the array
    mruTags.unshift(tag);
    // Trim the array to the 3 most recent tags
    const newMruTags = mruTags.slice(0, 3);
    chrome.storage.local.set({ mruTags: newMruTags });
  });
}

/**
 * @description Sends a test request to the configured Google Apps Script URL to verify connectivity.
 * @param {string} url - The Google Apps Script URL to test.
 * @returns {Promise<object>} A promise that resolves to a JSON object with the test result.
 */
async function testWebAppConnection(url) {
  if (!url || (!url.startsWith("http:") && !url.startsWith("https://"))) {
    return { status: "error", message: "Invalid URL. Must start with http:// or https://" };
  }
  
  // MODIFIED TO USE POST
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-cache",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "test" }) // Send action in POST body
    });

    if (!response.ok) {
      throw new Error(`Network error: ${response.status} - ${response.statusText}`);
    }

    const json = await response.json();

    if (json.status !== "success") {
      throw new Error(`Google Script Error: ${json.message || 'Test failed'}`);
    }
    
    return json; 

  } catch (error) {
    console.error("Test Connection error details:", error);
    let errorMessage = error.message;
    if (error.message.includes("Failed to fetch")) {
        errorMessage = "Fetch failed. Check URL, network, or CORS. Is the script deployed correctly?";
    } else if (error.message.includes("Unexpected token")) {
        errorMessage = "Google Script did not return valid JSON. Check your Apps Script code for errors.";
    }
    return { status: "error", message: errorMessage };
  }
}

// --- Message Handling ---

/**
 * @description Central listener for messages from other parts of the extension (e.g., content scripts, popups).
 * It routes requests to the appropriate functions based on the 'action' property.
 * @param {object} request - The message object.
 * @param {chrome.runtime.MessageSender} sender - Information about the sender.
 * @param {function} sendResponse - A function to send a response back to the sender.
 * @returns {boolean} Returns true to indicate that the response will be sent asynchronously.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  switch (request.action) {
    // Case 1: A new log is submitted from the content script or popup
    case "logWork":
      console.log("Received log object:", request.data);
      chrome.notifications.clear("workLogNotification");
      logPromptTabId = null;
      // We now pass the logData object to logToGoogleSheet
      // which will return it with 'time' and 'gap' info.
      logToGoogleSheet(request.data)
        .then((fullLogData) => {
          chrome.storage.local.set({
            lastLog: fullLogData.logText, // Keep this for "Doing Same"
            lastTag: fullLogData.tag, // Keep this for "Doing Same"
            lastError: ""
          });
          updateMruTags(fullLogData.tag);
          updateDailyStats(fullLogData); // Pass the rich object
          
          alarmBadgeActive = false;
          if (!timerBadgeActive) {
            chrome.action.setBadgeText({ text: '' });
          }
          sendResponse({ status: "success" });
        })
        .catch((error) => {
          chrome.storage.local.set({ lastError: error.message });
          sendResponse({ status: "error", message: error.message });
        });
      return true;

    // Case 2: User snoozes or skips a log
    case "snoozeLog":
      chrome.notifications.clear("workLogNotification");
      logPromptTabId = null;
      alarmBadgeActive = false;
      if (!timerBadgeActive) {
        chrome.action.setBadgeText({ text: '' });
      }
      chrome.alarms.clear("workLogAlarm", () => {
        if (request.minutes > 0) {
          console.log(`Snoozing log for ${request.minutes} minutes.`);
          chrome.alarms.create("snoozeAlarm", { delayInMinutes: request.minutes });
          sendResponse({ status: "snoozed" });
        } else {
          console.log("Skipping this log. Resetting main alarm cycle.");
          createWorkLogAlarm();
          sendResponse({ status: "skipped" });
        }
      });
      return true;

    // Case 3: User logs and then snoozes
    case "logAndSnooze":
	  chrome.notifications.clear("workLogNotification");
      logPromptTabId = null;
      console.log(`Received logAndSnooze for ${request.minutes} min:`, request.data);

      logToGoogleSheet(request.data)
        .then((fullLogData) => {
          chrome.storage.local.set({
            lastLog: fullLogData.logText,
            lastTag: fullLogData.tag,
            lastError: ""
          });
          updateMruTags(fullLogData.tag);
          updateDailyStats(fullLogData); // Pass the rich object

          alarmBadgeActive = false;
          if (!timerBadgeActive) {
            chrome.action.setBadgeText({ text: '' });
          }

          chrome.alarms.clear("workLogAlarm", () => {
            chrome.alarms.create("snoozeAlarm", { delayInMinutes: request.minutes });
            sendResponse({ status: "success_and_snoozed" });
          });
        })
        .catch((error) => {
          chrome.storage.local.set({ lastError: error.message });
          sendResponse({ status: "error", message: error.message });
        });
      return true;

    // Case 4: Settings have been updated in the options page
    case "settingsUpdated":
      console.log("Settings updated. Re-creating alarm.");
      // The createWorkLogAlarm function will read the new interval
      createWorkLogAlarm(1); // Re-create with 1-min delay to test
      sendResponse({ status: "settings acknowledged" });
      return true;

    // Case 5: Popup requests debug information
    case "getDebugInfo":
      chrome.storage.sync.get({ webAppUrl: "(Not Set)" }, (syncData) => {
        chrome.storage.local.get({ lastError: "No errors yet." }, (localData) => {
          sendResponse({
            webAppUrl: syncData.webAppUrl,
            lastError: localData.lastError
          });
        });
      });
      return true;

    // Case 6: Popup requests the domain of the active tab
    case "getActiveTabInfo":
      chrome.storage.sync.get({ isDomainLogEnabled: false }, (data) => {
        if (!data.isDomainLogEnabled) {
          sendResponse({ domain: "" });
          return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          let urlHostname = "";
          if (tabs.length > 0 && tabs[0].url) {
            try { urlHostname = new URL(tabs[0].url).hostname; } catch (e) {}
          }
          sendResponse({ domain: urlHostname });
        });
      });
      return true;

    // Case 7: Content script requests the MRU tags
    case "getMruTags":
      chrome.storage.local.get({ mruTags: [] }, (data) => {
        sendResponse(data.mruTags || []);
      });
      return true;

    // Case 8 & 9: Popup controls the timer badge
    case "startTimer":
      timerBadgeActive = true;
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
      sendResponse({ status: "timer_badge_on" });
      return true;

    case "stopTimer":
      timerBadgeActive = false;
      if (!alarmBadgeActive) {
        chrome.action.setBadgeText({ text: '' });
      }
      // NEW: Increment tasksCompleted
      chrome.storage.local.get({ tasksCompleted: 0 }, (data) => {
        chrome.storage.local.set({ tasksCompleted: data.tasksCompleted + 1 });
      });
      sendResponse({ status: "timer_badge_off" });
      return true;

    // Case 10: Options page requests a connection test
    case "testConnection":
      testWebAppConnection(request.url) // This function is now POST-based
        .then(response => sendResponse(response))
        .catch(error => sendResponse({ status: "error", message: error.message }));
      return true;

    // --- NEW: Case 11: Options page requests diagnostics ---
    case "runDiagnostics":
      runDiagnostics(request.url) // This function is now POST-based
        .then(response => sendResponse(response))
        .catch(error => sendResponse({ status: "error", message: error.message }));
      return true;

    // --- NEW: Dashboard weekly data request ---
    case "getWeeklyData":
      // --- Caching logic added ---
      chrome.storage.local.get({ weeklyCache: null, lastWeeklyFetch: 0 }, (cache) => {
        const now = Date.now();
        const TEN_MINUTES = 10 * 60 * 1000;

        // 1. Check if cache is recent
        if (cache.weeklyCache && (now - cache.lastWeeklyFetch < TEN_MINUTES)) {
          console.log("Returning cached weekly data.");
          sendResponse({ status: "success", data: cache.weeklyCache });
          return;
        }

        // 2. Fetch fresh data
        console.log("Fetching fresh weekly data from Google Sheet.");
        chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
          const WEB_APP_URL = data.webAppUrl;
          if (!WEB_APP_URL) {
            sendResponse({ status: "error", message: "Google Apps Script URL is not set." });
            return;
          }

          const url = new URL(WEB_APP_URL);
          url.searchParams.set("action", "getWeeklyData");

          fetch(url.toString())
            .then(response => response.json())
            .then(data => {
              if (data.status === "success") {
                // 3. Store in cache
                chrome.storage.local.set({
                  weeklyCache: data.data,
                  lastWeeklyFetch: Date.now()
                });
                sendResponse({ status: "success", data: data.data });
              } else {
                sendResponse({ status: "error", message: data.message });
              }
            })
            .catch(error => {
              sendResponse({ status: "error", message: error.message });
            });
        });
      });
      return true;
    
    // --- NEW: Dashboard today data request ---
    case "getTodayData":
      chrome.storage.local.get({ recentLogs: [] }, (data) => {
        // 'recentLogs' now contains the rich data needed for the timeline.
        // We send it in reverse order so the dashboard can display it chronologically.
        sendResponse({ status: "success", data: data.recentLogs.reverse() });
      });
      return true;
  }
});


// --- Google Sheet Communication ---

/**
 * @description (MODIFIED) Sends the log data to the Google Apps Script web app.
 * It now includes exponential backoff for rate limiting (429 errors).
 * @param {object} logData - The data to be logged.
 * @returns {Promise<object>} A promise that resolves with the *full* log data object.
 * @throws {Error} Throws an error if the fetch request fails after retries.
 */
async function logToGoogleSheet(logData) {
  // Get URL and Timezone from sync storage first
  const settings = await chrome.storage.sync.get({ webAppUrl: "", timeZone: "Europe/Vilnius" });
  
  const WEB_APP_URL = settings.webAppUrl;
  if (!WEB_APP_URL) {
    throw new Error("Google Apps Script URL is not set.");
  }

  // --- Logic to calculate time/gap ---
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateFormatted = now.toLocaleDateString('en-CA'); // 'yyyy-MM-dd' format

  let minsSinceLast = "N/A";
  const localData = await chrome.storage.local.get({ recentLogs: [] });
  const recentLogs = localData.recentLogs || [];

  if (recentLogs.length > 0) {
    const lastLog = recentLogs[0]; // recentLogs is newest-first
    if (lastLog.fullTimestamp && lastLog.date === dateFormatted) {
      const lastTimestamp = new Date(lastLog.fullTimestamp);
      const diffMs = now.getTime() - lastTimestamp.getTime();
      minsSinceLast = Math.round(diffMs / 60000);
    }
  }
  // --- End logic ---
  
  const payload = {
    log: logData.logText,
    tag: logData.tag,
    drifted: logData.drifted,
    reactive: logData.reactive,
    keywords: logData.keywords || "",
    domain: logData.domain || ""
  };
  
  // --- NEW: Exponential Backoff Retry Logic ---
  const MAX_RETRIES = 3;
  let delay = 2000; // Start with 2 seconds

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(WEB_APP_URL, {
        method: "POST",
        cache: "no-cache",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify(payload)
      });

      if (response.status === 429) { // Too Many Requests
        throw new Error("429"); // Trigger the retry logic
      }

      if (!response.ok) {
        throw new Error(`Network error: ${response.status} - ${response.statusText}`);
      }

      const json = await response.json();

      if (json.status !== "success") {
        throw new Error(`Google Script Error: ${json.message || 'Unknown error'}`);
      }

      // Success! Return the full object.
      return {
        ...logData,
        time: timeFormatted,
        date: dateFormatted,
        gap: minsSinceLast,
        fullTimestamp: now.toISOString()
      };

    } catch (error) {
      console.warn(`Fetch attempt ${i + 1} failed.`);
      let errorMessage = error.message;

      if (errorMessage.includes("429")) { // Handle rate limit
        if (i < MAX_RETRIES - 1) {
          console.warn(`Rate limit (429) hit. Retrying in ${delay}ms...`);
          await sleep(delay);
          delay *= 2; // Double the delay for next time
          continue; // Go to the next loop iteration
        } else {
          errorMessage = "Google Apps Script is rate limiting. Too many requests. Please wait a while before logging again.";
        }
      }
      
      if (error.message.includes("Failed to fetch")) {
          errorMessage = "Fetch failed. Check URL, network, or CORS. Did you re-deploy and update the URL?";
      } else if (error.message.includes("Unexpected token")) {
          errorMessage = "Google Script did not return valid JSON. Check your Apps Script code for errors.";
      }

      // If this is the last retry, throw the error
      if (i === MAX_RETRIES - 1) {
        throw new Error(errorMessage);
      }
    }
  }
  // This line should not be reachable, but as a fallback:
  throw new Error("Failed to log after multiple retries.");
}

/**
 * @description Updates and stores daily statistics in chrome.storage.local.
 * Now stores the full, rich log object.
 * @param {object} fullLogData - The rich log data object from logToGoogleSheet.
 */
function updateDailyStats(fullLogData) {
  chrome.storage.local.get({
    logsToday: 0,
    driftedLogs: 0,
    recentLogs: []
  }, (data) => {
    const newLogsToday = data.logsToday + 1;
    const newDriftedLogs = data.driftedLogs + (fullLogData.drifted ? 1 : 0);

    // Add the new *full log object* to the start of the recent logs list
    let recentLogs = [fullLogData, ...data.recentLogs];
    // Keep only the 50 most recent logs for the day (increased limit for timeline)
    recentLogs = recentLogs.slice(0, 50);

    chrome.storage.local.set({
      logsToday: newLogsToday,
      driftedLogs: newDriftedLogs,
      recentLogs: recentLogs
    });
  });
}

