// ==UserScript==
// @name         TACTIC Modular Dev
// @namespace    local.torn.tactic
// @version      0.2.0-dev
// @description  Modular development build of the Torn Assistant & Companion Toolkit.
// @author       XZer0
// @match        https://www.torn.com/*
//
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
//
// Core foundation
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/namespace.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/constants.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/config.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/storage.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/events.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/logger.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/utilities.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/module-manager.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/developer.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/errors.js?v=...

// Runtime services
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/scheduler/index.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/health.js?v=2

// DOM
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/index.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/selectors.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/navigation.js?v=2

// Application services
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/settings/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/notifications/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/transactions/index.js?v=1

// Repositories
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/user/index.js?v=1

// Lifecycle
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/lifecycle.js?v=1

// UI
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/components/index.js?v=...
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/drawer/index.js?v=...

// Modules
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/settings.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/destinations.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/rules.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/assistant.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/index.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/live-refresh.js?v=3

// Bootstrap — always last
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/app/bootstrap.js?v=4
//
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    if (!globalThis.TACTIC) {
        console.error(
            "[TACTIC Loader] Namespace was not loaded."
        );

        return;
    }

    /*
     * Development-only console access.
     *
     * Violentmonkey runs userscripts in an isolated environment.
     * Exposing this reference lets us inspect TACTIC from Chrome's
     * normal Developer Tools console.
     *
     * Do not store API keys, cookies, or other secrets directly
     * on the TACTIC object.
     */
    try {
        Object.defineProperty(
            unsafeWindow,
            "TACTIC_DEV",
            {
                configurable: true,
                enumerable: false,
                get() {
                    return globalThis.TACTIC;
                },
            }
        );

        console.log(
            "[TACTIC Loader] Debug reference exposed as TACTIC_DEV"
        );
    } catch (error) {
        console.warn(
            "[TACTIC Loader] Could not expose debug reference",
            error
        );
    }

    console.log(
        "[TACTIC Loader] Loader executed",
        globalThis.TACTIC
    );
})();