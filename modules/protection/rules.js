/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/rules.js
 *
 * Purpose:
 * Provides pure Wallet Protection calculations and deposit-plan
 * evaluation.
 *
 * Responsibilities:
 * - Validate wallet and configuration values
 * - Calculate recommended deposit amounts
 * - Include the selected deposit destination
 * - Explain why a deposit is or is not needed
 *
 * Does NOT:
 * - Read or modify the DOM
 * - Navigate
 * - Fill or submit deposit forms
 * - Persist transaction state
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection Rules] Namespace is unavailable."
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

    const REASONS =
        Object.freeze({
            PROTECTION_DISABLED:
                "protection-disabled",

            WALLET_UNAVAILABLE:
                "wallet-unavailable",

            INVALID_WALLET:
                "invalid-wallet",

            AT_OR_BELOW_THRESHOLD:
                "at-or-below-threshold",

            NO_EXCESS_FUNDS:
                "no-excess-funds",

            DEPOSIT_READY:
                "deposit-ready",
        });

    const metrics = {
        loadedAt:
            Date.now(),

        calculations:
            0,

        evaluations:
            0,

        depositsRecommended:
            0,

        lastEvaluatedAt:
            null,

        lastWallet:
            null,

        lastDeposit:
            null,

        lastDestination:
            null,

        lastReason:
            null,
    };

    function normalizeInteger(
        value,
        fallback = 0
    ) {
        const numeric =
            Number(value);

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric < 0
        ) {
            return fallback;
        }

        return numeric;
    }

    function normalizeConfiguration(
        configuration = {}
    ) {
        return {
            enabled:
                configuration.enabled !==
                false,

            destination:
                String(
                    configuration.destination ||
                    "faction-bank"
                ),

            threshold:
                normalizeInteger(
                    configuration.threshold,
                    50_000
                ),

            reserve:
                normalizeInteger(
                    configuration.reserve,
                    50_000
                ),

            maximumAutomaticDeposit:
                Math.max(
                    1,
                    normalizeInteger(
                        configuration
                            .maximumAutomaticDeposit,
                        1_000_000_000
                    )
                ),
        };
    }

    function calculateDeposit(
        wallet,
        configuration = {}
    ) {
        metrics.calculations +=
            1;

        const numericWallet =
            Number(wallet);

        const normalized =
            normalizeConfiguration(
                configuration
            );

        if (
            !Number.isSafeInteger(
                numericWallet
            ) ||
            numericWallet < 0 ||
            numericWallet <=
                normalized.threshold
        ) {
            return 0;
        }

        const excess =
            Math.floor(
                numericWallet -
                normalized.reserve
            );

        if (excess <= 0) {
            return 0;
        }

        return Math.min(
            excess,
            normalized
                .maximumAutomaticDeposit
        );
    }

    function evaluate(
        walletRecord,
        configuration = {}
    ) {
        metrics.evaluations +=
            1;

        metrics.lastEvaluatedAt =
            Date.now();

        const normalized =
            normalizeConfiguration(
                configuration
            );

        const wallet =
            walletRecord &&
            typeof walletRecord ===
                "object"
                ? walletRecord
                : {
                      available:
                          false,

                      value:
                          null,

                      raw:
                          "",
                  };

        let reason =
            REASONS.DEPOSIT_READY;

        let depositAmount =
            0;

        if (!normalized.enabled) {
            reason =
                REASONS
                    .PROTECTION_DISABLED;
        } else if (
            wallet.available !==
            true
        ) {
            reason =
                REASONS
                    .WALLET_UNAVAILABLE;
        } else if (
            !Number.isSafeInteger(
                wallet.value
            ) ||
            wallet.value < 0
        ) {
            reason =
                REASONS
                    .INVALID_WALLET;
        } else if (
            wallet.value <=
            normalized.threshold
        ) {
            reason =
                REASONS
                    .AT_OR_BELOW_THRESHOLD;
        } else {
            depositAmount =
                calculateDeposit(
                    wallet.value,
                    normalized
                );

            if (depositAmount <= 0) {
                reason =
                    REASONS
                        .NO_EXCESS_FUNDS;
            }
        }

        const shouldDeposit =
            reason ===
                REASONS.DEPOSIT_READY &&
            depositAmount > 0;

        if (shouldDeposit) {
            metrics
                .depositsRecommended +=
                1;
        }

        metrics.lastWallet =
            Number.isSafeInteger(
                wallet.value
            )
                ? wallet.value
                : null;

        metrics.lastDeposit =
            depositAmount;

        metrics.lastDestination =
            normalized.destination;

        metrics.lastReason =
            reason;

        return {
            shouldDeposit,

            reason,

            destination:
                normalized.destination,

            wallet: {
                available:
                    wallet.available ===
                    true,

                value:
                    Number.isSafeInteger(
                        wallet.value
                    )
                        ? wallet.value
                        : null,

                raw:
                    String(
                        wallet.raw ||
                        ""
                    ),
            },

            configuration: {
                ...normalized,
            },

            depositAmount,

            remainingWallet:
                Number.isSafeInteger(
                    wallet.value
                )
                    ? Math.max(
                          0,
                          wallet.value -
                              depositAmount
                      )
                    : null,

            capped:
                shouldDeposit &&
                depositAmount ===
                    normalized
                        .maximumAutomaticDeposit,

            evaluatedAt:
                Date.now(),
        };
    }

    function inspect() {
        return {
            service:
                "protection-rules",

            reasons: {
                ...REASONS,
            },

            metrics: {
                ...metrics,
            },
        };
    }

    TACTIC.protection.rules =
        Object.freeze({
            calculateDeposit,
            evaluate,
            inspect,

            reasons:
                REASONS,
        });

    TACTIC.services.logger?.info(
        "Protection rules loaded"
    );
})();