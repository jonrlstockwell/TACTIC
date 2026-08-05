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
 * Defines the deposit destinations supported by Wallet
 * Protection and the verified capabilities of each destination.
 *
 * Responsibilities:
 * - Describe supported deposit destinations
 * - Provide verified amount-field selectors
 * - Identify whether safe amount filling is currently available
 * - Keep destination-specific details out of Protection logic
 *
 * Does NOT:
 * - Navigate
 * - Fill forms
 * - Click submit or confirmation buttons
 * - Guess unverified selectors
 *
 * Public API:
 * - TACTIC.protection.destinationRegistry
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

    if (
        !TACTIC.protection ||
        typeof TACTIC.protection !==
            "object"
    ) {
        TACTIC.protection = {};
    }

    const destinationIds =
        TACTIC.protection
            .destinations;

    if (!destinationIds) {
        console.error(
            "[TACTIC Protection Destinations] Protection destination constants are unavailable."
        );

        return;
    }

    const registry =
        Object.freeze({
            [destinationIds
                .FACTION_BANK]: Object.freeze({
                id:
                    destinationIds
                        .FACTION_BANK,

                name:
                    "Faction Bank",

                description:
                    "Prepares a cash deposit in the faction armoury.",

                amountSelectorPath:
                    "FACTION.DEPOSIT_AMOUNT",

                submitSelectorPath:
                    "FACTION.DEPOSIT_BUTTON",

                fillSupported:
                    true,

                submitSupported:
                    false,

                verified:
                    true,
            }),

            [destinationIds
                .PERSONAL_VAULT]: Object.freeze({
                id:
                    destinationIds
                        .PERSONAL_VAULT,

                name:
                    "Personal Vault",

                description:
                    "Prepares a deposit into the player's personal vault.",

                amountSelectorPath:
                    null,

                submitSelectorPath:
                    null,

                fillSupported:
                    false,

                submitSupported:
                    false,

                verified:
                    false,
            }),

            [destinationIds.BANK]:
                Object.freeze({
                    id:
                        destinationIds.BANK,

                    name:
                        "Bank",

                    description:
                        "Prepares a deposit into Torn's investment bank.",

                    amountSelectorPath:
                        null,

                    submitSelectorPath:
                        null,

                    fillSupported:
                        false,

                    submitSupported:
                        false,

                    verified:
                        false,
                }),
        });

    function get(
        destinationId
    ) {
        return (
            registry[
                destinationId
            ] ||
            null
        );
    }

    function list() {
        return Object.values(
            registry
        ).map(
            (destination) => ({
                ...destination,
            })
        );
    }

    function inspect() {
        return {
            destinations:
                list(),

            supportedForFilling:
                list()
                    .filter(
                        (destination) =>
                            destination
                                .fillSupported
                    )
                    .map(
                        (destination) =>
                            destination.id
                    ),
        };
    }

    TACTIC.protection
        .destinationRegistry =
        Object.freeze({
            get,
            list,
            inspect,
        });

    TACTIC.services.logger?.info(
        "Protection destination registry loaded"
    );
})();