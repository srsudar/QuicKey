define([
	"cp",
	"background/storage"
], function(
	cp,
	createStorage
) {
	const StorageVersion = 3;


	return createStorage(StorageVersion,
		function() {
				// we only want to get the tabs in the current window because
				// only the currently active tab is "recent" as far as we know
			return cp.tabs.query({ active: true, currentWindow: true, windowType: "normal" })
				.then(function(tabs) {
					var data = {
							tabIDs: [],
							tabsByID: {},
							previousTabIndex: -1,
							switchFromShortcut: false,
							lastShortcutTabID: null,
							lastShortcutTime: 0,
							lastStartupTime: 0,
							lastUpdateTime: 0
						},
						tab = tabs && tabs[0];

					if (tab) {
							// store now as the last visit of the current tab so
							// that if the user switches to a different tab, this
							// one will be shown as a recent one in the menu.
							// ideally, this would be added via recentTabs.add(),
							// but that module also depends on this one, so there
							// would be a circular reference. 
						tab.lastVisit = Date.now();
						data.tabIDs.push(tab.id);
						data.tabsByID[tab.id] = tab;
					}

					return data;
				});
		}
	);
});
