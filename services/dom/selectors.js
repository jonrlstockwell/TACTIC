/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/selectors.js
 *
 * Purpose:
 * Registers TACTIC's shared Torn selector catalog with the
 * centralized Selector Registry while preserving the original
 * DOM selector API for backward compatibility.
 *
 * Responsibilities:
 * - Define verified and shared Torn selectors
 * - Register selector metadata with the Selector Registry
 * - Preserve the nested dom.selectors catalog
 * - Preserve dom.getSelector()
 * - Prevent selector duplication across applications
 * - Allow future fallback selectors and diagnostics
 *
 * Does NOT:
 * - Query the DOM directly
 * - Observe elements
 * - Navigate between pages
 * - Perform application business logic
 *
 * Public API:
 * - TACTIC.services.dom.selectors
 * - TACTIC.services.dom.getSelector()
 * - TACTIC.services.selectors
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/selectors/index.js
 * - core/logger.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Selectors] Namespace is unavailable."
        );

        return;
    }

    const {
        dom,
        selectors,
        logger,
    } = TACTIC.services;

    if (!dom) {
        console.error(
            "[TACTIC DOM Selectors] DOM service is unavailable."
        );

        return;
    }

    if (!selectors) {
        console.error(
            "[TACTIC DOM Selectors] Selector Registry service is unavailable."
        );

        return;
    }

    function deepFreeze(
        value
    ) {
        if (
            value === null ||
            typeof value !==
                "object" ||
            Object.isFrozen(
                value
            )
        ) {
            return value;
        }

        Object.freeze(
            value
        );

        for (
            const nestedValue of
            Object.values(
                value
            )
        ) {
            deepFreeze(
                nestedValue
            );
        }

        return value;
    }

    /*
     * This nested object preserves the original selector catalog
     * shape used throughout TACTIC.
     *
     * Existing code can continue using:
     *
     * dom.selectors.USER.WALLET
     * dom.getSelector("USER.WALLET")
     */
    const SELECTORS =
        deepFreeze({
            DOCUMENT: {
                BODY:
                    "body",

                HEAD:
                    "head",

                TITLE:
                    "title",
            },

            USER: {
                /*
                 * Verified Torn wallet display.
                 */
                WALLET:
                    "#user-money",
            },

            FACTION: {
                ARMOURY_DONATE_ROOT:
                    "#tab\\=armoury\\&sub\\=donate",

                CASH_SECTION:
                    "#tab\\=armoury\\&sub\\=donate div.cash.left",

                CASH_FORM:
                    "#tab\\=armoury\\&sub\\=donate div.cash.left form",

                DEPOSIT_AMOUNT:
                    "#tab\\=armoury\\&sub\\=donate input.amount.input-money",

                DEPOSIT_BUTTON:
                    "#tab\\=armoury\\&sub\\=donate div.cash.left form button.torn-btn",

                PRESET_AMOUNT_BUTTONS:
                    "#tab\\=armoury\\&sub\\=donate div.cash.left form input.wai-btn",
            },

            DIALOG: {
                /*
                 * Generic Torn dialog containers. Applications
                 * must verify dialog content and button text before
                 * taking any action.
                 */
                VISIBLE_DIALOGS:
                    '[role="dialog"], .dialog, .confirm-wrap, .modal',

                BUTTONS:
                    'button, input[type="button"], input[type="submit"]',
            },

            MARKET: {
                LINKS:
                    'a[href*="imarket.php"]',

                CATEGORY_LINKS:
                    'a[href*="imarket.php"][href*="category"], a[href*="imarket.php"][href*="cat"]',
            },
        });

    /*
     * Rich selector definitions used by the new registry.
     *
     * Fallbacks can be added to any definition later without
     * changing the consuming repository, service, or module.
     */
    const DEFINITIONS = [
        {
            key:
                "DOCUMENT.BODY",

            selector:
                SELECTORS
                    .DOCUMENT
                    .BODY,

            description:
                "The current document body element.",

            pageId:
                "global",

            required:
                true,

            verified:
                true,

            visible:
                false,

            metadata: {
                category:
                    "document",

                generic:
                    true,
            },
        },

        {
            key:
                "DOCUMENT.HEAD",

            selector:
                SELECTORS
                    .DOCUMENT
                    .HEAD,

            description:
                "The current document head element.",

            pageId:
                "global",

            required:
                true,

            verified:
                true,

            visible:
                false,

            metadata: {
                category:
                    "document",

                generic:
                    true,
            },
        },

        {
            key:
                "DOCUMENT.TITLE",

            selector:
                SELECTORS
                    .DOCUMENT
                    .TITLE,

            description:
                "The current document title element.",

            pageId:
                "global",

            required:
                false,

            verified:
                true,

            visible:
                false,

            metadata: {
                category:
                    "document",

                generic:
                    true,
            },
        },

        {
            key:
                "USER.WALLET",

            selector:
                SELECTORS
                    .USER
                    .WALLET,

            description:
                "The current player's displayed wallet balance.",

            pageId:
                "global",

            required:
                true,

            verified:
                true,

            visible:
                true,

            metadata: {
                category:
                    "user",

                repository:
                    "user",

                dataKey:
                    "wallet",
            },
        },

        {
            key:
                "FACTION.ARMOURY_DONATE_ROOT",

            selector:
                SELECTORS
                    .FACTION
                    .ARMOURY_DONATE_ROOT,

            description:
                "The root container for the faction armoury donation page.",

            pageId:
                "faction",

            required:
                false,

            verified:
                true,

            visible:
                true,

            metadata: {
                category:
                    "faction-bank",

                destination:
                    "faction-bank",

                role:
                    "page-root",
            },
        },

        {
            key:
                "FACTION.CASH_SECTION",

            selector:
                SELECTORS
                    .FACTION
                    .CASH_SECTION,

            description:
                "The faction armoury cash donation section.",

            pageId:
                "faction",

            required:
                false,

            verified:
                true,

            visible:
                true,

            metadata: {
                category:
                    "faction-bank",

                destination:
                    "faction-bank",

                role:
                    "cash-section",
            },
        },

        {
            key:
                "FACTION.CASH_FORM",

            selector:
                SELECTORS
                    .FACTION
                    .CASH_FORM,

            description:
                "The faction armoury cash donation form.",

            pageId:
                "faction",

            required:
                false,

            verified:
                true,

            visible:
                true,

            metadata: {
                category:
                    "faction-bank",

                destination:
                    "faction-bank",

                role:
                    "deposit-form",
            },
        },

        {
            key:
                "FACTION.DEPOSIT_AMOUNT",

            selector:
                SELECTORS
                    .FACTION
                    .DEPOSIT_AMOUNT,

            description:
                "The faction-bank cash deposit amount field.",

            pageId:
                "faction",

            required:
                false,

            verified:
                true,

            visible:
                true,

            metadata: {
                category:
                    "faction-bank",

                destination:
                    "faction-bank",

                role:
                    "amount-input",

                publicAction:
                    "fill",
            },
        },

        {
            key:
                "FACTION.DEPOSIT_BUTTON",

            selector:
                SELECTORS
                    .FACTION
                    .DEPOSIT_BUTTON,

            description:
                "The faction-bank deposit submission button.",

            pageId:
                "faction",

            required:
                false,

            verified:
                true,

            visible:
                true,

            metadata: {
                category:
                    "faction-bank",

                destination:
                    "faction-bank",

                role:
                    "submit-control",

                publicAction:
                    "highlight-only",

                submissionRestricted:
                    true,
            },
        },

        {
            key:
                "FACTION.PRESET_AMOUNT_BUTTONS",

            selector:
                SELECTORS
                    .FACTION
                    .PRESET_AMOUNT_BUTTONS,

            description:
                "Preset cash amount controls on the faction donation form.",

            pageId:
                "faction",

            required:
                false,

            verified:
                true,

            visible:
                true,

            multiple:
                true,

            metadata: {
                category:
                    "faction-bank",

                destination:
                    "faction-bank",

                role:
                    "preset-controls",
            },
        },

        {
            key:
                "DIALOG.VISIBLE_DIALOGS",

            selector:
                SELECTORS
                    .DIALOG
                    .VISIBLE_DIALOGS,

            description:
                "Generic Torn dialog and modal containers.",

            pageId:
                "global",

            required:
                false,

            verified:
                true,

            visible:
                true,

            multiple:
                true,

            metadata: {
                category:
                    "dialog",

                generic:
                    true,

                requiresContentVerification:
                    true,
            },
        },

        {
            key:
                "DIALOG.BUTTONS",

            selector:
                SELECTORS
                    .DIALOG
                    .BUTTONS,

            description:
                "Generic buttons that may appear inside Torn dialogs.",

            pageId:
                "global",

            required:
                false,

            verified:
                true,

            visible:
                true,

            multiple:
                true,

            metadata: {
                category:
                    "dialog",

                generic:
                    true,

                requiresTextVerification:
                    true,
            },
        },

        {
            key:
                "MARKET.LINKS",

            selector:
                SELECTORS
                    .MARKET
                    .LINKS,

            description:
                "Links pointing to Torn's item market.",

            pageId:
                "global",

            required:
                false,

            verified:
                true,

            visible:
                false,

            multiple:
                true,

            metadata: {
                category:
                    "market",

                generic:
                    true,

                role:
                    "market-link",
            },
        },

        {
            key:
                "MARKET.CATEGORY_LINKS",

            selector:
                SELECTORS
                    .MARKET
                    .CATEGORY_LINKS,

            description:
                "Links pointing to item-market categories.",

            pageId:
                "global",

            required:
                false,

            verified:
                true,

            visible:
                false,

            multiple:
                true,

            metadata: {
                category:
                    "market",

                generic:
                    true,

                role:
                    "category-link",
            },
        },
    ];

    /*
     * Register or replace every catalog entry.
     *
     * replace: true makes development reloads and future selector
     * migrations deterministic without creating duplicate errors.
     */
    const registrationResults =
        selectors.registerMany(
            DEFINITIONS,
            {
                replace:
                    true,
            }
        );

    /*
     * Backward-compatible selector lookup.
     *
     * This returns the primary selector string, matching the
     * original API. Runtime resolution and fallback selection are
     * handled by services.selectors.resolve() or find().
     */
    function getSelector(
        path
    ) {
        if (
            typeof path !==
                "string" ||
            !path.trim()
        ) {
            return null;
        }

        const key =
            path
                .trim()
                .toUpperCase();

        const registered =
            selectors.get(
                key
            );

        if (
            registered
                ?.definition
                ?.selector
        ) {
            return registered
                .definition
                .selector;
        }

        /*
         * Nested-catalog fallback retained as an additional
         * compatibility safeguard.
         */
        const parts =
            key
                .split(".")
                .filter(
                    Boolean
                );

        let value =
            SELECTORS;

        for (
            const part of
            parts
        ) {
            if (
                value === null ||
                typeof value !==
                    "object" ||
                !Object.prototype
                    .hasOwnProperty
                    .call(
                        value,
                        part
                    )
            ) {
                return null;
            }

            value =
                value[
                    part
                ];
        }

        return typeof value ===
            "string"
            ? value
            : null;
    }

    dom.selectors =
        SELECTORS;

    dom.getSelector =
        getSelector;

    logger?.info(
        "DOM selector catalog registered",
        {
            selectorCount:
                registrationResults
                    .length,
        }
    );
})();