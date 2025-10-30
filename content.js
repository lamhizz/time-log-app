// Listen for the message from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showLogPopup") {
    if (!document.getElementById("work-log-popup-overlay")) {
      createPopup(request.domain, request.sound); 
    }
    sendResponse({ status: "popup shown" });
  }
  return true;
});

function createPopup(domainToLog, soundToPlay) {
  
  // --- [QOL-51] Play sound at reduced volume ---
  if (soundToPlay && soundToPlay !== "none") {
    try {
      const soundUrl = chrome.runtime.getURL(`sounds/${soundToPlay}`);
      const audio = new Audio(soundUrl);
      audio.volume = 0.5; // [NEW] Set volume to 50%
      audio.play().catch(e => {
        console.warn(`Work Log: Could not play notification sound (${soundToPlay}): ${e.message}`);
      });
    } catch (e) {
      console.error("Work Log: Error trying to play sound.", e);
    }
  }
  
  // --- [NEW] Inject Google Icons (for Break button) ---
  if (!document.getElementById("work-log-google-symbols")) {
    const fontLink = document.createElement("link");
    fontLink.id = "work-log-google-symbols";
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,0..200";
    document.head.appendChild(fontLink);
  }

  const overlay = document.createElement("div");
  overlay.id = "work-log-popup-overlay";
  
  const modal = document.createElement("div");
  modal.id = "work-log-popup-modal";
  
  const title = document.createElement("h2");
  title.id = "work-log-popup-title";
  title.textContent = "What are you working on?";
  
  // --- Tag Dropdown ---
  const tagGroup = document.createElement("div");
  tagGroup.className = "work-log-form-group";
  
  const tagLabel = document.createElement("label");
  tagLabel.htmlFor = "work-log-tag-select";
  tagLabel.textContent = "Select a Tag (Optional):";
  
  const tagSelect = document.createElement("select");
  tagSelect.id = "work-log-tag-select";
  tagSelect.className = "work-log-popup-select";
  
  chrome.storage.sync.get({ logTags: "Meeting\nFocus Time\nSlack" }, (data) => {
    const tags = data.logTags.split('\n').filter(Boolean);
    
    const promptOption = document.createElement("option");
    promptOption.value = "";
    promptOption.textContent = "-- No Tag --";
    promptOption.selected = true;
    tagSelect.appendChild(promptOption);
    
    // [NEW] Add "Break" as a default tag if it's not in the list
    if (!tags.includes("Break")) {
      tags.push("Break");
    }
    if (tags.length === 0) tags.push("Default");

    tags.forEach(tag => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      tagSelect.appendChild(option);
    });
  });
  
  tagGroup.appendChild(tagLabel);
  tagGroup.appendChild(tagSelect);
  
  // --- [UX-10] MRU Tags Container ---
  const mruTagsContainer = document.createElement("div");
  mruTagsContainer.className = "work-log-mru-tags-container";
  
  chrome.runtime.sendMessage({ action: "getMruTags" }, (mruTags) => {
    if (mruTags && mruTags.length > 0) {
      mruTags.forEach(tag => {
        const button = document.createElement("button");
        button.className = "work-log-popup-button work-log-mru-tag-btn";
        button.textContent = tag;
        button.title = `Select tag: ${tag}`;
        button.addEventListener("click", (e) => {
          e.preventDefault();
          tagSelect.value = tag;
        });
        mruTagsContainer.appendChild(button);
      });
    }
  });

  // --- Log Text Area ---
  const textGroup = document.createElement("div");
  textGroup.className = "work-log-form-group";
  
  const textarea = document.createElement("textarea");
  textarea.id = "work-log-popup-input";
  textarea.placeholder = "Enter a brief log...";
  textGroup.appendChild(textarea);
  
  // --- Checkboxes ---
  const checkboxContainer = document.createElement("div");
  checkboxContainer.className = "work-log-checkbox-container";
  
  // --- Drifted Checkbox ---
  const driftedGroup = document.createElement("div");
  driftedGroup.className = "work-log-form-group work-log-checkbox-group";
  
  const driftedCheck = document.createElement("input");
  driftedCheck.type = "checkbox";
  driftedCheck.id = "work-log-drifted-check";
  
  const driftedLabel = document.createElement("label");
  driftedLabel.htmlFor = "work-log-drifted-check";
  driftedLabel.textContent = "I drifted (off-task)";
  
  driftedGroup.appendChild(driftedCheck);
  driftedGroup.appendChild(driftedLabel);
  
  // --- [NEW] Reactive Checkbox ---
  const reactiveGroup = document.createElement("div");
  reactiveGroup.className = "work-log-form-group work-log-checkbox-group";
  
  const reactiveCheck = document.createElement("input");
  reactiveCheck.type = "checkbox";
  reactiveCheck.id = "work-log-reactive-check";
  
  const reactiveLabel = document.createElement("label");
  reactiveLabel.htmlFor = "work-log-reactive-check";
  reactiveLabel.textContent = "I reacted (ad-hoc)";
  
  reactiveGroup.appendChild(reactiveCheck);
  reactiveGroup.appendChild(reactiveLabel);
  
  checkboxContainer.appendChild(driftedGroup);
  checkboxContainer.appendChild(reactiveGroup);
  // --- End Checkboxes ---

  // --- Actions Wrapper ---
  const actionsWrapper = document.createElement("div");
  actionsWrapper.className = "work-log-actions-wrapper";

  const snoozeGroup = document.createElement("div");
  snoozeGroup.className = "work-log-snooze-group";

  const snoozeSelect = document.createElement("select");
  snoozeSelect.id = "work-log-snooze-select";
  snoozeSelect.className = "work-log-popup-select work-log-snooze-select";
  
  const snoozeOptions = [
    { text: "Snooze 10 min", value: 10 },
    { text: "Snooze 30 min", value: 30 },
    { text: "Snooze 1 hour", value: 60 },
    { text: "Skip this log", value: -1 }
  ];
  
  const defaultSnooze = document.createElement("option");
  defaultSnooze.value = "5";
  defaultSnooze.textContent = "Postpone 5 min";
  defaultSnooze.selected = true;
  snoozeSelect.appendChild(defaultSnooze);

  snoozeOptions.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.text;
    snoozeSelect.appendChild(option);
  });
  snoozeGroup.appendChild(snoozeSelect);

  const snoozeButton = document.createElement("button");
  snoozeButton.id = "work-log-snooze-button";
  snoozeButton.className = "work-log-popup-button work-log-button-secondary";
  snoozeButton.textContent = "Snooze";
  snoozeGroup.appendChild(snoozeButton);
  
  // --- Buttons ---
  const submitButton = document.createElement("button");
  submitButton.id = "work-log-popup-submit";
  submitButton.textContent = "Log It (Ctrl+Enter)";
  
  const logAndSnoozeButton = document.createElement("button");
  logAndSnoozeButton.id = "work-log-log-and-snooze-btn";
  logAndSnoozeButton.className = "work-log-popup-button work-log-button-secondary";
  logAndSnoozeButton.textContent = "Log & Snooze 30 min";
  
  const statusMessage = document.createElement("p");
  statusMessage.id = "work-log-popup-status";
  
  const sameAsLastButton = document.createElement("button");
  sameAsLastButton.className = "work-log-popup-button work-log-button-secondary";
  sameAsLastButton.textContent = "Log 'Doing Same'";
  
  // --- [NEW] Break Button ---
  const breakButton = document.createElement("button");
  breakButton.id = "work-log-break-btn";
  breakButton.className = "work-log-popup-button work-log-button-secondary";
  breakButton.title = "Log a 'Break'";
  breakButton.innerHTML = `<span class="material-symbols-outlined">local_cafe</span>`;
  
  // --- Logic ---

  function submitLog(isLogAndSnooze = false) {
    const logText = textarea.value.trim();
    const tag = tagSelect.value || "";
    const drifted = driftedCheck.checked;
    const reactive = reactiveCheck.checked; // [NEW]

    if (!logText) {
      showStatus("Please enter a log entry.", "error");
      return;
    }
    
    const logData = { logText, tag, drifted, reactive, domain: domainToLog || "" }; // [NEW] reactive
    
    if (isLogAndSnooze) {
      setLoading(true, "Logging & Snoozing...");
      chrome.runtime.sendMessage(
        { action: "logAndSnooze", data: logData, minutes: 30 }, 
        handleResponse
      );
    } else {
      setLoading(true, "Logging...");
      chrome.runtime.sendMessage(
        { action: "logWork", data: logData }, 
        handleResponse
      );
    }
  }
  
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitLog(false);
    }
  });
  
  submitButton.addEventListener("click", () => submitLog(false));
  
  logAndSnoozeButton.addEventListener("click", () => submitLog(true));
  
  snoozeButton.addEventListener("click", () => {
    const minutes = parseInt(snoozeSelect.value, 10);
    const actionText = minutes > 0 ? "Snoozing..." : "Skipping...";
    
    setLoading(true, actionText);
    chrome.runtime.sendMessage({ action: "snoozeLog", minutes: minutes }, (response) => {
      if (response && (response.status === "snoozed" || response.status === "skipped")) {
        closePopup();
      } else {
        showStatus("Could not snooze.", "error");
        setLoading(false);
      }
    });
  });
  
  sameAsLastButton.addEventListener("click", () => {
    setLoading(true, "Logging last task...");
    chrome.storage.local.get({ lastLog: null, lastTag: null }, (data) => {
      if (data.lastLog && data.lastTag !== null) {
        const logData = { 
          logText: "↑ " + data.lastLog, 
          tag: data.lastTag, 
          drifted: false,
          reactive: false, // [NEW]
          domain: domainToLog || ""
        };
        chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
      } else {
        showStatus("No previous log found.", "error");
        setLoading(false);
      }
    });
  });
  
  // --- [NEW] Break Button Logic ---
  breakButton.addEventListener("click", () => {
    setLoading(true, "Logging break...");
    const logData = {
      logText: "Break",
      tag: "Break",
      drifted: false,
      reactive: false,
      domain: domainToLog || ""
    };
    chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
  });

  function handleResponse(response) {
    if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`, "error");
        setLoading(false);
        return;
    }
    if (response && (response.status === "success" || response.status === "success_and_snoozed")) {
      closePopup();
    } else {
      showStatus(response.message || "An unknown error occurred.", "error");
      setLoading(false);
    }
  }

  function setLoading(isLoading, message = "Log It (Ctrl+Enter)") {
    submitButton.disabled = isLoading;
    logAndSnoozeButton.disabled = isLoading;
    snoozeButton.disabled = isLoading;
    snoozeSelect.disabled = isLoading;
    sameAsLastButton.disabled = isLoading;
    breakButton.disabled = isLoading; // [NEW]
    tagSelect.disabled = isLoading;
    textarea.disabled = isLoading;
    driftedCheck.disabled = isLoading;
    reactiveCheck.disabled = isLoading; // [NEW]
    
    if (isLoading) {
      submitButton.textContent = message;
      statusMessage.style.display = "none";
    } else {
      submitButton.textContent = "Log It (Ctrl+Enter)";
    }
  }
  
  const closeButton = document.createElement("button");
  closeButton.id = "work-log-popup-close";
  closeButton.textContent = "×";
  closeButton.title = "Snooze 5 minutes"; // [NEW] Title changed
  
  // --- [NEW] Close button = 5 min snooze ---
  closeButton.addEventListener("click", () => {
    const minutes = 5;
    setLoading(true, "Snoozing...");
    chrome.runtime.sendMessage({ action: "snoozeLog", minutes: minutes }, (response) => {
      if (response && response.status === "snoozed") {
        closePopup();
      } else {
        showStatus("Could not snooze.", "error");
        setLoading(false);
      }
    });
  });
  
  // Assemble the popup
  modal.appendChild(closeButton);
  modal.appendChild(title);
  modal.appendChild(tagGroup);
  modal.appendChild(mruTagsContainer);
  modal.appendChild(textGroup);
  modal.appendChild(checkboxContainer); // [NEW] Use container
  modal.appendChild(submitButton);
  modal.appendChild(logAndSnoozeButton);
  actionsWrapper.appendChild(snoozeGroup);
  actionsWrapper.appendChild(sameAsLastButton);
  actionsWrapper.appendChild(breakButton); // [NEW]
  modal.appendChild(actionsWrapper);
  modal.appendChild(statusMessage);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  textarea.focus();
}

function closePopup() {
  const overlay = document.getElementById("work-log-popup-overlay");
  if (overlay) {
    overlay.remove();
  }
}

function showStatus(message, type) {
  const statusMessage = document.getElementById("work-log-popup-status");
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.className = `work-log-status-${type}`;
    statusMessage.style.display = "block";
  }
}

