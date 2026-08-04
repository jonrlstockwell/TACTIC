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
 * Provides one centralized catalog for Torn DOM selectors used
 * by services, repositories, and applications.
 *
 * Responsibilities:
 * - Store shared Torn selectors
 * - Prevent selector duplication
 * - Provide stable selector names
 * - Allow selectors to be updated in one location
 *
 * Does NOT:
 * - Query the DOM
 * - Observe elements
 * - Perform business logic
 *
 * Public API:
 * - TACTIC.services.dom.selectors
 * - TACTIC.services.dom.getSelector()
 *
 * Dependencies:
 * - services/dom/index.js
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

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (!dom) {
        console.error(
            "[TACTIC DOM Selectors] DOM service is unavailable."
        );

        return;
    }

    function deepFreeze(value) {
        if (
            value === null ||
            typeof value !== "object" ||
            Object.isFrozen(value)
        ) {
            return value;
        }

        Object.freeze(value);

        for (
            const nestedValue of
            Object.values(value)
        ) {
            deepFreeze(
                nestedValue
            );
        }

        return value;
    }

    /*
     * Only selectors that have been verified or are sufficiently
     * generic should be placed here.
     *
     * Torn-specific selectors can be corrected here without
     * changing applications that consume them.
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
                 * should verify button text before taking action.
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

    function getSelector(path) {
        if (
            typeof path !== "string" ||
            !path.trim()
        ) {
            return null;
        }

        const parts =
            path
                .trim()
                .split(".")
                .filter(Boolean);

        let value =
            SELECTORS;

        for (
            const part of parts
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
                value[part];
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
        "DOM selector catalog loaded"
    );
})();