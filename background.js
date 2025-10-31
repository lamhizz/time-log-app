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
  
  // Don't show on other extension pages
  if (tab.url.startsWith("chrome-extension://")) {
    console.log("Popup skipped: Cannot inject into other extension pages.");
    return;
  }

  chrome.storage.sync.get({ 
    blockedDomains: "",
    isDomainLogEnabled: false,
    notificationSound: "ClickUp.wav"
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
        
        // Send a message to the content script to show the popup
        chrome.tabs.sendMessage(tab.id, { 
          action: "showLogPopup",
          domain: domainToLog,
          sound: data.notificationSound
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
  
  let testUrl;
  try {
    testUrl = new URL(url);
    testUrl.searchParams.set("action", "test");
  } catch (e) {
    return { status: "error", message: "Invalid URL format." };
  }

  try {
    const response = await fetch(testUrl.toString(), {
      method: "GET",
      cache: "no-cache",
      redirect: "follow"
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
      chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
        const WEB_APP_URL = data.webAppUrl;
        if (!WEB_APP_URL) {
            const errorMsg = "Google Apps Script URL is not set.";
            chrome.storage.local.set({ lastError: errorMsg });
            sendResponse({ status: "error", message: errorMsg });
            return;
        }
        
        logToGoogleSheet(request.data, WEB_APP_URL)
          .then((jsonResponse) => {
            chrome.storage.local.set({
              lastLog: request.data.logText,
              lastTag: request.data.tag,
              lastError: ""
            });
            updateMruTags(request.data.tag);
            updateDailyStats(request.data); // New function call
            // Clear the alarm badge, but leave the timer badge if it's active
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
      });
      return true;

    // Case 2: User snoozes or skips a log
    case "snoozeLog":
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
      console.log(`Received logAndSnooze for ${request.minutes} min:`, request.data);
      chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
        const WEB_APP_URL = data.webAppUrl;
        if (!WEB_APP_URL) {
          sendResponse({ status: "error", message: "Google Apps Script URL is not set." });
          return;
        }

        logToGoogleSheet(request.data, WEB_APP_URL)
          .then(() => {
            chrome.storage.local.set({
              lastLog: request.data.logText,
              lastTag: request.data.tag,
              lastError: ""
            });
            updateMruTags(request.data.tag);
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
      testWebAppConnection(request.url)
        .then(response => sendResponse(response))
        .catch(error => sendResponse({ status: "error", message: error.message }));
      return true;

    // --- NEW: Dashboard weekly data request ---
    case "getWeeklyData":
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
              sendResponse({ status: "success", data: data.data });
            } else {
              sendResponse({ status: "error", message: data.message });
            }
          })
          .catch(error => {
            sendResponse({ status: "error", message: error.message });
          });
      });
      return true;
  }
});


// --- Google Sheet Communication ---

/**
 * @description Sends the log data to the Google Apps Script web app.
 * @param {object} logData - The data to be logged.
 * @param {string} logData.logText - The main log entry text.
 * @param {string} logData.tag - The selected tag.
 * @param {boolean} logData.drifted - Whether the user was off-task.
 * @param {boolean} logData.reactive - Whether the work was ad-hoc.
 * @param {string} [logData.domain] - The domain of the active tab, if enabled.
 * @param {string} webAppUrl - The URL of the Google Apps Script.
 * @returns {Promise<object>} A promise that resolves with the JSON response from the script.
 * @throws {Error} Throws an error if the fetch request fails or the script returns an error.
 */
async function logToGoogleSheet(logData, webAppUrl) {
  const payload = {
    log: logData.logText,
    tag: logData.tag,
    drifted: logData.drifted,
    reactive: logData.reactive,
    keywords: logData.keywords || ""
  };
  
  if (logData.domain !== undefined) {
    payload.domain = logData.domain;
  }
  
  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      cache: "no-cache",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
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

/**
 * @description Updates and stores daily statistics in chrome.storage.local.
 * @param {object} logData - The log data object from the log submission.
 */
function updateDailyStats(logData) {
  chrome.storage.local.get({
    logsToday: 0,
    driftedLogs: 0,
    recentLogs: []
  }, (data) => {
    const newLogsToday = data.logsToday + 1;
    const newDriftedLogs = data.driftedLogs + (logData.drifted ? 1 : 0);

    // Add the new log to the start of the recent logs list
    let recentLogs = [logData.logText, ...data.recentLogs];
    // Keep only the 5 most recent logs
    recentLogs = recentLogs.slice(0, 5);

    chrome.storage.local.set({
      logsToday: newLogsToday,
      driftedLogs: newDriftedLogs,
      recentLogs: recentLogs
    });
  });
}
