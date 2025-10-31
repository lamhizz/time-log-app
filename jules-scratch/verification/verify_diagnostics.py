
import re
import time
from playwright.sync_api import sync_playwright

def run(playwright):
    # The extension source is the current directory
    extension_path = "."

    # Launch a persistent context with the extension loaded
    context = playwright.chromium.launch_persistent_context(
        "",
        headless=True,
        args=[
            f"--disable-extensions-except={extension_path}",
            f"--load-extension={extension_path}",
        ],
    )

    # Give the extension a moment to load
    time.sleep(1)

    # The background script is specified in manifest.json
    background_page = None
    for page in context.service_workers:
        if "background.js" in page.url:
            background_page = page
            break

    if not background_page:
        raise Exception("Could not find the extension's background service worker.")

    # Extract the extension ID from the service worker's URL
    extension_id_match = re.search(r'chrome-extension://([a-z]+)/', background_page.url)
    if not extension_id_match:
        raise Exception("Could not extract extension ID from the service worker URL.")
    extension_id = extension_id_match.group(1)

    # Now we can navigate to the options page
    page = context.new_page()
    options_url = f"chrome-extension://{extension_id}/options.html"
    page.goto(options_url)

    # Give the page a moment to load and render
    page.wait_for_load_state("domcontentloaded")

    # Click the test connection button
    page.click("#test-connection")

    # Wait for the diagnostic results to be visible
    page.wait_for_selector("#diagnostic-results", state="visible")

    # Take a screenshot of the diagnostic results area
    page.locator("#diagnostic-results").screenshot(path="jules-scratch/verification/diagnostics.png")

    context.close()

with sync_playwright() as playwright:
    run(playwright)
