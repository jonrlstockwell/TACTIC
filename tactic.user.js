// ==UserScript==
// @name         TACTIC Modular Dev
// @namespace    https://github.com/jonrlstockwell/TACTIC
// @version      0.3.0-dev
// @description  Torn Assistant & Companion Toolkit (Development Build)
// @author       Jon Stockwell
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @run-at       document-start

// ============================================================
// CORE FRAMEWORK
// ============================================================

// Namespace must load first.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/namespace.js?v=1

// Shared definitions.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/constants.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/config.js?v=1

// Core infrastructure.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/logger.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/events.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/errors.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/health.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/lifecycle.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/module-manager.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/storage.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/utilities.js?v=1

// Developer state depends on Events.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/developer.js?v=2

// ============================================================
// REPOSITORIES
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/user/index.js?v=2

// ============================================================
// DOM AND SELECTOR SERVICES
// ============================================================

// Base DOM and selector services.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/index.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/selectors/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/selectors.js?v=3

// DOM page subsystem and registered helpers.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/index.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/faction.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/vault.js?v=1

// DOM navigation-change detection.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/navigation.js?v=2

// ============================================================
// DIAGNOSTICS SERVICE
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/diagnostics/index.js?v=1

// ============================================================
// DEPOSIT SERVICES
// ============================================================

// Destination definitions must load before the Deposit Service.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/destinations.js?v=5
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/index.js?v=4

// ============================================================
// PROTECTION APPLICATION
// ============================================================

// Protection settings and rules must load before the workflow
// and application module.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/settings.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/rules.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/workflows/protection.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/index.js?v=2

// ============================================================
// DEVELOPER DASHBOARD
// Developer build only.
// ============================================================

// Dashboard registry.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/dashboard.js?v=3

// Dashboard sections.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/framework.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/runtime.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/services.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/repositories.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/scheduler.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/modules.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/diagnostics.js?v=8
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/state.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/jobs.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/actions.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/workflows.js?v=2

// Dashboard application and live refresh.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/index.js?v=5
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/live-refresh.js?v=3

// ==/UserScript==

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
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
                configurable:
                    true,

                enumerable:
                    false,

                get() {
                    return globalThis
                        .TACTIC;
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
        TACTIC
    );
})();