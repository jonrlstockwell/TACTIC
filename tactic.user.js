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
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start

// ============================================================
// CORE FRAMEWORK
// ============================================================

// Namespace must load before every other TACTIC file.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/namespace.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/dependencies.js?v=2

// Shared framework definitions.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/constants.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/config.js?v=1

// Logging and events.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/logger.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/events.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/errors.js?v=1

// Scheduler must load before Health.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/scheduler/index.js?v=1

// Core runtime infrastructure.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/health.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/lifecycle.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/module-manager.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/storage.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/utilities.js?v=1

// Developer service depends on Events and Violentmonkey grants.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/developer.js?v=2

// ============================================================
// SHARED APPLICATION SERVICES
// ============================================================

// Capabilities must load before Actions and Workflows.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/capabilities/index.js?v=1

// Shared settings and notifications.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/settings/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/notifications/index.js?v=1

// Action and Workflow frameworks.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/actions/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/workflows/index.js?v=1

// Shared runtime state, jobs, and transactions.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/state/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/jobs/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/transactions/index.js?v=1

// ============================================================
// DOM AND SELECTOR SERVICES
// ============================================================

// Base DOM service.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/index.js?v=3

// Selector registry and Torn selector catalog.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/selectors/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/selectors.js?v=3

// DOM page subsystem.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/index.js?v=2
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/framework.js?v=1

// Deposit-page DOM helpers.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/faction.js?v=6
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/vault.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/api.js?v=4

// Browser and Torn SPA navigation detection.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/navigation.js?v=2

// ============================================================
// CENTRALIZED NAVIGATION SERVICE
// ============================================================

// This is separate from services/dom/navigation.js.
// It owns route registration, route opening, and route waits.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/navigation/index.js?v=2

// ============================================================
// REPOSITORIES
// ============================================================

// The User Repository depends on the DOM service and selectors.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/user/index.js?v=2

// ============================================================
// USER INTERFACE
// ============================================================

// Shared UI components must load before the drawer.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/components/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/drawer/index.js?v=1

// ============================================================
// DIAGNOSTICS SERVICE
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/diagnostics/index.js?v=1

// ============================================================
// DEPOSIT SERVICES
// ============================================================

// Destination registry requires the centralized Navigation Service.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/destinations.js?v=5

// Deposit Service requires destinations, capabilities, navigation,
// DOM page helpers, storage, and notifications.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/index.js?v=8

// Register the public deposit.prepare Action.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/actions/deposit.js?v=2

// ============================================================
// PROTECTION APPLICATION
// ============================================================

// Protection settings require the Settings Service.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/settings.js?v=2

// Pure Protection rules.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/rules.js?v=2

// Protection workflow requires Workflows and deposit.prepare.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/workflows/protection.js?v=2

// Protection application requires settings, rules, User Repository,
// Actions, Deposit Service, notifications, and the drawer.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/index.js?v=3
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/dev-auto-prepare.js?v=7

// ============================================================
// DEVELOPER DASHBOARD
// Developer build only.
// ============================================================

// Dashboard framework.
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

// Dashboard module and live refresh.
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/index.js?v=5
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/live-refresh.js?v=3

// ============================================================
// APPLICATION BOOTSTRAP
// Must remain the final @require.
// ============================================================

// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/app/bootstrap.js?v=1

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
     * This exposes the userscript's TACTIC object to Chrome's
     * normal page console as TACTIC_DEV.
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