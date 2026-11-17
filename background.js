const INIT_VARIABLES = {
    totalDayTime : 0,
    totalWeekTime: 0,
    webSiteTime: {},
    lastTab: null
}

chrome.runtime.onInstalled.addListener(async () => {
    const allVar = await chrome.storage.local.get(
        Object.keys(INIT_VARIABLES)
    );

    const missingVar = {};

    for (const [key, value] of Object.entries(INIT_VARIABLES)) {
        if (allVar[key] === undefined) {
            missingVar[key] = value;
        }
    }

    await chrome.storage.local.set(missingVar);

    console.log("Initialized variables:", missingVar);
});

// Runs everytime the browser starts up
chrome.runtime.onStartup.addListener(async () => {
    await chrome.storage.session.set({ sessionTime: 0, tabTime: 0, currentTab: null, sessionStartTime: Date.now(), tabStartTime: Date.now() });
})

async function startTracking(tabId) {
    await chrome.storage.session.set({ currentTab: tabId , tabStartTime: Date.now() });
}