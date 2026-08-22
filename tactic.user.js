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
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/namespace.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/dependencies.js
//
// Shared framework definitions.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/constants.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/config.js
//
// Core services required by later files.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/storage.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/events.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/logger.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/utilities.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/errors.js
//
// Module and developer framework.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/module-manager.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/section-manager.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/developer.js
//
//
// ============================================================
// RUNTIME FOUNDATION
// ============================================================
//
// Scheduler must load before Health.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/scheduler/index.js
//
// Core runtime infrastructure.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/health.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/capabilities/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/state/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/jobs/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/transactions/index.js
//
//
// ============================================================
// SHARED APPLICATION SERVICES
// ============================================================
//
// Settings and notifications.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/settings/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/notifications/index.js
//
// Action and Workflow frameworks.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/actions/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/workflows/index.js
//
//
// ============================================================
// DOM AND SELECTOR SERVICES
// ============================================================
//
// Base DOM service.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/index.js
//
// Selector registry and Torn selector catalog.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/selectors/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/selectors.js
//
// DOM page subsystem.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/framework.js
//
// Deposit-page DOM helpers.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/faction.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/bank.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/vault.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/api.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/pages/bazaar.js
//
// Global DOM helpers.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/global/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/global/cayman.js
//
// Torn SPA navigation detection.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/dom/navigation.js
//
//
// ============================================================
// CENTRALIZED NAVIGATION SERVICE
// ============================================================
//
// Separate from services/dom/navigation.js.
// Owns route registration, route opening, and route waits.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/navigation/index.js
//
//
// ============================================================
// FINANCE ENGINE
// Shared financial calculations and recommendation logic.
// Must load before the Finance Repository.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/finance/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/finance/advisor.js
//
//
// ============================================================
// REPOSITORIES
// ============================================================
//
// Repositories depend on their supporting services.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/repositories/user/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/repositories/finance/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/repositories/stats/index.js
//
// Finance funding-source refresh persists across Torn navigation.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/finance/funding-refresh.js
//
//
// ============================================================
// TRAINING ENGINE
// ============================================================
//
// Gym gain calculations and stat-goal planning.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/training/index.js
//
//
// ============================================================
// USER INTERFACE
// ============================================================
//
// Shared components must load before the drawer.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/ui/components/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/ui/drawer/index.js
//
//
// ============================================================
// DIAGNOSTICS SERVICE
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/diagnostics/index.js
//
//
// ============================================================
// DEPOSIT SERVICES
// ============================================================
//
// Destination registry requires centralized Navigation.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/deposit/destinations.js
//
// Deposit Service requires destinations, capabilities,
// navigation, DOM page helpers, storage, and notifications.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/deposit/index.js
//
// Register the public deposit.prepare action.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/actions/deposit.js
//
//
// ============================================================
// FINANCE APPLICATION
// ============================================================
//
// Finance application shell. Individual Finance sections must
// load after this file.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/finance/index.js
//
//
// ============================================================
// FINANCE SECTIONS
// Must load after the Finance application shell.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/finance/sections/wallet.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/finance/sections/bank.js
//
//
// ============================================================
// STATS APPLICATION
// ============================================================
//
// Battle stat overview, goals, and gym training tools.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/stats/index.js
//
//
// ============================================================
// TOOLS APPLICATION
// ============================================================
//
// Tools application shell. Individual Tool sections must
// load after this file.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/tools/index.js
//
//
// ============================================================
// TOOL SECTIONS
// Must load after the Tools application shell.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/tools/sections/bazaar-listing.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/tools/sections/city-item-finder.js
//
//
// ============================================================
// PROTECTION APPLICATION
// ============================================================
//
// Protection settings and rules.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/protection/settings.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/protection/rules.js
//
// Protection workflow.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/services/workflows/protection.js
//
// Wallet Protection application and developer automation.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/protection/index.js
//
//
// ============================================================
// PROTECTION DEVELOPER AUTOMATION
// Development build only.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/protection/dev-auto-prepare.js
//
//
// ============================================================
// DEVELOPER DASHBOARD
// Developer build only.
// ============================================================
//
// Dashboard framework.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/dashboard.js
//
// Dashboard sections.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/framework.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/runtime.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/services.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/repositories.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/scheduler.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/modules.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/diagnostics.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/state.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/jobs.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/actions.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/sections/workflows.js
//
// Dashboard module and live refresh.
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/index.js
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/modules/developer/live-refresh.js
//
//
// ============================================================
// LIFECYCLE
// Must load after services, repositories, UI, and modules.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/core/lifecycle.js
//
//
// ============================================================
// APPLICATION BOOTSTRAP
// MUST REMAIN THE FINAL @require.
// ============================================================
//
// @require      https://raw.githubusercontent.com/jonrlstockwell/TACTIC/0fc6dfe9c61ad2d6ccab2cc43ec97332cb63b22b/app/bootstrap.js
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