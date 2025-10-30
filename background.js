// [SEC-01] IMPORTANT: The WEB_APP_URL is now stored in chrome.storage.sync

// --- [UX-12] Badge State ---
// We need to track two states that can affect the badge
let timerBadgeActive = false; // Is the manual timer running?
let alarmBadgeActive = false; // Is the alarm popup currently showing?

// --- Alarm Management ---

// Create the alarm when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("Work Log extension installed (v2.0). Creating 1-min alarm...");

  // --- Set all default settings on install ---
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
      isDomainLogEnabled: false
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
  
  // Set default badge color
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
  
  // [UX-12] Check if a timer was active before install/update
  checkTimerStateOnStartup();
  
  createWorkLogAlarm(1); // Start 1 minute after install

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
  checkTimerStateOnStartup(); // [UX-12]
  createWorkLogAlarm(1); // Start 1 minute after startup
});

// [UX-12] Helper to set badge on startup if timer is running
function checkTimerStateOnStartup() {
  chrome.storage.local.get({ activeTask: null }, (data) => {
    if (data.activeTask) {
      console.log("Active task found on startup. Setting badge.");
      timerBadgeActive = true;
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
    }
  });
}

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
      
      const firstDelay = initialDelayInMinutes !== null ? initialDelayInMinutes : logInterval;
      
      console.log(`Creating 'workLogAlarm'. First run in ${firstDelay} min(s), then every ${logInterval} min(s).`);
      
      chrome.alarms.create("workLogAlarm", {
        delayInMinutes: firstDelay,
        periodInMinutes: logInterval
      });
    });
  });
}

// Listen for all alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "workLogAlarm") {
    console.log("Work Log Alarm triggered.");
    checkDayAndTriggerPopup();
  }
  
  if (alarm.name === "snoozeAlarm") {
    console.log("Snooze Alarm triggered.");
    checkDayAndTriggerPopup();
    createWorkLogAlarm(); 
  }
});

// --- New: [UX-03] Listen for Context Menu ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "logWorkContextMenu") {
    console.log("Manual log popup triggered by context menu.");
    triggerPopupOnTab(tab, true); 
  }
});

// --- New: [UX-03] Listen for keyboard shortcut ---
chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger-log-popup") {
    console.log("Manual log popup triggered by keyboard shortcut.");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        triggerPopupOnTab(tabs[0], true);
      }
    });
  }
});

function checkDayAndTriggerPopup() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ...
  const currentHour = today.getHours(); // 0-23
  
  chrome.storage.sync.get({
    workingDays: ["1", "2", "3", "4", "5"],
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
  
  chrome.storage.sync.get({ 
    blockedDomains: "",
    isDomainLogEnabled: false
  }, (data) => {
    const domains = data.blockedDomains.split('\n').filter(Boolean);
    
    let urlHostname = "";
    try {
      urlHostname = new URL(tabUrl).hostname;
    } catch (e) {
      // Invalid URL
    }
    
    const isBlocked = domains.some(domain => urlHostname.includes(domain.trim()));

    if (isBlocked && !bypassDnd) {
      console.log(`Popup skipped: Active tab (${tabUrl}) is on a "Do Not Disturb" domain.`);
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
        
        chrome.tabs.sendMessage(tab.id, { 
          action: "showLogPopup",
          domain: domainToLog
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`Could not send message to tab ${tab.id}:`, chrome.runtime.lastError.message);
          } else {
            console.log("Popup message sent, response:", response);
          }
        });

        // Set the badge
        console.log("Setting badge text.");
        alarmBadgeActive = true;
        chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
        chrome.action.setBadgeText({ text: '!' });

      } catch (err) {
        console.error(`Failed to inject scripts into tab ${tab.id} (${tab.url}): ${err.message}. This might be a protected page.`);
      }
    })();
  });
}

// --- [UX-10] MRU Tag Management ---
/**
 * Updates the Most Recently Used (MRU) tags list in storage.
 * @param {string} tag - The tag that was just used.
 */
function updateMruTags(tag) {
  if (!tag) {
    return; // Don't store empty tags
  }
  chrome.storage.local.get({ mruTags: [] }, (data) => {
    let mruTags = data.mruTags || [];
    // Remove the tag if it already exists
    mruTags = mruTags.filter(t => t !== tag);
    // Add the new tag to the front
    mruTags.unshift(tag);
    // Keep only the top 3
    const newMruTags = mruTags.slice(0, 3);
    chrome.storage.local.set({ mruTags: newMruTags });
  });
}

