
var SiteWatcher = (function() {
/*
    BaseController.prototype.init = function(appBridge) {  };
    BaseController.prototype.enable = function() {  }; // private use in setOptions
    BaseController.prototype.disable = function() {  }; // private use in setOptions
    BaseController.prototype.setOptions = function() { };
*/

    var watcher = {

        urlPrefix: 'productivity/',

        goodTimeMultiplier: 0.25,
        badTimeMultiplier: 0.5,

        isSwapped: false,

        lastSendTime: new Date().getTime(),
        sendInterval: 3000,
        sendIntervalID: 0,

        score: 0,
        timestamp: new Date().getTime(),

        appBridge: undefined,

        activator: undefined,
        activators: undefined,

        productivityState: 0,
        isVerbose: true,

        init: function(appBridge) {

            this.appBridge = appBridge;
            this.activators = Activators;

            this.appBridge.addListener('watcher.forceChange', this.spreadData);
            this.appBridge.addListener('watcher.triggerIconChange', this.triggerBrowserActionIconChange);

            for (var name in this.activators)
                this.activators[name].init(this.appBridge);

            this.activator = this.activators.alwaysoff;
        },

        isEnabled: function() {
            return this.appBridge.hasListener('app.newUrl', this.checkNewUrl);
        },

        enable:function() {

            this.score = 0;
            this.appBridge.addListener('app.newUrl', this.checkNewUrl);
            this.appBridge.addListener('watcher.swapHosts', this.swapHosts);
            this.appBridge.addListener('watcher.activator.changed', this.controllSendingState);
            this.appBridge.removeListener('watcher.activator.changed', this.handleActivatorStateChangeWhileDisabled);

            this.lastSendTime = new Date().getTime();

            this.turnOnTheSender();

            this.appBridge.trigger('app.getCurrentUrl', this.checkNewUrl);
        },

        disable: function() {

            this.appBridge.removeListener('app.newUrl', this.checkNewUrl);
            this.appBridge.removeListener('watcher.swapHosts', this.swapHosts);
            this.appBridge.removeListener('watcher.activator.changed', this.controllSendingState);

            this.setProductivityState(this.isVerbose);
            this.triggerSendRequest();
            this.turnOffTheSender();

            this.triggerBrowserActionIconChange(this.activator.state ? '-coffee' : '-inactive');

            this.appBridge.addListener('watcher.activator.changed', this.handleActivatorStateChangeWhileDisabled);
        },

        spreadData: function() {
            var isActive = !watcher.activator.state ? -1 : (watcher.isEnabled() ? 1 : 0);
            var spentTime = watcher.getandResetSpentTime();
            if (isActive == 1)
                watcher.addScoreFromSpentTime(spentTime);

            watcher.appBridge.trigger('watcher.dataChanged', {
                state: isActive,
                score: watcher.score,
                lastSend: watcher.lastSendTime,
                nextSend: watcher.lastSendTime + watcher.sendInterval
            });

        },

        triggerBrowserActionIconChange: function(type) {
            if (type !== undefined)
                watcher.appBridge.trigger('app.changeIcon', type);

            else {
                if (!watcher.activator.state) watcher.appBridge.trigger('app.changeIcon', '-inactive');
                else if (!watcher.isEnabled()) watcher.appBridge.trigger('app.changeIcon', '-coffee');
                else if (watcher.productivityState > 0) watcher.appBridge.trigger('app.changeIcon', '-up');
                else if (watcher.productivityState < 0) watcher.appBridge.trigger('app.changeIcon', '-down');
                else watcher.appBridge.trigger('app.changeIcon', '');
            }
        },

        setOptions: function(params) {

            this.setValue(params, 'viceDomains');
            this.setValue(params, 'goodDomains');
            this.swapHosts(this.isSwapped);

            if (!params.isSandBox) {
                if (params.sendInterval) {
                    this.sendInterval = params.sendInterval * 1000 * 60;
                    if (this.sendInterval < 60000 ) this.sendInterval = 60000;
                    if (this.sendIntervalID)
                        this.turnOnTheSender();
                }
            }

            if (params.siteWatcherIsActive) {
                if (params.siteWatcherIsActive == 'true')
                    this.enable();
                else
                    this.disable();
            }

            if (params.isVerboseSiteWatcher)
                this.isVerbose = params.isVerboseSiteWatcher == 'true' ? true : false;

            for (var ac in this.activators)
                this.activators[ac].setOptions(params);

            this.setValue(params, 'activatorName');
            this.setActivator(this.activatorName);

        },

        setValue: function(params, name) {
            if (params[name]) this[name] = params[name];
        },

        setActivator: function(name) {
            name = this.activators[name] ? name : 'alwaysoff';

            if (this.activators[name] != this.activator) {
                this.activator.disable();
                this.activator = this.activators[name];
                this.activator.enable();
            }

            if (this.isEnabled() && this.activator.state)
                this.addScoreFromSpentTime(this.getandResetSpentTime());
        },

        getHost: function(url) {
            var domain = url.replace(/https?:\/\/w{0,3}\.?([\w.\-]+).*/, '$1');
            var split = domain.split('.');
            if(split.length >= 3) {
                if(split[split.length-2] == 'co')
                    return split[split.length-3] + '.' + split[split.length-2] + '.' +split[split.length-1];

                return split[split.length-2] + '.' +split[split.length-1];
            }
            return domain;

            var badArray = [
            	['google', 'co', 'uk'],
            	['facebook', 'com']
            ];

            var goodArray = [
            	['google', 'com', 'br'],
            	['developers', 'facebook', 'com']
            ];

            var currentUrl = [
            	'www', 'facebook', 'com'
            ];

            function isArraySame(array, otherArray) {

            	// Check if both arrays share the same length AND values of each index are identical
            	let isSame = array.length === otherArray.length && array.every((urlBit, index) => {
            		return urlBit === otherArray[index];
            	});

            	// Just a bool
            	return isSame;
            }

            function isGoodOrBad() {
            	var state;

            	goodArray.forEach(urlArray => {
            		if (isArraySame(currentUrl, urlArray)) state = 1;
            	});

            	badArray.forEach(urlArray => {
            		if (isArraySame(currentUrl, urlArray)) state = -1;
            	});

            	if (state === undefined) function();

            	return state;
            }

            console.log(isGoodOrBad());

        },

        checkNewUrl: function(url) {

            var spentTime = watcher.getandResetSpentTime(),
                host = watcher.getHost(url);

            if (!watcher.activator.state) {
                watcher.host = host;
                return;
            }

            watcher.addScoreFromSpentTime(spentTime);
            watcher.setProductivityState(host, watcher.activator.state && watcher.isVerbose, true);

            watcher.host = host;
        },

        getandResetSpentTime: function() {
            var now = new Date().getTime();
                spent = now - this.timestamp;

            this.timestamp = now;

            return spent * 0.001 / 60;
        },

        addScoreFromSpentTime: function(spentTime) {

            var score = 0;

            if (this.productivityState > 0)
                score = spentTime * this.goodTimeMultiplier;
            else if (this.productivityState < 0)
                score = (spentTime * this.badTimeMultiplier) * -1;

            this.score += score;
        },

        setProductivityState: function(host, notify) {
            var state = 0, data;
            if (this.goodHosts.indexOf(host) != -1)
                state = 1;
            else if (this.badHosts.indexOf(host) != -1)
                state = -1;

            if (this.productivityState !== state) {

                if (state > 0) {
                    data = {
                        score: 1,
                        message: 'Great!'+(this.isSwapped ? ' Just relax :)' : ' Looks like you\'ve started working!')
                    };

                } else if (state < 0) {
                    data = {
                        score: -1,
                        message: "I'm watching you!"+(this.isSwapped ? " You\'re not supposed to be working!" :" Try to get back to work soon!")
                    };

                } else if (!state) {
                    data = null;
                }

                this.productivityState = state;

                if (notify && data)
                    this.appBridge.trigger('app.notify', data);
            }

            if (state < 0) this.triggerBrowserActionIconChange('-down');
            else if (state > 0) this.triggerBrowserActionIconChange('-up');
            else this.triggerBrowserActionIconChange('');
        },

        controllSendingState: function(value) {

            if (watcher.activator.state && !value) {
                watcher.triggerSendRequest();
                watcher.turnOffTheSender();
                watcher.productivityState = 0;
                watcher.triggerBrowserActionIconChange('-inactive');

            } else if (!watcher.activator.state && value) {
                watcher.turnOnTheSender();
                watcher.setProductivityState(watcher.host, watcher.isVerbose, false);

            } else if (watcher.activator.state && value && !watcher.sendIntervalID) {
                watcher.turnOnTheSender();
                watcher.setProductivityState(watcher.host, watcher.isVerbose, false);

            } else if (!watcher.activator.state && !value && watcher.sendIntervalID) {
                watcher.triggerSendRequest();
                watcher.turnOffTheSender();
                watcher.productivityState = 0;

            }
        },

        handleActivatorStateChangeWhileDisabled: function(value)
        {
            if (watcher.activator.state && !value) {
                watcher.triggerBrowserActionIconChange('-inactive');

            } else if (!watcher.activator.state && value) {
                watcher.triggerBrowserActionIconChange('-coffee');

            }
        },

        triggerSendRequest: function() {
            watcher.addScoreFromSpentTime(watcher.getandResetSpentTime());
            watcher.lastSendTime = new Date().getTime();

            function sendScoreReq () {
                if (watcher.score !== 0) {
                    watcher.appBridge.trigger('controller.sendRequest', {
                        urlSuffix: watcher.urlPrefix+(watcher.score < 0 ? 'score/down' : 'score/up')
                    });
                    watcher.score = 0;
                }
            }

            watcher.appBridge.trigger('controller.sendAjaxRequest', {
                urlSuffix: '/tasks/' + watcher.urlPrefix,
                type: 'GET',
                callback: function () {
                    sendScoreReq();
                },
                callbackError: function () {
                    watcher.appBridge.trigger('controller.sendAjaxRequest', {
                        urlSuffix: '/tasks/user',
                        type: 'POST',
                        data: {
                            type: 'habit',
                            alias: 'productivity',
                            text: 'productivity',
                            notes: 'This task was created by the Habitica Chrome Extension.'
                        },
                        callback: function () {
                            sendScoreReq();
                        }
                    });
                }
            });
        },

        turnOnTheSender: function() {
            watcher.turnOffTheSender();
            watcher.sendIntervalID = setInterval(watcher.triggerSendRequest, watcher.sendInterval);
        },

        turnOffTheSender: function() {
            watcher.sendIntervalID = clearInterval(watcher.sendIntervalID);
        },

        swapHosts: function(isSwapped) {
            if (isSwapped) {
                watcher.badHosts = watcher.goodDomains.split('\n');
                watcher.goodHosts = watcher.viceDomains.split('\n');
            } else {
                watcher.badHosts = watcher.viceDomains.split('\n');
                watcher.goodHosts = watcher.goodDomains.split('\n');
            }

            watcher.isSwapped = isSwapped;
        }

    };

    return {
        getScore: function() { return watcher.score; },
        isEnabled: function() { return watcher.appBridge.hasListener('app.newUrl', watcher.checkNewUrl); },
        init: function(appBridge) { watcher.init(appBridge); },
        setOptions: function(params) { watcher.setOptions(params); },
        forceSendRequest: function() { watcher.triggerSendRequest(); }
    };

})();
