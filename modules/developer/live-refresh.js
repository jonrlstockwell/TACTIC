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
 * - Refresh the dashboard when it is the active drawer module
 * - Debounce repeated refresh requests
 * - Avoid refreshing unrelated drawer modules
 * - Expose live-refresh diagnostics
 *
 * Does NOT:
 * - Render dashboard content directly
 * - Modify wallet data
 * - Perform deposits or Protection actions
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
        errors,
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

        refreshErrors:
            0,

        lastWalletValue:
            null,

        lastWalletUpdateAt:
            null,

        lastRefreshAt:
            null,

        lastSkipReason:
            null,

        lastError:
            null,
    };

    /*
     * The active module ID is more reliable than drawer.isOpen()
     * after Torn restores the drawer during page startup.
     */
    function isDashboardActive() {
        return (
            drawer.getActiveModuleId() ===
            MODULE_ID
        );
    }

    async function refreshDashboard() {
        if (!isDashboardActive()) {
            metrics.refreshesSkipped +=
                1;

            metrics.lastSkipReason =
                "developer-dashboard-not-active";

            return false;
        }

        try {
            /*
             * Do not use drawer.refresh() here.
             *
             * The restored drawer can visibly remain open while
             * drawer.isOpen() reports false. refresh() may respect
             * that incorrect flag and skip rendering.
             *
             * renderActiveModule() directly rebuilds the currently
             * selected module and does not depend on that flag.
             */
            await drawer.renderActiveModule();

            metrics.refreshesCompleted +=
                1;

            metrics.lastRefreshAt =
                Date.now();

            metrics.lastSkipReason =
                null;

            metrics.lastError =
                null;

            return true;
        } catch (error) {
            metrics.refreshErrors +=
                1;

            metrics.lastError = {
                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    String(error),

                timestamp:
                    Date.now(),
            };

            errors?.report({
                code:
                    TACTIC.ERROR_CODES
                        ?.GENERAL
                        ?.INTERNAL ||
                    "INTERNAL",

                severity:
                    TACTIC.SEVERITY
                        ?.ERROR ||
                    "error",

                service:
                    "developer-dashboard-live-refresh",

                message:
                    "Developer Dashboard live refresh failed.",

                details: {
                    activeModuleId:
                        drawer.getActiveModuleId(),

                    drawerReportedOpen:
                        drawer.isOpen(),
                },

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Reopen the Developer Dashboard or manually refresh it.",
            });

            return false;
        }
    }

    function scheduleRefresh() {
        metrics.refreshesRequested +=
            1;

        if (scheduler) {
            scheduler.once(
                REFRESH_TIMER_NAME,
                REFRESH_DELAY_MS,
                async () => {
                    await refreshDashboard();
                },
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
            () => {
                refreshDashboard();
            },
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

            activeModuleId:
                drawer.getActiveModuleId(),

            drawerReportedOpen:
                drawer.isOpen(),

            metrics: {
                ...metrics,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics.lastError,
                          }
                        : null,
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

        delete TACTIC.services
            .developerDashboardLiveRefresh;

        logger?.info(
            "Developer Dashboard live refresh stopped"
        );

        return true;
    }

    const liveRefresh = {
        inspect,

        refresh:
            scheduleRefresh,

        refreshNow:
            refreshDashboard,

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