// --- Data Handling & Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Case 1: User submitted a log
  if (request.action === "logWork") {
    console.log("Received log object:", request.data);
    
    chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
      const WEB_APP_URL = data.webAppUrl;

      if (!WEB_APP_URL) {
          const errorMsg = "Google Apps Script URL is not set. Please set it in the extension options.";
          console.error(errorMsg);
          chrome.storage.local.set({ lastError: errorMsg });
          sendResponse({ status: "error", message: errorMsg });
          return;
      }
        
      logToGoogleSheet(request.data, WEB_APP_URL)
        .then((jsonResponse) => {
          console.log("Log successfully sent:", jsonResponse);
          chrome.storage.local.set({ 
            lastLog: request.data.logText,
            lastTag: request.data.tag,
            lastError: "" 
          });
          
          updateMruTags(request.data.tag); // [UX-10]
          
          alarmBadgeActive = false;
          if (!timerBadgeActive) {
            chrome.action.setBadgeText({ text: '' });
          }
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
    
    // [UX-13] When snoozing, we also clear the alarm badge
    alarmBadgeActive = false;
    if (!timerBadgeActive) {
      chrome.action.setBadgeText({ text: '' });
    }
    
    chrome.alarms.clear("workLogAlarm", (wasCleared) => {
      if (minutes > 0) {
        console.log(`Snoozing log for ${minutes} minutes.`);
        chrome.alarms.create("snoozeAlarm", {
          delayInMinutes: minutes
        });
        sendResponse({ status: "snoozed" });
      } else {
        console.log("Skipping this log. Resetting main alarm cycle.");
        createWorkLogAlarm();
        sendResponse({ status: "skipped" });
      }
    });
    return true; // Indicates async response
  }

  // --- [UX-13] New Case: Log and Snooze ---
  if (request.action === "logAndSnooze") {
    const { data: logData, minutes } = request;
    console.log(`Received logAndSnooze for ${minutes} min:`, logData);
    
    chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
      const WEB_APP_URL = data.webAppUrl;

      if (!WEB_APP_URL) {
        const errorMsg = "Google Apps Script URL is not set.";
        sendResponse({ status: "error", message: errorMsg });
        return;
      }

      // 1. Log the work
      logToGoogleSheet(logData, WEB_APP_URL)
        .then((jsonResponse) => {
          // Log success, now do success logic
          console.log("Log (part 1) successful:", jsonResponse);
          chrome.storage.local.set({ 
            lastLog: logData.logText,
            lastTag: logData.tag,
            lastError: "" 
          });
          
          updateMruTags(logData.tag); // [UX-10]

          // 2. Snooze (part 2)
          alarmBadgeActive = false;
          if (!timerBadgeActive) {
            chrome.action.setBadgeText({ text: '' });
          }
          
          chrome.alarms.clear("workLogAlarm", (wasCleared) => {
            console.log(`Snoozing log for ${minutes} minutes.`);
            chrome.alarms.create("snoozeAlarm", {
              delayInMinutes: minutes
            });
            sendResponse({ status: "success_and_snoozed" });
          });
        })
        .catch((error) => {
          // Log (part 1) failed
          console.error("Error sending log (in logAndSnooze):", error.message);
          chrome.storage.local.set({ lastError: error.message });
          sendResponse({ status: "error", message: error.message });
        });
    });
    return true; // Indicates async response
  }
  
  // Case 3: User changed settings in the Options page
  if (request.action === "settingsUpdated") {
    console.log("Settings updated. Re-creating alarm (1-min delay).");
    createWorkLogAlarm(1);
    sendResponse({ status: "settings acknowledged" });
    return true;
  }

  // Case 4: The popup.html is asking for debug info
  if (request.action === "getDebugInfo") {
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

  // Case 5: The popup.js is asking for the active tab's domain
  if (request.action === "getActiveTabInfo") {
    chrome.storage.sync.get({ isDomainLogEnabled: false }, (data) => {
      if (!data.isDomainLogEnabled) {
        sendResponse({ domain: "" });
        return;
      }
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].url) {
          let urlHostname = "";
          try {
            urlHostname = new URL(tabs[0].url).hostname;
          } catch (e) {
            // Invalid URL
          }
          sendResponse({ domain: urlHostname });
        } else {
          sendResponse({ domain: "" }); // No active tab
        }
      });
    });
    return true; // Indicates async response
  }

  // --- [UX-10] New Case: Get MRU Tags ---
  if (request.action === "getMruTags") {
    chrome.storage.local.get({ mruTags: [] }, (data) => {
      sendResponse(data.mruTags || []);
    });
    return true; // Indicates async response
  }
  
  // --- [UX-12] New Cases: Timer Badge Control ---
  if (request.action === "startTimer") {
    timerBadgeActive = true;
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
    sendResponse({ status: "timer_badge_on" });
    return true;
  }
  
  if (request.action === "stopTimer") {
    timerBadgeActive = false;
    if (!alarmBadgeActive) { // Only clear badge if alarm isn't active
      chrome.action.setBadgeText({ text: '' });
    }
    sendResponse({ status: "timer_badge_off" });
    return true;
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
