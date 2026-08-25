// ==UserScript==
// @name         TACTIC Modular Dev
// @namespace    https://github.com/jonrlstockwell/TACTIC
// @version      0.3.5-dev
// @description  Torn Assistant & Companion Toolkit (Development Build)
// @author       Jon Stockwell
// @match        https://www.torn.com/*
//
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
//
// @run-at       document-start
//
//
// ============================================================
// TACTIC CORE FOUNDATION
// ============================================================
//
// Namespace and Dependency Registry must load first.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/namespace.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/dependencies.js?v=1
//
// Shared framework definitions.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/constants.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/config.js?v=1
//
// Core services required by later files.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/storage.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/events.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/logger.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/utilities.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/errors.js?v=1
//
// Module and developer framework.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/module-manager.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/section-manager.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/developer.js?v=1
//
//
// ============================================================
// RUNTIME FOUNDATION
// ============================================================
//
// Scheduler must load before Health.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/scheduler/index.js?v=1
//
// Core runtime infrastructure.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/health.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/capabilities/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/state/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/jobs/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/transactions/index.js?v=1
//
//
// ============================================================
// SHARED APPLICATION SERVICES
// ============================================================
//
// Settings and notifications.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/settings/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/notifications/index.js?v=1
//
// Action and Workflow frameworks.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/actions/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/workflows/index.js?v=1
//
//
// ============================================================
// DOM AND SELECTOR SERVICES
// ============================================================
//
// Base DOM service.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/index.js?v=2
//
// Selector registry and Torn selector catalog.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/selectors/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/selectors.js?v=1
//
// DOM page subsystem.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/framework.js?v=1
//
// Deposit-page DOM helpers.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/faction.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/bank.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/vault.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/api.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/pages/bazaar.js?v=1
//
// Global DOM helpers.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/global/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/global/cayman.js?v=1
//
// Torn SPA navigation detection.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/dom/navigation.js?v=1
//
//
// ============================================================
// CENTRALIZED NAVIGATION SERVICE
// ============================================================
//
// Separate from services/dom/navigation.js.
// Owns route registration, route opening, and route waits.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/navigation/index.js?v=1
//
//
// ============================================================
// FINANCE ENGINE
// Shared financial calculations and recommendation logic.
// Must load before the Finance Repository.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/finance/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/finance/advisor.js?v=1
//
//
// ============================================================
// REPOSITORIES
// ============================================================
//
// Repositories depend on their supporting services.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/user/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/finance/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/repositories/stats/index.js?v=3
//
// Finance funding-source refresh persists across Torn navigation.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/finance/funding-refresh.js?v=1
//
//
// ============================================================
// TRAINING ENGINE
// ============================================================
//
// Gym gain calculations and stat-goal planning.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/training/index.js?v=5
//
//
// ============================================================
// USER INTERFACE
// ============================================================
//
// Shared components must load before the drawer.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/components/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/ui/drawer/index.js?v=1
//
//
// ============================================================
// DIAGNOSTICS SERVICE
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/diagnostics/index.js?v=1
//
//
// ============================================================
// DEPOSIT SERVICES
// ============================================================
//
// Destination registry requires centralized Navigation.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/destinations.js?v=1
//
// Deposit Service requires destinations, capabilities,
// navigation, DOM page helpers, storage, and notifications.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/deposit/index.js?v=1
//
// Register the public deposit.prepare action.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/actions/deposit.js?v=1
//
//
// ============================================================
// FINANCE APPLICATION
// ============================================================
//
// Finance application shell. Individual Finance sections must
// load after this file.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/finance/index.js?v=1
//
//
// ============================================================
// FINANCE SECTIONS
// Must load after the Finance application shell.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/finance/sections/wallet.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/finance/sections/bank.js?v=1
//
//
// ============================================================
// STATS APPLICATION
// ============================================================
//
// Battle stat overview, goals, and gym training tools.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/stats/index.js?v=18
//
//
// ============================================================
// TOOLS APPLICATION
// ============================================================
//
// Tools application shell. Individual Tool sections must
// load after this file.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/tools/index.js?v=1
//
//
// ============================================================
// TOOL SECTIONS
// Must load after the Tools application shell.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/tools/sections/bazaar-listing.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/tools/sections/city-item-finder.js?v=1
//
//
// ============================================================
// PROTECTION APPLICATION
// ============================================================
//
// Protection settings and rules.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/settings.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/rules.js?v=1
//
// Protection workflow.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/services/workflows/protection.js?v=1
//
// Wallet Protection application and developer automation.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/index.js?v=1
//
//
// ============================================================
// PROTECTION DEVELOPER AUTOMATION
// Development build only.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/protection/dev-auto-prepare.js?v=1
//
//
// ============================================================
// DEVELOPER DASHBOARD
// Developer build only.
// ============================================================
//
// Dashboard framework.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/dashboard.js?v=1
//
// Dashboard sections.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/framework.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/runtime.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/services.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/repositories.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/scheduler.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/modules.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/diagnostics.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/state.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/jobs.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/actions.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/sections/workflows.js?v=1
//
// Dashboard module and live refresh.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/index.js?v=1
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/modules/developer/live-refresh.js?v=1
//
//
// ============================================================
// LIFECYCLE
// Must load after services, repositories, UI, and modules.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/core/lifecycle.js?v=1
//
//
// ============================================================
// APPLICATION BOOTSTRAP
// MUST REMAIN THE FINAL @require.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/main/app/bootstrap.js?v=1
//
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