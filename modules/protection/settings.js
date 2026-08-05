/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/settings.js
 *
 * Purpose:
 * Defines persistent settings for the Protection application.
 *
 * Responsibilities:
 * - Create the Protection settings namespace
 * - Define validated wallet-protection defaults
 * - Define the selected deposit destination
 * - Expose the settings API to Protection files
 *
 * Does NOT:
 * - Evaluate wallet balances
 * - Navigate to deposit pages
 * - Fill or submit deposit forms
 * - Render the Protection interface
 *
 * Public API:
 * - TACTIC.protection.settings
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection Settings] Namespace is unavailable."
        );

        return;
    }

    const settingsService =
        TACTIC.services.settings;

    if (!settingsService) {
        console.error(
            "[TACTIC Protection Settings] Settings service is unavailable."
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

    const DESTINATIONS =
        Object.freeze({
            FACTION_BANK:
                "faction-bank",

            PERSONAL_VAULT:
                "personal-vault",

            BANK:
                "bank",
        });

    const settings =
        settingsService.namespace(
            "protection",
            {
                displayName:
                    "Wallet Protection",

                description:
                    "Protects wallet cash by preparing deposits to a selected destination.",

                version:
                    "1.1.0",

                category:
                    "Protection",
            }
        );

    settings.define({
        enabled: {
            type:
                "boolean",

            default:
                false,

            label:
                "Enable Protection",

            description:
                "Allows Protection to recommend and prepare deposits when the wallet exceeds the configured threshold.",

            category:
                "General",
        },

        depositDestination: {
            type:
                "string",

            default:
                DESTINATIONS
                    .FACTION_BANK,

            allowed: [
                DESTINATIONS
                    .FACTION_BANK,

                DESTINATIONS
                    .PERSONAL_VAULT,

                DESTINATIONS.BANK,
            ],

            label:
                "Deposit Destination",

            description:
                "Selects where Protection should prepare the recommended deposit.",

            category:
                "Destination",
        },

        threshold: {
            type:
                "number",

            default:
                50_000,

            minimum:
                0,

            maximum:
                100_000_000_000,

            integer:
                true,

            label:
                "Activation Threshold",

            description:
                "Protection recommends a deposit only when the wallet exceeds this amount.",

            category:
                "Wallet",
        },

        reserve: {
            type:
                "number",

            default:
                50_000,

            minimum:
                0,

            maximum:
                100_000_000_000,

            integer:
                true,

            label:
                "Keep in Wallet",

            description:
                "The amount Protection attempts to leave in the wallet.",

            category:
                "Wallet",
        },

        maximumAutomaticDeposit: {
            type:
                "number",

            default:
                1_000_000_000,

            minimum:
                1,

            maximum:
                1_000_000_000,

            integer:
                true,

            label:
                "Maximum Prepared Amount",

            description:
                "The maximum amount Protection will place into a deposit field at one time.",

            category:
                "Safety",
        },

        duplicateCooldownMs: {
            type:
                "number",

            default:
                20_000,

            minimum:
                1_000,

            maximum:
                300_000,

            integer:
                true,

            label:
                "Duplicate Cooldown",

            description:
                "Prevents Protection from repeatedly preparing the same deposit during this period.",

            category:
                "Safety",
        },

        notifyOnTrigger: {
            type:
                "boolean",

            default:
                true,

            label:
                "Trigger Notifications",

            description:
                "Shows a notification when Protection detects excess wallet cash.",

            category:
                "Notifications",
        },

        notifyOnPrepared: {
            type:
                "boolean",

            default:
                true,

            label:
                "Prepared Notifications",

            description:
                "Shows a notification after Protection fills a deposit amount.",

            category:
                "Notifications",
        },
    });

    TACTIC.protection.destinations =
        DESTINATIONS;

    TACTIC.protection.settings =
        settings;

    TACTIC.services.logger?.info(
        "Protection settings loaded"
    );
})();