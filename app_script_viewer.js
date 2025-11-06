/**
 * @file app_script_viewer.js
 * @description Handles the "Copy to Clipboard" functionality for app_script_viewer.html
 * This code is moved from an inline script to a separate file to comply with
 * Chrome Extension Content Security Policy (CSP).
 */

document.addEventListener('DOMContentLoaded', () => {
    const copyButton = document.getElementById('copy-script-btn');
    
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const codeEl = document.getElementById('apps-script-code');
            // Use .innerText to get the content of the <pre> tag as it is displayed
            const code = codeEl.innerText; 

            const textArea = document.createElement("textarea");
            textArea.value = code;
            textArea.style.position = "fixed";
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            
            textArea.focus();
            textArea.select();

            try {
                // Use the deprecated execCommand as it's simple and reliable for this context
                const successful = document.execCommand('copy');
                if (successful) {
                copyButton.innerHTML = `<span class="material-symbols-outlined">check</span> Copied!`;
                setTimeout(() => {
                    copyButton.innerHTML = `<span class="material-symbols-outlined">content_copy</span> Copy to Clipboard`;
                }, 2000);
                } else {
                copyButton.textContent = "Failed to copy";
                }
            } catch (err) {
                console.error('Failed to copy script: ', err);
                copyButton.textContent = "Failed to copy";
            }

            document.body.removeChild(textArea);
        });
    }
});