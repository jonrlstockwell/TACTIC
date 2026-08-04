(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Bootstrap] Namespace is unavailable."
        );

        return;
    }

    async function start() {
        if (TACTIC.initialized) {
            TACTIC.services.logger?.warn(
                "TACTIC is already initialized"
            );

            return;
        }

        const logger =
            TACTIC.services.logger;

        const events =
            TACTIC.services.events;

        try {
            logger.info(
                "Starting TACTIC"
            );

            await TACTIC.initializeAllModules();

            await TACTIC.services.drawer
                .initialize();

            TACTIC.initialized = true;

            events.emit(
                "app:ready",
                {
                    version:
                        TACTIC.version,

                    moduleCount:
                        TACTIC.modules.size,
                }
            );

            logger.info(
                "TACTIC started successfully",
                {
                    version:
                        TACTIC.version,

                    modules:
                        TACTIC.modules.size,
                }
            );
        } catch (error) {
            TACTIC.initialized =
                false;

            logger.error(
                "TACTIC startup failed",
                {
                    message:
                        error.message,

                    stack:
                        error.stack,
                }
            );

            events.emit(
                "app:error",
                {
                    error,
                }
            );
        }
    }

    TACTIC.start = start;

    /*
     * The userscript runs at document-idle, but this protects
     * against an unusual early-load state.
     */
    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true,
            }
        );
    } else {
        start();
    }
})();