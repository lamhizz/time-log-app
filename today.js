/**
 * @file today.js
 * @description This script manages the functionality of the "Today's Stats" page (dashboard.html).
 * It fetches real-time daily data from local storage and renders the timeline.
 *
 * @version 2.3 (At-a-Glance KPIs)
 * - Implements the "At-a-Glance Story" layout for the top KPI cards.
 * - Calculates "Top Reactive Tag" and provides context for all KPIs.
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Element Selections ---

    // --- (NEW) KPI Card Elements ---
    const focusScoreMetricEl = document.getElementById("focus-score-metric");
    const focusScoreContextEl = document.getElementById("focus-score-context");

    const reactiveMetricEl = document.getElementById("reactive-metric");
    const reactiveContextEl = document.getElementById("reactive-context");

    const activityMetricEl = document.getElementById("activity-metric");
    const activityContextEl = document.getElementById("activity-context");

    // Timeline Element
    const timelineContainerEl = document.getElementById("daily-timeline-container");

    // --- Data Loading and Rendering ---

    /**
     * @description (OVERHAULED for "At-a-Glance Story")
     * Loads and displays the stats for the "Today's Stats" tab.
     * It now calculates and displays the new contextual KPIs.
     */
    function loadTodayStats() {
        // We ask for 'recentLogs' from local storage, which is updated by background.js
        chrome.storage.local.get({
            tasksCompleted: 0,
            recentLogs: [] // This now contains rich log objects
        }, (data) => {

            const logs = data.recentLogs || [];
            const logsToday = logs.length;
            const tasksCompleted = data.tasksCompleted;

            // --- 1. Focus Score Card ---
            const driftedLogs = logs.filter(log => log.drifted);
            const driftedCount = driftedLogs.length;
            const focusScore = logsToday > 0
                ? Math.round(((logsToday - driftedCount) / logsToday) * 100)
                : 100;

            focusScoreMetricEl.textContent = `${focusScore}%`;
            if (driftedCount === 0) {
                focusScoreContextEl.textContent = "No drifted logs yet.";
            } else {
                focusScoreContextEl.textContent = `You've drifted ${driftedCount} time${driftedCount > 1 ? 's' : ''} today.`;
            }

            // --- 2. Interruptions Card ---
            const reactiveLogs = logs.filter(log => log.reactive);
            const reactiveCount = reactiveLogs.length;

            reactiveMetricEl.textContent = reactiveCount;

            if (reactiveCount === 0) {
                reactiveContextEl.textContent = "No reactive logs yet.";
            } else {
                // Find the top reactive tag
                const tagCounts = reactiveLogs.reduce((acc, log) => {
                    const tag = log.tag || "Untagged";
                    acc[tag] = (acc[tag] || 0) + 1;
                    return acc;
                }, {});

                const topCulprit = Object.entries(tagCounts).sort(([, a], [, b]) => b - a)[0];
                reactiveContextEl.textContent = `Top culprit: '${topCulprit[0]}' (${topCulprit[1]} logs)`;
            }

            // --- 3. Activity Summary Card ---
            activityMetricEl.textContent = logsToday;
            activityContextEl.textContent = `Tasks Completed: ${tasksCompleted}`;

            // --- 4. Render the timeline ---
            renderDailyTimeline(logs);
        });
    }

    /**
     * @description Renders the hourly block timeline.
     * @param {Array<object>} logs - The array of rich log objects from local storage.
     */
    function renderDailyTimeline(logs) {
        if (!timelineContainerEl) return;

        if (logs.length === 0) {
            timelineContainerEl.innerHTML = "<p>No activity yet today.</p>";
            return;
        }

        // Logs are stored newest-first, so we reverse them for chronological order.
        let chronologicalLogs = logs.slice().reverse();

        // [NEW] Merge "Doing Same" entries (starting with "↑ ")
        const mergedLogs = [];
        chronologicalLogs.forEach((log) => {
            if (mergedLogs.length > 0 && (log.logText.startsWith("↑ ") || log.logText === "Doing Same")) {
                // It's a "Doing Same" entry. Merge with the previous one.
                const prevLog = mergedLogs[mergedLogs.length - 1];

                // Add duration (gap) to the previous log
                // The 'gap' of the current log represents the duration of the previous task *before* this one started?
                // No, 'gap' in this app seems to be "minutes since last log".
                // So if Log A is at 9:00, and Log B (Doing Same) is at 9:15 with gap 15,
                // it means Log A continued for 15 mins.
                // We want to visually extend Log A.

                // We can append the time range or just update the "gap" displayed on the merged entry?
                // Let's sum up the gaps.
                const currentGap = log.gap !== "N/A" ? parseInt(log.gap, 10) : 0;
                const prevGap = prevLog.gap !== "N/A" ? parseInt(prevLog.gap, 10) : 0;
                prevLog.gap = prevGap + currentGap;

                // Update the "end time" or similar if we were tracking it.
                // For now, just accumulating the gap (duration) is enough to show it "lasted longer".
                // We might want to append a note?
                // prevLog.logText += ` (+ ${currentGap}m)`; 

            } else {
                mergedLogs.push({ ...log }); // Push a copy
            }
        });

        chronologicalLogs = mergedLogs;

        timelineContainerEl.innerHTML = ""; // Clear loader

        // [NEW] Determine start hour
        let startHour = 8; // Default
        if (chronologicalLogs.length > 0) {
            const firstLogTime = chronologicalLogs[0].time;
            if (firstLogTime) {
                startHour = parseInt(firstLogTime.split(':')[0], 10);
            }
        }

        let currentHour = startHour - 1; // Initialize to force first header

        // [NEW] Helper to parse time string "HH:MM" to minutes from midnight
        const timeToMins = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        chronologicalLogs.forEach((log, index) => {
            // 1. Get hour from log time (e.g., "09:05" -> 9)
            const logHour = log.time ? parseInt(log.time.split(':')[0], 10) : -1;

            // [MOVED] Check for Gap from previous log BEFORE rendering headers
            if (index > 0) {
                const prevLog = chronologicalLogs[index - 1];
                // Gap logic: If gap > 60 mins, show tile.
                // Note: 'gap' property in log is "duration since previous log".
                const gapMins = log.gap !== "N/A" ? parseInt(log.gap, 10) : 0;

                if (gapMins > 60) {
                    const gapEl = document.createElement("div");
                    gapEl.className = "timeline-entry timeline-entry-gap";
                    gapEl.textContent = `⚠️ Blind Spot? (${gapMins} min gap)`;

                    // [NEW] Set height proportional to gap (1px per minute)
                    gapEl.style.minHeight = `${gapMins}px`;
                    gapEl.style.display = "flex";
                    gapEl.style.alignItems = "center";
                    gapEl.style.justifyContent = "center";

                    timelineContainerEl.appendChild(gapEl);

                    // [NEW] Suppress hour headers covered by this gap
                    // By advancing currentHour to logHour, we skip the loop that generates intermediate headers.
                    currentHour = logHour;
                }
            }

            // 2. Check if we need to render an "Hour Header"
            if (logHour !== -1 && logHour > currentHour) {
                // Also add headers for any empty hours in between
                for (let hour = currentHour + 1; hour <= logHour; hour++) {
                    currentHour = hour;
                    const hourEl = document.createElement("div");
                    hourEl.className = "timeline-hour-header";
                    // Format hour (e.g., 9 -> "9:00 AM", 14 -> "2:00 PM")
                    const ampm = currentHour < 12 ? 'AM' : 'PM';
                    const displayHour = currentHour % 12 === 0 ? 12 : currentHour % 12;
                    hourEl.textContent = `--- ${displayHour}:00 ${ampm} ---`;
                    timelineContainerEl.appendChild(hourEl);
                }
            }

            // 3. Create the timeline entry (two-column layout)
            const entryEl = document.createElement("div");
            entryEl.className = "timeline-entry";

            // --- Add special classes based on log content ---
            if (log.tag && log.tag.toLowerCase() === 'break') {
                entryEl.classList.add("timeline-entry-break");
            }
            if (log.drifted) {
                entryEl.classList.add("timeline-entry-drifted");
            }

            // Generate a consistent color from the tag string
            const tagColor = stringToHslColor(log.tag || "default");
            // Apply color to border
            entryEl.style.borderColor = tagColor.bg;
            entryEl.style.borderLeftColor = tagColor.fg; // Strong left border

            // Badges for special logs
            let badgesHTML = "";
            if (log.drifted) {
                badgesHTML += `<span class="timeline-badge timeline-badge-drifted">Drifted</span>`;
            }
            if (log.reactive) {
                badgesHTML += `<span class="timeline-badge timeline-badge-reactive">Reactive</span>`;
            }

            // Gap text (e.g., "+15m" or "---")
            const gapMinutes = log.gap !== "N/A" ? parseInt(log.gap, 10) : 0;
            const gapText = (gapMinutes > 0) ? `+${log.gap}m` : "---";
            // NEW: Add a warning class if the gap is large
            const gapClass = (gapMinutes > 45) ? "timeline-gap-warning" : "timeline-gap";


            // --- Build the entry's HTML ---
            entryEl.innerHTML = `
                <div class="timeline-meta">
                    <span class="timeline-time">${log.time || "00:00"}</span>
                    <span class="${gapClass}">${gapText}</span>
                </div>
                <div class="timeline-content">
                    <p class="timeline-text">${escapeHTML(log.logText)}</p>
                    ${log.tag ? `<span class="timeline-tag" style="background-color: ${tagColor.bg}; color: ${tagColor.fg};">${escapeHTML(log.tag)}</span>` : ''}
                    ${badgesHTML ? `<div class="timeline-badges">${badgesHTML}</div>` : ''}
                </div>
            `;

            timelineContainerEl.appendChild(entryEl);
        });
    }

    /**
     * @description Simple helper to prevent XSS from log text.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>"']/g, function (match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    /**
     * @description Generates a consistent, accessible HSL color pair from any string.
     * @param {string} str - The input string (e.g., a tag name).
     * @returns {{bg: string, fg: string}} A background (light) and foreground (dark) color.
     */
    function stringToHslColor(str) {
        if (!str) str = "default";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return {
            bg: `hsl(${h}, 80%, 90%)`, // Light background
            fg: `hsl(${h}, 60%, 30%)`  // Dark foreground
        };
    }

    // --- Initial Load ---
    loadTodayStats(); // This will now render the new KPIs and timeline
});