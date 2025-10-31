/**
 * @file dashboard.js
 * @description This script manages the functionality of the dashboard page (dashboard.html).
 * It handles tab switching, fetching and displaying data for "Today's Stats" and "Weekly Review".
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Element Selections ---
    const tabs = document.querySelectorAll(".tab-link");
    const contents = document.querySelectorAll(".tab-content");

    // "Today's Stats" Elements
    const logsTodayEl = document.getElementById("logs-today");
    const tasksCompletedEl = document.getElementById("tasks-completed");
    const focusScoreEl = document.getElementById("focus-score");
    const recentActivityEl = document.getElementById("recent-activity");

    // "Weekly Review" Elements
    const refreshDataBtn = document.getElementById("refresh-data-btn");
    const weeklyStatusEl = document.getElementById("weekly-status");

    // Chart contexts
    const tagPieChartCtx = document.getElementById("tag-pie-chart").getContext("2d");
    const keywordBarChartCtx = document.getElementById("keyword-bar-chart").getContext("2d");
    const focusLineChartCtx = document.getElementById("focus-line-chart").getContext("2d");

    let tagPieChart, keywordBarChart, focusLineChart;

    // --- Event Listeners ---

    // Tab switching logic
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(item => item.classList.remove("active"));
            contents.forEach(item => item.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");
        });
    });

    // Refresh weekly data
    refreshDataBtn.addEventListener("click", () => {
        weeklyStatusEl.textContent = "Refreshing data from Google Sheet...";
        weeklyStatusEl.className = "status-message info";
        refreshDataBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "getWeeklyData" }, (response) => {
            if (chrome.runtime.lastError || response.status === "error") {
                weeklyStatusEl.textContent = `Error: ${response.message || "Could not fetch data."}`;
                weeklyStatusEl.className = "status-message error";
                refreshDataBtn.disabled = false;
                return;
            }

            weeklyStatusEl.textContent = "Data refreshed successfully!";
            weeklyStatusEl.className = "status-message success";
            setTimeout(() => weeklyStatusEl.textContent = "", 2000);
            refreshDataBtn.disabled = false;

            renderWeeklyCharts(response.data);
        });
    });


    // --- Data Loading and Rendering ---

    /**
     * @description Loads and displays the stats for the "Today's Stats" tab from local storage.
     */
    function loadTodayStats() {
        chrome.storage.local.get({
            logsToday: 0,
            tasksCompleted: 0,
            driftedLogs: 0,
            recentLogs: []
        }, (data) => {
            logsTodayEl.textContent = data.logsToday;
            tasksCompletedEl.textContent = data.tasksCompleted;

            const focusScore = data.logsToday > 0
                ? Math.round(((data.logsToday - data.driftedLogs) / data.logsToday) * 100)
                : 100;
            focusScoreEl.textContent = `${focusScore}%`;

            recentActivityEl.innerHTML = "";
            if (data.recentLogs.length > 0) {
                data.recentLogs.slice(0, 5).forEach(log => {
                    const li = document.createElement("li");
                    li.textContent = log;
                    recentActivityEl.appendChild(li);
                });
            } else {
                recentActivityEl.innerHTML = "<li>No activity yet today.</li>";
            }
        });
    }

    /**
     * @description Renders the charts for the "Weekly Review" tab using Chart.js.
     * @param {object} data - The data fetched from the Google Sheet.
     */
    function renderWeeklyCharts(data) {
        if (!data) return;

        // Destroy existing charts to prevent duplicates
        if (tagPieChart) tagPieChart.destroy();
        if (keywordBarChart) keywordBarChart.destroy();
        if (focusLineChart) focusLineChart.destroy();

        // Tag Pie Chart
        tagPieChart = new Chart(tagPieChartCtx, {
            type: 'pie',
            data: {
                labels: data.tagData.labels,
                datasets: [{
                    data: data.tagData.values,
                    backgroundColor: ['#52A2A0', '#EEBD69', '#315558', '#E5E7EB', '#F59E0B'],
                }]
            }
        });

        // Keyword Bar Chart
        keywordBarChart = new Chart(keywordBarChartCtx, {
            type: 'bar',
            data: {
                labels: data.keywordData.labels,
                datasets: [{
                    label: 'Frequency',
                    data: data.keywordData.values,
                    backgroundColor: '#52A2A0',
                }]
            },
            options: {
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Focus Over Time Line Chart
        focusLineChart = new Chart(focusLineChartCtx, {
            type: 'line',
            data: {
                labels: data.focusData.labels,
                datasets: [{
                    label: 'Focus Score (%)',
                    data: data.focusData.values,
                    borderColor: '#EEBD69',
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }


    // --- Initial Load ---
    loadTodayStats();
});
