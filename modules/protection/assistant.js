/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/assistant.js
 *
 * Purpose:
 * Safely prepares Protection deposits by filling a verified
 * amount field while leaving submission entirely to the user.
 *
 * Responsibilities:
 * - Validate deposit plans
 * - Resolve destination-specific amount selectors
 * - Fill verified deposit fields
 * - Dispatch input and change events
 * - Highlight the submit control for user review
 * - Never submit or confirm a transaction
 * - Expose preparation diagnostics
 *
 * Does NOT:
 * - Click deposit buttons
 * - Click confirmation dialogs
 * - Submit forms
 * - Automatically finalize transactions
 * - Use unverified destination selectors
 *
 * Public API:
 * - TACTIC.protection.assistant.prepare()
 * - TACTIC.protection.assistant.canPrepare()
 * - TACTIC.protection.assistant.inspect()
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection Assistant] Namespace is unavailable."
        );

        return;
    }

    const {
        dom,
        logger,
        notifications,
    } = TACTIC.services;

    const registry =
        TACTIC.protection
            ?.destinationRegistry;

    if (
        !dom ||
        !registry
    ) {
        console.error(
            "[TACTIC Protection Assistant] Required dependencies are unavailable."
        );

        return;
    }

    const metrics = {
        loadedAt:
            Date.now(),

        preparationRequests:
            0,

        prepared:
            0,

        unsupportedDestinations:
            0,

        unavailableFields:
            0,

        validationFailures:
            0,

        lastPreparedAt:
            null,

        lastDestination:
            null,

        lastAmount:
            null,

        lastResult:
            null,
    };

    function createResult(
        values
    ) {
        const result = {
            success:
                false,

            prepared:
                false,

            submitted:
                false,

            destination:
                null,

            amount:
                null,

            reason:
                null,

            message:
                null,

            selector:
                null,

            timestamp:
                Date.now(),

            ...values,
        };

        metrics.lastResult = {
            ...result,
        };

        return result;
    }

    function normalizeAmount(
        amount
    ) {
        const numeric =
            Number(amount);

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric <= 0
        ) {
            return null;
        }

        return numeric;
    }

    function canPrepare(
        destinationId
    ) {
        const destination =
            registry.get(
                destinationId
            );

        return Boolean(
            destination &&
            destination.verified &&
            destination.fillSupported &&
            destination
                .amountSelectorPath
        );
    }

    function setNativeValue(
        input,
        value
    ) {
        const prototype =
            Object.getPrototypeOf(
                input
            );

        const descriptor =
            Object.getOwnPropertyDescriptor(
                prototype,
                "value"
            );

        if (
            descriptor?.set
        ) {
            descriptor.set.call(
                input,
                value
            );
        } else {
            input.value =
                value;
        }

        input.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles:
                        true,
                }
            )
        );

        input.dispatchEvent(
            new Event(
                "change",
                {
                    bubbles:
                        true,
                }
            )
        );
    }

    function highlightSubmit(
        destination
    ) {
        if (
            !destination
                .submitSelectorPath
        ) {
            return false;
        }

        const selector =
            dom.getSelector(
                destination
                    .submitSelectorPath
            );

        if (!selector) {
            return false;
        }

        const submitButton =
            dom.find(
                selector
            );

        if (!submitButton) {
            return false;
        }

        submitButton.style.outline =
            "3px solid #f5a623";

        submitButton.style.outlineOffset =
            "3px";

        submitButton.scrollIntoView({
            behavior:
                "smooth",

            block:
                "center",
        });

        return true;
    }

    async function prepare({
        destinationId,
        amount,
    }) {
        metrics.preparationRequests +=
            1;

        const destination =
            registry.get(
                destinationId
            );

        const normalizedAmount =
            normalizeAmount(
                amount
            );

        if (!destination) {
            metrics
                .validationFailures +=
                1;

            return createResult({
                destination:
                    destinationId,

                amount:
                    normalizedAmount,

                reason:
                    "unknown-destination",

                message:
                    "The selected deposit destination is unknown.",
            });
        }

        if (!normalizedAmount) {
            metrics
                .validationFailures +=
                1;

            return createResult({
                destination:
                    destination.id,

                amount:
                    null,

                reason:
                    "invalid-amount",

                message:
                    "The prepared deposit amount must be a positive whole number.",
            });
        }

        if (
            !canPrepare(
                destination.id
            )
        ) {
            metrics
                .unsupportedDestinations +=
                1;

            return createResult({
                destination:
                    destination.id,

                amount:
                    normalizedAmount,

                reason:
                    "destination-not-mapped",

                message:
                    `${destination.name} filling is not available until its page and amount field are verified.`,
            });
        }

        const selector =
            dom.getSelector(
                destination
                    .amountSelectorPath
            );

        if (!selector) {
            metrics.unavailableFields +=
                1;

            return createResult({
                destination:
                    destination.id,

                amount:
                    normalizedAmount,

                reason:
                    "selector-unavailable",

                message:
                    `The ${destination.name} amount selector is unavailable.`,
            });
        }

        const input =
            await dom.waitFor(
                selector,
                {
                    timeoutMs:
                        10_000,

                    rejectOnTimeout:
                        false,

                    visible:
                        true,
                }
            );

        if (!input) {
            metrics.unavailableFields +=
                1;

            return createResult({
                destination:
                    destination.id,

                amount:
                    normalizedAmount,

                selector,

                reason:
                    "amount-field-not-found",

                message:
                    `Open the ${destination.name} deposit page before preparing the amount.`,
            });
        }

        setNativeValue(
            input,
            String(
                normalizedAmount
            )
        );

        input.focus();

        input.select?.();

        const highlighted =
            highlightSubmit(
                destination
            );

        metrics.prepared +=
            1;

        metrics.lastPreparedAt =
            Date.now();

        metrics.lastDestination =
            destination.id;

        metrics.lastAmount =
            normalizedAmount;

        logger?.info(
            "Protection deposit amount prepared",
            {
                destination:
                    destination.id,

                amount:
                    normalizedAmount,

                submitted:
                    false,
            }
        );

        notifications?.success(
            `${destination.name} amount prepared. Review the amount and submit it manually.`,
            {
                title:
                    "Deposit Ready",

                group:
                    "protection",

                persistent:
                    true,
            }
        );

        return createResult({
            success:
                true,

            prepared:
                true,

            submitted:
                false,

            destination:
                destination.id,

            amount:
                normalizedAmount,

            selector,

            submitHighlighted:
                highlighted,

            reason:
                "prepared",

            message:
                "The amount was filled successfully. The user must submit the deposit manually.",
        });
    }

    function inspect() {
        return {
            service:
                "protection-assistant",

            metrics: {
                ...metrics,

                lastResult:
                    metrics.lastResult
                        ? {
                              ...metrics
                                  .lastResult,
                          }
                        : null,
            },

            destinations:
                registry.inspect(),
        };
    }

    TACTIC.protection.assistant =
        Object.freeze({
            prepare,
            canPrepare,
            inspect,
        });

    logger?.info(
        "Protection deposit assistant loaded"
    );
})();