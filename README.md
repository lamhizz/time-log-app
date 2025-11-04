WurkWurk - Work Log Timer Chrome Extension

WurkWurk is a Chrome extension designed to help you maintain a consistent and detailed log of your work activities. At a customizable interval, it presents a simple popup, prompting you to jot down what you're working on. These logs are sent directly to a private Google Sheet, creating a valuable dataset for personal productivity analysis, timesheet completion, or project tracking.

How it Works

The extension operates as a service worker (background.js) that runs in the background, managing a timer. When the timer fires, it injects a content script (content.js) into your active tab, which then displays the logging popup. User input is securely sent to a Google Apps Script, which acts as a bridge to your Google Sheet. All configuration is handled through a dedicated options page.

Features

1.  **Automated Logging Prompts:** A popup appears at a configurable interval (e.g., every 15 minutes) to remind you to log your work.
2.  **Direct to Google Sheets:** Your logs are sent instantly and securely to a Google Sheet you own.
3.  **Task Timer:** A built-in timer in the popup allows you to track the duration of a specific task. When you stop the timer, the task name and duration are pre-filled into the log input.
4.  **Customizable Tags:** Define a list of common tags (e.g., "Meeting," "Focus Time," "Email") for quick categorization of your logs. The three most recently used tags are always just a click away.
5.  **"Do Not Disturb" Mode:** Specify domains (e.g., youtube.com, meet.google.com) where you don't want the logging popup to appear.
6.  **Configurable Work Hours:** Set your working days and hours to ensure the extension only prompts you when you're actually working.
7.  **Manual Logging:** Manually trigger the popup at any time using a keyboard shortcut (Ctrl+Shift+L by default) or the right-click context menu.
8.  **Quick Actions:** Buttons for common tasks like "Log 'Doing Same'" or "Log a 'Break'" streamline the logging process.
9.  **Snooze & Skip:** Easily postpone or skip a log prompt if you're in the middle of something important.
10.  **Built-in Dashboard:** Analyze your "Today's Stats" in real-time or review your weekly patterns in the "Weekly Review" tab.

Setup Instructions

For the extension to work, you must connect it to a Google Sheet via a Google Apps Script.

**For the most detailed, up-to-date instructions, please open the extension's "Options" page and click on the "Setup Guide" tab.**

A brief overview of the steps:

1.  **Create Your Google Sheet:**
2.  Go to sheets.google.com and create a new blank spreadsheet.
3.  Name it something memorable, like "My WurkWurk Logs."
4.  In the first row, create the following **ten (10)** headers exactly as written:

<table><tbody><tr><td data-row="1">A</td><td data-row="1">B</td><td data-row="1">C</td><td data-row="1">D</td><td data-row="1">E</td><td data-row="1">F</td><td data-row="1">G</td><td data-row="1">H</td><td data-row="1">I</td><td data-row="1">J</td></tr><tr><td data-row="2">Date</td><td data-row="2">Time</td><td data-row="2">Log Entry</td><td data-row="2">Tag</td><td data-row="2">Drifted</td><td data-row="2">Mins Since Last</td><td data-row="2">FullTimestamp</td><td data-row="2">Domain</td><td data-row="2">Reactive</td><td data-row="2">Keywords</td></tr></tbody></table>

1.  **Create the Google Apps Script:**
2.  In your Google Sheet, click `Extensions` > `Apps Script`.
3.  Delete any placeholder code in the `Code.gs` file.
4.  Open the extension **Options** page, go to the **Setup Guide**, and click the `See App Script code` button.
5.  Copy the entire script and paste it into the Apps Script editor.
6.  **Important:** Find the line `const TIME_ZONE = "...";` and change the time zone to your own.
7.  Save the script.
8.  **Deploy the Script as a Web App:**
9.  Click the blue `Deploy` button and select `New deployment`.
10.  For "Select type," choose `Web app`.
11.  Configure the deployment:
12.  **Execute as:** `Me`
13.  **Who has access:** `Anyone` (This is secure; only someone with the secret URL can send data).
14.  Click `Deploy`. You will need to authorize the script's permissions.
15.  After deployment, **copy the Web app URL**.
16.  **Configure the Extension:**
17.  Go to the extension's **Options** page.
18.  On the **General Settings** tab, paste the **Web app URL** you copied into the "Google Apps Script URL" field.
19.  Click the **"Test Connection"** button. All 4 diagnostic steps should pass.
20.  Customize other settings as needed and click **"Save All Settings"**.

Configuration Options

All settings are managed through the extension's **Options** page.

1.  **Google Apps Script URL:** The URL for your deployed web app. (Required)
2.  **Log Interval:** The time in minutes between logging prompts.
3.  **Log Tags:** A list of tags to be available in the dropdown, with each tag on a new line.
4.  **Working Week:** Checkboxes to select the days you want the logging prompts to be active.
5.  **Working Hours:** The start and end time for logging prompts.
6.  **"Do Not Disturb" Domains:** A list of domains where the popup should not automatically appear.
7.  **Notification Sound:** Choose a sound to play when the popup appears.
8.  **Log Active Domain:** If checked, the domain of the active tab will be included in the log data.
9.  **Debug Mode:** If checked, a "Show Debug" link will appear in the popup, providing troubleshooting information.

#