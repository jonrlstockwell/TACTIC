/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/destinations.js
 *
 * Purpose:
 * Provides backward-compatible Protection access to the shared
 * Deposit destination registry.
 *
 * This compatibility bridge may be removed after all Protection
 * code directly uses TACTIC.services.deposit.
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection Destinations] Namespace is unavailable."
        );

        return;
    }

    const depositDestinations =
        TACTIC.services
            .depositDestinations;

    if (!depositDestinations) {
        console.error(
            "[TACTIC Protection Destinations] Deposit destination registry is unavailable."
        );

        return;
    }

    if (
        !TACTIC.protection ||
        typeof TACTIC.protection !==
            "object"
    ) {
        TACTIC.protection = {};
    }

    TACTIC.protection.destinations =
        depositDestinations.ids;

    TACTIC.protection
        .destinationRegistry =
        Object.freeze({
            get:
                depositDestinations
                    .get,

            list:
                depositDestinations
                    .list,

            inspect:
                depositDestinations
                    .inspect,

            has:
                depositDestinations
                    .has,
        });

    TACTIC.services.logger?.info(
        "Protection destination compatibility bridge loaded"
    );
})();