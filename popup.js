/* 
    Functions
*/

/**
 * Displays the websites and the time spent on each one of them in the popup as well as the total time
 */
async function displayInfo() {
    const websiteListDiv = document.getElementById('websiteList');

    const localData = await chrome.storage.local.get(['totalDayTime', 'totalWeekTime', 'websiteTime', 'lastTab']);
    let webSiteTime = localData.websiteTime || {};
    printWebsiteList();

    // Modifying the total time
    document.getElementById('totalTime').textContent = convertTimeToFormat(localData.totalDayTime);
    document.getElementById('totalWeekTime').textContent = convertTimeToFormat(localData.totalWeekTime);

    // Last Tab
    if (localData.lastTab !== null) {
        document.getElementById('lastTab').textContent = localData.lastTab;
    }

    // Modifying the websites time lists
    websiteListDiv.replaceChildren();
    webSiteTime = await Object.entries(webSiteTime).sort((a, b) => b[1] - a[1]);

    if (webSiteTime.length == 0) {
        websiteListDiv.innerHTML = '<h3 class="centeredTitle">No websites visited this week.</h3>';
    } else {
        for (const [domain, time] of webSiteTime) {
            const websiteItem = document.createElement('p');
            websiteItem.className = 'indivWebsite';

            // URL
            const domainElement = document.createElement("span");
            domainElement.textContent = domain;

            // Time
            const timeElement = document.createElement("span");
            timeElement.style.float = "right";
            timeElement.textContent = convertTimeToFormat(time);

            websiteItem.append(domainElement, timeElement);

            websiteListDiv.appendChild(websiteItem);
        }
    }
}

/**
 * For debugging purposes
 */
async function printWebsiteList() {
    let websites = (await chrome.storage.local.get('websiteTime')).websiteTime || {};
    console.log("-----------Website List-----------");
    for (const [website, time] of Object.entries(websites)) {
        console.log(`${website}: ${convertTimeToFormat(time) }`);
    }
    console.log(`Last Tab: ${(await chrome.storage.local.get(lastTab)).lastTab }`)
    console.log("----------------------------------");
}

/**
 * Resets all the data stored in local and session storage
 */
async function fullReset() {
    await chrome.runtime.sendMessage({ type: 'RESETDATA' });
}

/**
 * Format time to hrs, mins, and seconds
 */
function convertTimeToFormat(time) {
    let webTime = time || 0;
    const hr = Math.floor(Math.round(webTime) / 3600);
    const min = Math.floor((Math.round(webTime) % 3600) / 60);
    const sec = Math.round(webTime) % 60;
    let timeString = '';

    if (hr !== 0) {
        timeString = `${hr}hr ${min}m`
    } else if (min !== 0) {
        timeString = `${min}m`
    } else {
        timeString = `${sec}s`;
    }

    return timeString;
}
/* 
    Events
*/

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes) {
        displayInfo();
    }
})

document.getElementById("fullReset").addEventListener("click", function () { fullReset(); });
/* 
    Actually running the codes omg
*/
displayInfo();