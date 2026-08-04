/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * app/bootstrap.js
 *
 * Purpose:
 * Provides the minimal browser entry point for TACTIC.
 *
 * Responsibilities:
 * - Wait until the document is ready
 * - Delegate application startup to the Lifecycle service
 *
 * Does NOT:
 * - Initialize modules directly
 * - Initialize the UI directly
 * - Contain application startup logic
 *
 * Dependencies:
 * - core/lifecycle.js
 *
 * ============================================================
 */

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

    async function boot() {
        const lifecycle =
            TACTIC.services.lifecycle;

        if (!lifecycle) {
            console.error(
                "[TACTIC Bootstrap] Lifecycle service is unavailable."
            );

            return;
        }

        try {
            await lifecycle.start();
        } catch (error) {
            console.error(
                "[TACTIC Bootstrap] Startup failed.",
                error
            );
        }
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );
    } else {
        boot();
    }
})();