import { initLocal, initSession, enqueue } from './background.js';
/* 
    Functions
*/

/**
 * Displays the websites and the time spent on each one of them in the popup
 */
async function displayWebsiteTimes() {
    const websiteListDiv = document.getElementById('websiteList');

    let websites = await chrome.storage.local.get('webSiteTime');
    const webSiteTime = websites.webSiteTime || {};
    console.log("webSiteTime:", webSiteTime);

    websiteListDiv.replaceChildren();
    websites = Object.entries(webSiteTime).sort((a, b) => b[1] - a[1]);

    if (websites.length == 0) {
        websiteListDiv.innerHTML = '<h3 class="centeredTitle">No websites visited this week.</h3>';
    } else {
        for (const [domain, time] of websites) {
            const websiteItem = document.createElement('p');
            websiteItem.className = 'indivWebsite';

            // URL
            const domainElement = document.createElement("span");
            domainElement.textContent = domain;

            // Time
            const timeElement = document.createElement("span");
            timeElement.style.float = "right";

            const hr = Math.floor(time / 3600);
            const min = Math.floor((time % 3600) / 60);
            const sec = time % 60;
            if (hr !== 0) {
                timeElement.textContent = `${hr}hr ${min}m`
            } else if (min !== 0) {
                timeElement.textContent = `${min}m`
            } else {
                timeElement.textContent = `${sec}s`;
            }

            websiteItem.append(domainElement, timeElement);

            websiteListDiv.appendChild(websiteItem);
        }
    }
}

/**
 * Resets all the data stored in local and session storage
 */
function fullReset() {
    enqueue(initLocal);
    enqueue(initSession);
}

/* 
    Events
*/

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.webSiteTime) {
        displayWebsiteTimes();
    }
})

/* 
    Actually running the codes omg
*/
displayWebsiteTimes();