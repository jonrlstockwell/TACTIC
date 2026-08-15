/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/global/cayman.js
 *
 * Purpose:
 * Reads the globally available Cayman Islands offshore-bank
 * balance exposed through Torn's Cayman icon aria-label.
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Cayman] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (
        !dom ||
        !dom.global
    ) {
        console.error(
            "[TACTIC DOM Cayman] Global DOM subsystem is unavailable."
        );

        return;
    }

    const HELPER_ID =
        "cayman";

    const SELECTOR_KEY =
        "USER.CAYMAN";

    const metrics = {
        registeredAt:
            Date.now(),

        balanceReads:
            0,

        balanceReadSuccesses:
            0,

        balanceReadFailures:
            0,

        financialSnapshotReads:
            0,

        lastBalance:
            null,

        lastBalanceReadAt:
            null,

        lastRaw:
            null,

        lastError:
            null,
    };

    function normalizeText(
        value
    ) {
        return String(
            value ?? ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim();
    }

    function getSelector() {
        return dom.getSelector(
            SELECTOR_KEY
        );
    }

    function getBalanceElement() {
        const selector =
            getSelector();

        if (!selector) {
            return null;
        }

        return dom.find(
            selector
        );
    }

    function parseBalance(
        rawValue
    ) {
        const raw =
            normalizeText(
                rawValue
            );

        if (!raw) {
            return null;
        }

        /*
         * Expected:
         *
         * Offshore Bank Account: $39,314,631 stored in your
         * Cayman Islands account
         */
        const match =
            raw.match(
                /Offshore Bank Account:\s*\$([\d,]+)/i
            );

        if (!match) {
            return null;
        }

        const numeric =
            Number(
                match[1]
                    .replace(
                        /,/g,
                        ""
                    )
            );

        return Number.isSafeInteger(
            numeric
        ) &&
        numeric >= 0
            ? numeric
            : null;
    }

    function getBalance() {
        metrics.balanceReads +=
            1;

        metrics.lastBalanceReadAt =
            Date.now();

        const element =
            getBalanceElement();

        if (!element) {
            metrics.balanceReadFailures +=
                1;

            return {
                available:
                    false,

                verified:
                    false,

                value:
                    null,

                raw:
                    null,

                reason:
                    "cayman-element-not-found",

                readAt:
                    metrics.lastBalanceReadAt,
            };
        }

        const raw =
            normalizeText(
                element.getAttribute(
                    "aria-label"
                )
            );

        metrics.lastRaw =
            raw;

        const value =
            parseBalance(
                raw
            );

        if (
            !Number.isSafeInteger(
                value
            )
        ) {
            metrics.balanceReadFailures +=
                1;

            return {
                available:
                    false,

                verified:
                    false,

                value:
                    null,

                raw,

                reason:
                    "cayman-balance-invalid",

                readAt:
                    metrics.lastBalanceReadAt,
            };
        }

        metrics.balanceReadSuccesses +=
            1;

        metrics.lastBalance =
            value;

        metrics.lastError =
            null;

        return {
            available:
                true,

            verified:
                true,

            value,

            raw,

            source:
                "cayman-global-indicator",

            selector:
                getSelector(),

            readAt:
                metrics.lastBalanceReadAt,
        };
    }

    function getFinancialSnapshot() {
        metrics
            .financialSnapshotReads +=
            1;

        const balance =
            getBalance();

        return {
            id:
                "cayman",

            type:
                "cayman",

            name:
                "Cayman",

            ownership:
                "personal",

            balance,

            spendable:
                balance.available,

            immediatelyAvailable:
                false,

            liquidityClass:
                "travel-dependent",

            access: {
                canDeposit:
                    false,

                canSelfWithdraw:
                    true,

                requiresThirdParty:
                    false,

                requiresTravel:
                    true,

                timing:
                    "travel-required",
            },

            accessCost: {
                timeMinutes:
                    null,

                timeKnown:
                    false,

                risk:
                    "low",

                dependencies: [
                    "travel-to-cayman-islands",
                ],
            },

            funding: {
                usableForRecommendations:
                    balance.available,

                affordabilityClass:
                    balance.available
                        ? "affordable-after-travel"
                        : "unavailable",

                transferRequired:
                    true,

                travelRequired:
                    true,
            },

            state: {
                live:
                    balance.available,

                cached:
                    false,
            },

            verifiedAt:
                balance.verified
                    ? balance.readAt
                    : null,

            readAt:
                Date.now(),

            source:
                "cayman-global-dom-helper",
        };
    }

    function inspect() {
        const balance =
            getBalance();

        return {
            helperId:
                HELPER_ID,

            global:
                true,

            selector:
                getSelector(),

            elementFound:
                Boolean(
                    getBalanceElement()
                ),

            balance,

            financialSnapshot:
                getFinancialSnapshot(),

            metrics: {
                ...metrics,
            },
        };
    }

    const cayman =
        Object.freeze({
            id:
                HELPER_ID,

            name:
                "Cayman",

            description:
                "Reads the globally available Cayman Islands offshore-bank balance.",

            capabilities: {
                "finance.balance.read":
                    "getBalance",

                "finance.snapshot.read":
                    "getFinancialSnapshot",

                "global.inspect":
                    "inspect",
            },

            metadata: {
                category:
                    "finance",

                fundingSource:
                    true,

                liquidityClass:
                    "travel-dependent",

                global:
                    true,

                selectorsVerified:
                    true,
            },

            getBalanceElement,
            getBalance,
            getFinancialSnapshot,
            parseBalance,
            inspect,
        });

    dom.global.registerHelper(
        HELPER_ID,
        cayman,
        {
            replace:
                true,
        }
    );

    /*
     * Convenience alias.
     */
    dom.global.cayman =
        cayman;

    logger?.info(
        "Cayman global DOM helper loaded",
        {
            helperId:
                HELPER_ID,

            selectorKey:
                SELECTOR_KEY,

            global:
                true,
        }
    );
})();