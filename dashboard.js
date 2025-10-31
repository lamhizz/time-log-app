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

    // --- NEW: "Weekly Review" Elements ---
    const dateRangeSelect = document.getElementById("date-range-select");
    const customDateInputs = document.getElementById("custom-date-inputs");
    const startDateInput = document.getElementById("start-date");
    const endDateInput = document.getElementById("end-date");
    // Section 1
    const kpiGridEl = document.getElementById("kpi-grid");
    const timeByTagChartEl = document.getElementById("time-by-tag-chart");
    const timeByDomainChartEl = document.getElementById("time-by-domain-chart");
    // Section 2
    const heatmapTagFilterEl = document.getElementById("heatmap-tag-filter");
    const workHoursHeatmapEl = document.getElementById("work-hours-heatmap");
    const tagDeepDiveTableEl = document.getElementById("tag-deep-dive-table");
    // Section 3
    const reactiveReportEl = document.getElementById("reactive-report");
    const driftedReportEl = document.getElementById("drifted-report");


    // --- Global State ---
    let fullWeeklyData = []; // To store the complete dataset from the API

    // --- Event Listeners ---

    // Date range selector logic
    dateRangeSelect.addEventListener("change", () => {
        if (dateRangeSelect.value === "custom") {
            customDateInputs.style.display = "block";
        } else {
            customDateInputs.style.display = "none";
        }
        // When the date range changes, re-render the dashboard with the existing data
        if (fullWeeklyData.length > 0) {
            renderWeeklyDashboard(fullWeeklyData);
        }
    });

    // Custom date input changes should also trigger a re-render
    startDateInput.addEventListener("change", () => { if (fullWeeklyData.length > 0) renderWeeklyDashboard(fullWeeklyData) });
    endDateInput.addEventListener("change", () => { if (fullWeeklyData.length > 0) renderWeeklyDashboard(fullWeeklyData) });

    // Refresh weekly data button
    refreshDataBtn.addEventListener("click", () => {
        weeklyStatusEl.textContent = "Refreshing data from Google Sheet...";
        weeklyStatusEl.className = "status-message info";
        refreshDataBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "getWeeklyData" }, (response) => {
            if (chrome.runtime.lastError || response.status === "error") {
                weeklyStatusEl.textContent = `Error: ${response.message || "Could not fetch data."}`;
                weeklyStatusEl.className = "status-message error";
                refreshDataBtn.disabled = false;
                kpiGridEl.innerHTML = "<p>Could not load data.</p>"; // Clear old data
                return;
            }

            weeklyStatusEl.textContent = "Data refreshed successfully!";
            weeklyStatusEl.className = "status-message success";
            setTimeout(() => { weeklyStatusEl.textContent = ""; weeklyStatusEl.className="status-message"; }, 3000);
            refreshDataBtn.disabled = false;

            // Store the full dataset and render the dashboard
            fullWeeklyData = response.data;
            renderWeeklyDashboard(fullWeeklyData);
        });
    });

    // --- Data Processing and Rendering ---

    /**
     * @description Main function to orchestrate the rendering of the entire weekly dashboard.
     * @param {Array<Object>} data - The raw log data from the Google Sheet.
     */
    function renderWeeklyDashboard(data) {
        if (!data || data.length === 0) {
            kpiGridEl.innerHTML = "<p>No data available for the selected period.</p>";
            timeByTagChartEl.innerHTML = "";
            timeByDomainChartEl.innerHTML = "";
            return;
        }

        const filteredData = filterDataByDateRange(data);

        // --- Section 1: At a Glance ---
        renderAtAGlance(filteredData);

        // --- Section 2: Pattern & Rhythm Analysis ---
        renderPatternAnalysis(filteredData);

        // --- Section 3: Blindsides & Time Leaks ---
        renderBlindsides(filteredData);
    }

    /**
     * @description Renders all components for the "Blindsides & Time Leaks" section.
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderBlindsides(data) {
        // 1. "Reactive" Report
        const reactiveData = data.filter(item => item.reactive);
        const totalReactiveMinutes = reactiveData.reduce((sum, item) => sum + (parseInt(item.minutesSinceLast, 10) || 0), 0);

        reactiveReportEl.innerHTML = `<div class="kpi-standalone">You lost <strong>${Math.floor(totalReactiveMinutes / 60)}h ${totalReactiveMinutes % 60}m</strong> to 'Reactive' work this period.</div>`;

        const reactiveTagData = aggregateData(reactiveData, 'tag', 'minutesSinceLast');
        const reactiveCanvas = document.createElement('canvas');
        reactiveReportEl.appendChild(reactiveCanvas);
        renderChart(reactiveCanvas, 'bar', reactiveTagData, "Minutes", 5);


        // 2. "Drifted" Report
        const driftedData = data.filter(item => item.drifted);

        driftedReportEl.innerHTML = `<div class="kpi-standalone">You drifted off-task <strong>${driftedData.length}</strong> times.</div>`;

        const driftedDomainData = aggregateData(driftedData, 'domain', 'minutesSinceLast');
        const driftedCanvas = document.createElement('canvas');
        driftedReportEl.appendChild(driftedCanvas);
        renderChart(driftedCanvas, 'bar', driftedDomainData, "Minutes", 5);
    }

    /**
     * @description Renders all components for the "Pattern & Rhythm Analysis" section.
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderPatternAnalysis(data) {
        // 1. Populate Heatmap Filter
        const uniqueTags = [...new Set(data.map(item => item.tag).filter(Boolean))];
        populateHeatmapFilter(uniqueTags);

        // 2. Render Heatmap
        renderHeatmap(data);

        // 3. Render Tag Deep-Dive Table
        renderTagDeepDiveTable(data);
    }

    /**
     * @description Populates the tag filter dropdown for the heatmap.
     * @param {Array<string>} tags - A unique list of tags.
     */
    function populateHeatmapFilter(tags) {
        // Preserve the "All Tags" option
        heatmapTagFilterEl.innerHTML = '<option value="all">All Tags</option>';
        tags.sort().forEach(tag => {
            const option = document.createElement("option");
            option.value = tag;
            option.textContent = tag;
            heatmapTagFilterEl.appendChild(option);
        });
        // Add a listener that re-renders the heatmap when the filter changes
        heatmapTagFilterEl.onchange = () => renderHeatmap(filterDataByDateRange(fullWeeklyData));
    }

    /**
     * @description Renders the work-hours heatmap as a styled table.
     * @param {Array<Object>} data - The filtered data for the selected period.
     */
    function renderHeatmap(data) {
        workHoursHeatmapEl.innerHTML = "";
        const selectedTag = heatmapTagFilterEl.value;

        // Filter data by the selected tag if it's not "all"
        const heatmapData = selectedTag === 'all'
            ? data
            : data.filter(item => item.tag === selectedTag);

        // Create a data structure to hold minutes per hour per day
        const heatmapGrid = Array.from({ length: 24 }, () => Array(7).fill(0));
        let maxMinutes = 0;

        heatmapData.forEach(item => {
            const date = new Date(item.timestamp);
            const day = date.getDay(); // Sunday = 0, Saturday = 6
            const hour = date.getHours();
            const minutes = parseInt(item.minutesSinceLast, 10) || 0;
            heatmapGrid[hour][day] += minutes;
            if (heatmapGrid[hour][day] > maxMinutes) {
                maxMinutes = heatmapGrid[hour][day];
            }
        });

        // Create the table
        const table = document.createElement("table");
        table.className = "heatmap-table";

        // Header (Days of the week)
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.insertCell(); // Empty corner
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        days.forEach(day => {
            const th = document.createElement("th");
            th.textContent = day;
            headerRow.appendChild(th);
        });

        // Body (Hours and cells)
        const tbody = table.createTBody();
        for (let hour = 8; hour < 19; hour++) { // Displaying typical work hours 8 AM - 6 PM
            const row = tbody.insertRow();
            const timeCell = row.insertCell();
            timeCell.textContent = `${hour}:00`;
            timeCell.className = 'heatmap-time-label';

            for (let day = 0; day < 7; day++) {
                const cell = row.insertCell();
                const minutes = heatmapGrid[hour][day];
                if (minutes > 0) {
                    const intensity = Math.min(minutes / (maxMinutes * 0.75), 1); // Normalize intensity
                    cell.style.backgroundColor = `rgba(82, 162, 160, ${intensity})`; // #52A2A0 with opacity
                    cell.title = `${minutes} minutes logged`;
                }
            }
        }
        workHoursHeatmapEl.appendChild(table);
    }

    /**
     * @description Renders the "Tag Deep-Dive" sortable table.
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderTagDeepDiveTable(data) {
        tagDeepDiveTableEl.innerHTML = "";
        const tagStats = {};
        const totalMinutes = data.reduce((sum, item) => sum + (parseInt(item.minutesSinceLast, 10) || 0), 0);
        const daysInRange = (getDateRange().end - getDateRange().start) / (1000 * 60 * 60 * 24);

        data.forEach(item => {
            const tag = item.tag || 'Uncategorized';
            if (!tagStats[tag]) {
                tagStats[tag] = { totalTime: 0, count: 0 };
            }
            tagStats[tag].totalTime += parseInt(item.minutesSinceLast, 10) || 0;
            tagStats[tag].count++;
        });

        const tableData = Object.entries(tagStats).map(([name, stats]) => ({
            name,
            totalTime: stats.totalTime,
            percentage: totalMinutes > 0 ? Math.round((stats.totalTime / totalMinutes) * 100) : 0,
            avgPerDay: daysInRange > 0 ? Math.round(stats.totalTime / daysInRange) : 0,
            entries: stats.count
        })).sort((a, b) => b.totalTime - a.totalTime);

        // Create and render table
        const table = document.createElement("table");
        table.className = "dashboard-table sortable";
        const headers = [
            { key: 'name', text: 'Tag Name' },
            { key: 'totalTime', text: 'Total Time' },
            { key: 'percentage', text: '% of Total' },
            { key: 'avgPerDay', text: 'Avg. Time / Day' },
            { key: 'entries', text: '# of Entries' }
        ];

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headers.forEach(header => {
            const th = document.createElement("th");
            th.textContent = header.text;
            th.dataset.sortKey = header.key;
            headerRow.appendChild(th);
        });

        const tbody = table.createTBody();
        tableData.forEach(item => {
            const row = tbody.insertRow();
            row.insertCell().textContent = item.name;
            row.insertCell().textContent = `${Math.floor(item.totalTime / 60)}h ${item.totalTime % 60}m`;
            row.insertCell().textContent = `${item.percentage}%`;
            row.insertCell().textContent = `${item.avgPerDay} min`;
            row.insertCell().textContent = item.entries;
        });

        tagDeepDiveTableEl.appendChild(table);
    }

    /**
     * @description Renders all components for the "At a Glance" section.
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderAtAGlance(data) {
        // 1. KPIs
        const totalMinutes = data.reduce((sum, row) => sum + (parseInt(row.minutesSinceLast, 10) || 0), 0);
        const reactiveMinutes = data.filter(row => row.reactive).reduce((sum, row) => sum + (parseInt(row.minutesSinceLast, 10) || 0), 0);
        const driftedCount = data.filter(row => row.drifted).length;

        const kpis = {
            "Total Time Logged": `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
            "'Reactive' Time": totalMinutes > 0 ? `${Math.round((reactiveMinutes / totalMinutes) * 100)}%` : "0%",
            "'Drifted' Count": driftedCount,
            "Avg. Log Frequency": data.length > 0 ? `${Math.round(totalMinutes / data.length)} min` : "N/A"
        };
        renderKpis(kpis);

        // 2. Time by Tag
        const tagData = aggregateData(data, 'tag', 'minutesSinceLast');
        renderChart(timeByTagChartEl, 'pie', tagData, "Time by Tag", 5);

        // 3. Time by Domain
        const domainData = aggregateData(data, 'domain', 'minutesSinceLast');
        renderChart(timeByDomainChartEl, 'bar', domainData, "Time by Domain", 10);
    }

     /**
     * @description Renders the KPI cards.
     * @param {Object} kpiData - An object with KPI titles as keys and values as values.
     */
    function renderKpis(kpiData) {
        kpiGridEl.innerHTML = "";
        for (const key in kpiData) {
            const card = document.createElement("div");
            card.className = "stat-card";
            card.innerHTML = `<h2>${key}</h2><p>${kpiData[key]}</p>`;
            kpiGridEl.appendChild(card);
        }
    }

    /**
     * @description Aggregates time-based data by a specific key (e.g., 'tag' or 'domain').
     * @param {Array<Object>} data - The filtered data array.
     * @param {string} key - The property to group by (e.g., 'tag').
     * @param {string} valueKey - The property to sum up (e.g., 'minutesSinceLast').
     * @returns {Array<Object>} A sorted array of aggregated data.
     */
    function aggregateData(data, key, valueKey) {
        const aggregation = {};
        let totalValue = 0;

        data.forEach(item => {
            const itemKey = item[key] || 'Uncategorized';
            const itemValue = parseInt(item[valueKey], 10) || 0;
            if (itemValue > 0) {
                if (!aggregation[itemKey]) {
                    aggregation[itemKey] = 0;
                }
                aggregation[itemKey] += itemValue;
                totalValue += itemValue;
            }
        });

        return Object.entries(aggregation)
            .map(([name, value]) => ({
                name,
                value,
                percentage: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0
            }))
            .sort((a, b) => b.value - a.value);
    }

    /**
     * @description Creates and renders a chart using Chart.js.
     * @param {HTMLElement} canvasEl - The canvas element to render the chart into.
     * @param {string} chartType - The type of chart (e.g., 'pie', 'bar').
     * @param {Array<Object>} data - The aggregated data array.
     * @param {string} label - The label for the dataset.
     * @param {number} topN - The number of top items to show.
     */
    function renderChart(canvasEl, chartType, data, label, topN) {
        if (canvasEl.chart) {
            canvasEl.chart.destroy(); // Destroy existing chart instance if it exists
        }

        if (data.length === 0) {
            const ctx = canvasEl.getContext('2d');
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            canvasEl.style.display = 'none'; // Hide canvas
            // Optionally show a message
            const messageEl = document.createElement('p');
            messageEl.textContent = "No data to display.";
            canvasEl.parentNode.appendChild(messageEl);
            return;
        } else {
             canvasEl.style.display = 'block';
             const existingMsg = canvasEl.parentNode.querySelector('p');
             if (existingMsg) existingMsg.remove();
        }


        const topData = data.slice(0, topN);
        const labels = topData.map(d => d.name);
        const values = topData.map(d => d.value);

        const chartConfig = {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: values,
                    backgroundColor: [
                        '#52A2A0', // Bigger accents
                        '#EEBD69', // Small accents
                        '#315558', // Text
                        '#7FB0AF',
                        '#F2C98A',
                        '#5A7E80',
                    ],
                    borderColor: '#ffffff',
                    borderWidth: chartType === 'pie' ? 2 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: chartType === 'pie' ? 'top' : 'none',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                const value = context.raw;
                                label += `${Math.floor(value / 60)}h ${value % 60}m`;
                                return label;
                            }
                        }
                    }
                },
                scales: chartType === 'bar' ? {
                    y: {
                        beginAtZero: true
                    }
                } : {}
            }
        };

        canvasEl.chart = new Chart(canvasEl, chartConfig);
    }

    // --- Date Filtering Logic ---

    /**
     * @description Filters the raw data based on the selected date range.
     * @param {Array<Object>} data - The full, unfiltered dataset.
     * @returns {Array<Object>} The data filtered to the selected date range.
     */
    function filterDataByDateRange(data) {
        const { start, end } = getDateRange();
        if (!start || !end) return data; // Return all if no valid range

        return data.filter(item => {
            const itemDate = new Date(item.timestamp);
            return itemDate >= start && itemDate <= end;
        });
    }

    /**
     * @description Gets the start and end dates based on the selector's value.
     * @returns {{start: Date, end: Date}}
     */
    function getDateRange() {
        const selected = dateRangeSelect.value;
        const now = new Date();
        let start = new Date();
        let end = new Date(now); // Clone current date

        switch (selected) {
            case 'this-week':
                const firstDayOfWeek = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1); // Monday as first day
                start = new Date(now.setDate(firstDayOfWeek));
                break;
            case 'last-week':
                const firstDayOfLastWeek = now.getDate() - now.getDay() - 6;
                start = new Date(now.setDate(firstDayOfLastWeek));
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            case 'this-month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'custom':
                start = new Date(startDateInput.value);
                end = new Date(endDateInput.value);
                break;
        }

        // Set time to the beginning of the start day and end of the end day
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

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

    // --- Initial Load ---
    loadTodayStats();
    // Set default dates for custom filter
    endDateInput.valueAsDate = new Date();
    startDateInput.valueAsDate = new Date(new Date().setDate(new Date().getDate() - 7));

    // Automatically refresh weekly data on first load
    refreshDataBtn.click();
});
