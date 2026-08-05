/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/developer/index.js
 *
 * Purpose:
 * Registers the modular Developer Dashboard drawer application.
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Developer Dashboard] Namespace is unavailable."
        );

        return;
    }

    const MODULE_ID =
        "developer-dashboard";

    const dashboard =
        TACTIC.developerDashboard;

    if (!dashboard) {
        console.error(
            "[TACTIC Developer Dashboard] Dashboard framework is unavailable."
        );

        return;
    }

    let removeReadyListener =
        null;

    async function refreshIfActive() {
        const drawer =
            TACTIC.services.drawer;

        if (
            !drawer ||
            drawer.getActiveModuleId?.() !==
                MODULE_ID
        ) {
            return false;
        }

        await drawer
            .renderActiveModule();

        return true;
    }

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Developer",

        icon:
            "🧪",

        version:
            "2.0.0",

        order:
            900,

        async init({
            logger,
            events,
        }) {
            removeReadyListener =
                events.on(
                    TACTIC.EVENTS
                        .APP
                        .READY,
                    refreshIfActive
                );

            logger.info(
                "Developer Dashboard 2.0 initialized",
                {
                    sectionCount:
                        dashboard
                            .getSections()
                            .length,
                }
            );

            events.emit(
                "developer-dashboard:initialized"
            );
        },

        render(
            container
        ) {
            dashboard.render(
                container
            );
        },

        destroy({
            logger,
        }) {
            if (
                typeof removeReadyListener ===
                "function"
            ) {
                removeReadyListener();

                removeReadyListener =
                    null;
            }

            logger.info(
                "Developer Dashboard destroyed"
            );
        },
    });
})();