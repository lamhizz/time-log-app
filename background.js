// [SEC-01] IMPORTANT: The WEB_APP_URL is now stored in chrome.storage.sync

// --- [UX-12] Badge State ---
let timerBadgeActive = false;
let alarmBadgeActive = false;

// --- Alarm Management ---

chrome.runtime.onInstalled.addListener(() => {
  console.log("Work Log extension installed (v2.2). Creating 1-min alarm...");

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
      isDomainLogEnabled: false,
      notificationSound: "ClickUp.wav"
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
  
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
  
  checkTimerStateOnStartup();
  createWorkLogAlarm(1); 

  chrome.contextMenus.create({
    id: "logWorkContextMenu",
    title: "Log Work",
    contexts: ["page"]
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Browser starting up. Creating 1-min alarm...");
  checkTimerStateOnStartup();
  createWorkLogAlarm(1);
});

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

function createWorkLogAlarm(initialDelayInMinutes = null) {
  chrome.alarms.clearAll((wasCleared) => {
    if (wasCleared) console.log("Cleared all previous alarms.");
    
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "logWorkContextMenu") {
    console.log("Manual log popup triggered by context menu.");
    triggerPopupOnTab(tab, true); 
  }
});

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
  const dayOfWeek = today.getDay();
  const currentHour = today.getHours();
  
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

async function triggerPopupOnTab(tab, bypassDnd = false) {
  if (!tab || !tab.id || !tab.url) {
    console.warn("Invalid tab object.", tab);
    return;
  }
  
  const tabId = tab.id;
  const tabUrl = tab.url;
  
  chrome.storage.sync.get({ 
    blockedDomains: "",
    isDomainLogEnabled: false,
    notificationSound: "ClickUp.wav"
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
          domain: domainToLog,
          sound: data.notificationSound
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`Could not send message to tab ${tab.id}:`, chrome.runtime.lastError.message);
          } else {
            console.log("Popup message sent, response:", response);
          }
        });

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

function updateMruTags(tag) {
  if (!tag) {
    return;
  }
  chrome.storage.local.get({ mruTags: [] }, (data) => {
    let mruTags = data.mruTags || [];
    mruTags = mruTags.filter(t => t !== tag);
    mruTags.unshift(tag);
    const newMruTags = mruTags.slice(0, 3);
    chrome.storage.local.set({ mruTags: newMruTags });
  });
}

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

// --- Data Handling & Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Case 1: User submitted a log
  if (request.action === "logWork") {
    // [NEW] request.data = { logText, tag, drifted, reactive, domain }
    console.log("Received log object:", request.data);
    
    chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
      const WEB_APP_URL = data.webAppUrl;
      if (!WEB_APP_URL) {
          const errorMsg = "Google Apps Script URL is not set.";
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
          updateMruTags(request.data.tag);
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
  
  // Case 2: User hit "Snooze" or "Skip"
  if (request.action === "snoozeLog") {
    const minutes = request.minutes;
    alarmBadgeActive = false;
    if (!timerBadgeActive) {
      chrome.action.setBadgeText({ text: '' });
    }
    chrome.alarms.clear("workLogAlarm", (wasCleared) => {
      if (minutes > 0) {
        console.log(`Snoozing log for ${minutes} minutes.`);
        chrome.alarms.create("snoozeAlarm", { delayInMinutes: minutes });
        sendResponse({ status: "snoozed" });
      } else {
        console.log("Skipping this log. Resetting main alarm cycle.");
        createWorkLogAlarm();
        sendResponse({ status: "skipped" });
      }
    });
    return true; // Indicates async response
  }

  // Case 3: Log and Snooze
  if (request.action === "logAndSnooze") {
    const { data: logData, minutes } = request; // [NEW] logData includes .reactive
    console.log(`Received logAndSnooze for ${minutes} min:`, logData);
    
    chrome.storage.sync.get({ webAppUrl: "" }, (data) => {
      const WEB_APP_URL = data.webAppUrl;
      if (!WEB_APP_URL) {
        const errorMsg = "Google Apps Script URL is not set.";
        sendResponse({ status: "error", message: errorMsg });
        return;
      }

      logToGoogleSheet(logData, WEB_APP_URL)
        .then((jsonResponse) => {
          console.log("Log (part 1) successful:", jsonResponse);
          chrome.storage.local.set({ 
            lastLog: logData.logText,
            lastTag: logData.tag,
            lastError: "" 
          });
          updateMruTags(logData.tag);

          alarmBadgeActive = false;
          if (!timerBadgeActive) {
            chrome.action.setBadgeText({ text: '' });
          }
          
          chrome.alarms.clear("workLogAlarm", (wasCleared) => {
            console.log(`Snoozing log for ${minutes} minutes.`);
            chrome.alarms.create("snoozeAlarm", { delayInMinutes: minutes });
            sendResponse({ status: "success_and_snoozed" });
          });
        })
        .catch((error) => {
          console.error("Error sending log (in logAndSnooze):", error.message);
          chrome.storage.local.set({ lastError: error.message });
          sendResponse({ status: "error", message: error.message });
        });
    });
    return true; // Indicates async response
  }
  
  // Case 4: Settings updated
  if (request.action === "settingsUpdated") {
    console.log("Settings updated. Re-creating alarm (1-min delay).");
    createWorkLogAlarm(1);
    sendResponse({ status: "settings acknowledged" });
    return true;
  }

  // Case 5: Get Debug Info
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

  // Case 6: Get Active Tab Info
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
          } catch (e) { /* Invalid URL */ }
          sendResponse({ domain: urlHostname });
        } else {
          sendResponse({ domain: "" }); // No active tab
        }
      });
    });
    return true; // Indicates async response
  }

  // Case 7: Get MRU Tags
  if (request.action === "getMruTags") {
    chrome.storage.local.get({ mruTags: [] }, (data) => {
      sendResponse(data.mruTags || []);
    });
    return true; // Indicates async response
  }
  
  // Case 8 & 9: Timer Badge Control
  if (request.action === "startTimer") {
    timerBadgeActive = true;
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
    sendResponse({ status: "timer_badge_on" });
    return true;
  }
  
  if (request.action === "stopTimer") {
    timerBadgeActive = false;
    if (!alarmBadgeActive) {
      chrome.action.setBadgeText({ text: '' });
    }
    sendResponse({ status: "timer_badge_off" });
    return true;
  }
  
  // Case 10: Test Connection
  if (request.action === "testConnection") {
    testWebAppConnection(request.url)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        sendResponse({ status: "error", message: error.message });
      });
    return true; // Indicates async response
  }
  
});

// --- Google Sheet Fetch Logic ---

async function logToGoogleSheet(logData, webAppUrl) {
  // [NEW] logData = { logText, tag, drifted, reactive, domain }
  const payload = {
    log: logData.logText,
    tag: logData.tag,
    drifted: logData.drifted,
    reactive: logData.reactive // [NEW]
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

