/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/developer/live-refresh.js
 *
 * Purpose:
 * Keeps the Developer Dashboard synchronized with live User
 * Repository wallet changes.
 *
 * Responsibilities:
 * - Subscribe to User Repository wallet updates
 * - Refresh the dashboard when it is open and active
 * - Debounce repeated refresh requests
 * - Avoid unnecessary rendering while the dashboard is hidden
 *
 * Does NOT:
 * - Render dashboard content
 * - Modify wallet data
 * - Perform deposits or other Protection actions
 * - Refresh unrelated drawer pages
 *
 * Dependencies:
 * - repositories/user/index.js
 * - services/scheduler/index.js
 * - ui/drawer/index.js
 * - modules/developer/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Developer Live Refresh] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        repositories,
    } = TACTIC;

    const {
        drawer,
        scheduler,
        logger,
    } = services;

    const userRepository =
        repositories?.user;

    const MODULE_ID =
        "developer-dashboard";

    const REFRESH_TIMER_NAME =
        "developer-dashboard:live-refresh";

    const REFRESH_TIMER_GROUP =
        "developer-dashboard";

    const REFRESH_DELAY_MS =
        100;

    const INSTALLATION_KEY =
        Symbol.for(
            "TACTIC.DEVELOPER_DASHBOARD.LIVE_REFRESH"
        );

    if (
        globalThis[
            INSTALLATION_KEY
        ]
    ) {
        logger?.debug(
            "Developer Dashboard live refresh is already installed"
        );

        return;
    }

    if (!userRepository) {
        logger?.warn(
            "Developer Dashboard live refresh could not start because the User Repository is unavailable."
        );

        return;
    }

    if (!drawer) {
        logger?.warn(
            "Developer Dashboard live refresh could not start because the Drawer service is unavailable."
        );

        return;
    }

    const metrics = {
        installedAt:
            Date.now(),

        walletUpdatesReceived:
            0,

        refreshesRequested:
            0,

        refreshesCompleted:
            0,

        refreshesSkipped:
            0,

        lastWalletValue:
            null,

        lastWalletUpdateAt:
            null,

        lastRefreshAt:
            null,
    };

    function isDashboardActive() {
        return (
            drawer.isOpen() &&
            drawer.getActiveModuleId() ===
                MODULE_ID
        );
    }

    function refreshDashboard() {
        if (!isDashboardActive()) {
            metrics.refreshesSkipped +=
                1;

            return false;
        }

        drawer.refresh();

        metrics.refreshesCompleted +=
            1;

        metrics.lastRefreshAt =
            Date.now();

        return true;
    }

    function scheduleRefresh() {
        metrics.refreshesRequested +=
            1;

        if (scheduler) {
            scheduler.once(
                REFRESH_TIMER_NAME,
                REFRESH_DELAY_MS,
                refreshDashboard,
                {
                    group:
                        REFRESH_TIMER_GROUP,

                    replaceExisting:
                        true,

                    continueOnError:
                        true,

                    metadata: {
                        module:
                            MODULE_ID,

                        purpose:
                            "live-wallet-refresh",
                    },
                }
            );

            return true;
        }

        setTimeout(
            refreshDashboard,
            REFRESH_DELAY_MS
        );

        return true;
    }

    function handleWalletUpdate({
        value,
    }) {
        metrics.walletUpdatesReceived +=
            1;

        metrics.lastWalletValue =
            value?.value ??
            null;

        metrics.lastWalletUpdateAt =
            Date.now();

        scheduleRefresh();
    }

    const unsubscribeWallet =
        userRepository.subscribe(
            "wallet",
            handleWalletUpdate,
            {
                emitInitial:
                    false,
            }
        );

    function inspect() {
        return {
            service:
                "developer-dashboard-live-refresh",

            installed:
                true,

            dashboardActive:
                isDashboardActive(),

            metrics: {
                ...metrics,
            },
        };
    }

    function destroy() {
        scheduler?.cancel(
            REFRESH_TIMER_NAME
        );

        if (
            typeof unsubscribeWallet ===
            "function"
        ) {
            unsubscribeWallet();
        }

        delete globalThis[
            INSTALLATION_KEY
        ];

        logger?.info(
            "Developer Dashboard live refresh stopped"
        );

        return true;
    }

    const liveRefresh = {
        inspect,
        refresh:
            scheduleRefresh,
        destroy,
    };

    globalThis[
        INSTALLATION_KEY
    ] = liveRefresh;

    TACTIC.services
        .developerDashboardLiveRefresh =
        liveRefresh;

    logger?.info(
        "Developer Dashboard live refresh started"
    );
})();