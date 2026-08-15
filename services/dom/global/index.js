/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/global/index.js
 *
 * Purpose:
 * Registers DOM helpers whose data or controls are available
 * globally rather than being tied to a specific Torn page.
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Global] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (!dom) {
        console.error(
            "[TACTIC DOM Global] DOM service is unavailable."
        );

        return;
    }

    const helperRegistry =
        new Map();

    const metrics = {
        loadedAt:
            Date.now(),

        helperRegistrations:
            0,

        helperReplacements:
            0,

        helperReads:
            0,

        lastHelperId:
            null,
    };

    function normalizeHelperId(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "DOM global-helper ID must be a non-empty string."
            );
        }

        const normalized =
            value
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9._:-]+$/
                .test(
                    normalized
                )
        ) {
            throw new TypeError(
                "DOM global-helper ID contains unsupported characters."
            );
        }

        return normalized;
    }

    function registerHelper(
        helperId,
        helper,
        options = {}
    ) {
        const id =
            normalizeHelperId(
                helperId
            );

        if (
            helper === null ||
            typeof helper !==
                "object"
        ) {
            throw new TypeError(
                `DOM global helper "${id}" must be an object.`
            );
        }

        const exists =
            helperRegistry.has(
                id
            );

        if (
            exists &&
            options.replace !==
                true
        ) {
            throw new Error(
                `DOM global helper "${id}" is already registered.`
            );
        }

        const storedHelper =
            Object.freeze(
                helper
            );

        helperRegistry.set(
            id,
            storedHelper
        );

        if (exists) {
            metrics
                .helperReplacements +=
                1;
        } else {
            metrics
                .helperRegistrations +=
                1;
        }

        metrics.lastHelperId =
            id;

        logger?.debug(
            `DOM global helper registered: ${id}`
        );

        return storedHelper;
    }

    function hasHelper(
        helperId
    ) {
        try {
            return helperRegistry.has(
                normalizeHelperId(
                    helperId
                )
            );
        } catch {
            return false;
        }
    }

    function getHelper(
        helperId
    ) {
        metrics.helperReads +=
            1;

        const id =
            normalizeHelperId(
                helperId
            );

        metrics.lastHelperId =
            id;

        return (
            helperRegistry.get(
                id
            ) ||
            null
        );
    }

    function listHelpers() {
        return [
            ...helperRegistry.keys(),
        ].sort();
    }

    function inspect() {
        return {
            subsystem:
                "dom-global",

            loadedAt:
                metrics.loadedAt,

            uptimeMs:
                Date.now() -
                metrics.loadedAt,

            helperCount:
                helperRegistry.size,

            helpers:
                listHelpers(),

            metrics: {
                ...metrics,
            },
        };
    }

    dom.global = {
        registerHelper,
        hasHelper,
        getHelper,
        listHelpers,
        inspect,
    };

    logger?.info(
        "DOM global-helper subsystem loaded"
    );
})();