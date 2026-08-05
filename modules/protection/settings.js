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
 * - Define validated defaults
 * - Expose the settings API to Protection files
 *
 * Does NOT:
 * - Evaluate wallet balances
 * - Execute deposits
 * - Render the Protection page
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

    const settings =
        settingsService.namespace(
            "protection",
            {
                displayName:
                    "Wallet Protection",

                description:
                    "Protects wallet cash by depositing excess funds into the faction bank.",

                version:
                    "1.0.0",

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
                "Allows Protection to react when the wallet exceeds the configured threshold.",

            category:
                "General",
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
                "Protection evaluates a deposit only when the wallet is greater than this amount.",

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
                "The amount Protection attempts to leave in the wallet after a deposit.",

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
                "Maximum Transaction",

            description:
                "The maximum amount allowed in a single automatic faction-bank transaction.",

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
                "Blocks repeated attempts for the same deposit amount during this period.",

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

        notifyOnComplete: {
            type:
                "boolean",

            default:
                true,

            label:
                "Completion Notifications",

            description:
                "Shows a notification after a deposit is confirmed by a wallet decrease.",

            category:
                "Notifications",
        },
    });

    TACTIC.protection.settings =
        settings;

    TACTIC.services.logger?.info(
        "Protection settings loaded"
    );
})();