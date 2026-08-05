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
// ============================================================
// TACTIC CORE FOUNDATION
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/namespace.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/constants.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/config.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/storage.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/events.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/logger.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/utilities.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/module-manager.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/developer.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/errors.js?v=1


// ============================================================
// RUNTIME FOUNDATION
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/scheduler/index.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/health.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/capabilities/index.js?v=2


// ============================================================
// DOM SERVICE
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/index.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/selectors.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/navigation.js?v=2


// ============================================================
// GENERAL APPLICATION SERVICES
// Notifications must load before Deposit.
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/settings/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/notifications/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/transactions/index.js?v=1


// ============================================================
// SHARED DEPOSIT SERVICE
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/destinations.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/index.js?v=1


// ============================================================
// REPOSITORIES
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/user/index.js?v=1


// ============================================================
// LIFECYCLE
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/lifecycle.js?v=1


// ============================================================
// USER INTERFACE
// Must load before registered modules and Bootstrap.
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/components/index.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/drawer/index.js?v=2


// ============================================================
// PROTECTION APPLICATION
// Compatibility bridges remain temporarily.
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/settings.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/destinations.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/rules.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/assistant.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/index.js?v=1


// ============================================================
// DEVELOPER BUILD ONLY
// Exclude these from the eventual public loader.
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/index.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/live-refresh.js?v=3


// ============================================================
// BOOTSTRAP
// Must always remain last.
// ============================================================

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