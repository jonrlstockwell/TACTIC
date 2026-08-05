/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/deposit/index.js
 *
 * Purpose:
 * Provides reusable, capability-controlled deposit preparation
 * for TACTIC applications.
 *
 * Responsibilities:
 * - Validate deposit preparation requests
 * - Resolve destination-specific selectors
 * - Fill verified deposit amount fields
 * - Dispatch framework-compatible input events
 * - Highlight the submit control for manual user review
 * - Expose deposit diagnostics and Health information
 * - Enforce the deposit.prepare capability
 *
 * Does NOT:
 * - Submit deposit forms
 * - Click deposit buttons
 * - Confirm dialogs
 * - Automatically finalize transactions
 * - Contain Protection rules
 * - Use unverified destination selectors
 *
 * Public API:
 * - prepare()
 * - canPrepare()
 * - getDestination()
 * - listDestinations()
 * - inspect()
 *
 * Reserved future API:
 * - submit()  requires deposit.submit
 * - confirm() requires deposit.confirm
 *
 * Dependencies:
 * - services/capabilities/index.js
 * - services/deposit/destinations.js
 * - services/dom/index.js
 * - services/notifications/index.js
 * - core/logger.js
 * - core/errors.js
 * - core/health.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Deposit] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        capabilities,
        depositDestinations,
        dom,
        logger,
        notifications,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    if (
        !capabilities ||
        !depositDestinations ||
        !dom
    ) {
        console.error(
            "[TACTIC Deposit] Required dependencies are unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:deposit";

    const PREPARE_CAPABILITY =
        "deposit.prepare";

    const SUBMIT_CAPABILITY =
        "deposit.submit";

    const CONFIRM_CAPABILITY =
        "deposit.confirm";

    const DEFAULT_WAIT_TIMEOUT_MS =
        10_000;

    const HIGHLIGHT_ATTRIBUTE =
        "data-tactic-deposit-highlight";

    const metrics = {
        startedAt:
            Date.now(),

        preparationRequests:
            0,

        prepared:
            0,

        authorizationFailures:
            0,

        validationFailures:
            0,

        unsupportedDestinations:
            0,

        unavailableSelectors:
            0,

        unavailableFields:
            0,

        valueVerificationFailures:
            0,

        submitHighlights:
            0,

        lastActivityAt:
            Date.now(),

        lastPreparedAt:
            null,

        lastDestination:
            null,

        lastAmount:
            null,

        lastResult:
            null,
    };

    function cloneValue(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return value;
        }

        if (
            typeof structuredClone ===
            "function"
        ) {
            try {
                return structuredClone(
                    value
                );
            } catch {
                // Fall through.
            }
        }

        if (
            typeof value ===
                "object"
        ) {
            try {
                return JSON.parse(
                    JSON.stringify(
                        value
                    )
                );
            } catch {
                return {
                    ...value,
                };
            }
        }

        return value;
    }

    function createResult(
        values = {}
    ) {
        const result = {
            success:
                false,

            prepared:
                false,

            submitted:
                false,

            confirmed:
                false,

            destination:
                null,

            destinationName:
                null,

            amount:
                null,

            reason:
                null,

            message:
                null,

            selector:
                null,

            submitHighlighted:
                false,

            timestamp:
                Date.now(),

            ...values,
        };

        metrics.lastResult =
            cloneValue(
                result
            );

        return result;
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    lastDestination:
                        metrics
                            .lastDestination,

                    lastAmount:
                        metrics.lastAmount,

                    preparationRequests:
                        metrics
                            .preparationRequests,

                    prepared:
                        metrics.prepared,

                    ...metadata,
                },
            }
        );
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
            descriptor &&
            typeof descriptor.set ===
                "function"
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
            new InputEvent(
                "input",
                {
                    bubbles:
                        true,

                    inputType:
                        "insertText",

                    data:
                        value,
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

    function clearExistingHighlights() {
        const highlighted =
            document.querySelectorAll(
                `[${HIGHLIGHT_ATTRIBUTE}="true"]`
            );

        for (
            const element of
            highlighted
        ) {
            element.style.removeProperty(
                "outline"
            );

            element.style.removeProperty(
                "outline-offset"
            );

            element.removeAttribute(
                HIGHLIGHT_ATTRIBUTE
            );
        }

        return highlighted.length;
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
            dom.getSelector?.(
                destination
                    .submitSelectorPath
            );

        if (!selector) {
            return false;
        }

        const submitControl =
            dom.find(
                selector
            );

        if (!submitControl) {
            return false;
        }

        clearExistingHighlights();

        submitControl.setAttribute(
            HIGHLIGHT_ATTRIBUTE,
            "true"
        );

        submitControl.style.outline =
            "3px solid #f5a623";

        submitControl.style.outlineOffset =
            "3px";

        submitControl.scrollIntoView({
            behavior:
                "smooth",

            block:
                "center",

            inline:
                "nearest",
        });

        metrics.submitHighlights +=
            1;

        return true;
    }

    function getDestination(
        destinationId
    ) {
        return depositDestinations.get(
            destinationId
        );
    }

    function listDestinations(
        filters = {}
    ) {
        return depositDestinations.list(
            filters
        );
    }

    function canPrepare(
        destinationId
    ) {
        if (
            !capabilities.can(
                PREPARE_CAPABILITY
            )
        ) {
            return false;
        }

        const destination =
            getDestination(
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

    function reportFailure({
        message,
        details = {},
        error = null,
        recoverable = true,
        retryable = true,
        recovery = null,
    }) {
        errors?.report({
            code:
                TACTIC.ERROR_CODES
                    ?.GENERAL
                    ?.INTERNAL ||
                "INTERNAL",

            severity:
                TACTIC.SEVERITY
                    ?.WARNING ||
                "warning",

            service:
                "deposit",

            message,

            details,

            error,

            recoverable,

            retryable,

            recovery,
        });
    }

    async function prepare(
        request
    ) {
        metrics.preparationRequests +=
            1;

        if (
            !request ||
            typeof request !==
                "object" ||
            Array.isArray(
                request
            )
        ) {
            metrics.validationFailures +=
                1;

            return createResult({
                reason:
                    "invalid-request",

                message:
                    "Deposit preparation request must be an object.",
            });
        }

        const destinationId =
            request.destinationId ||
            request.destination;

        const amount =
            normalizeAmount(
                request.amount
            );

        try {
            capabilities.require(
                PREPARE_CAPABILITY,
                {
                    message:
                        "Deposit preparation is not authorized in this build.",
                }
            );
        } catch (error) {
            metrics.authorizationFailures +=
                1;

            recordActivity(
                "authorization-denied"
            );

            return createResult({
                destination:
                    destinationId ||
                    null,

                amount,

                reason:
                    "capability-denied",

                message:
                    error.message,
            });
        }

        const destination =
            getDestination(
                destinationId
            );

        if (!destination) {
            metrics.validationFailures +=
                1;

            recordActivity(
                "unknown-destination"
            );

            return createResult({
                destination:
                    destinationId ||
                    null,

                amount,

                reason:
                    "unknown-destination",

                message:
                    "The selected deposit destination is unknown.",
            });
        }

        metrics.lastDestination =
            destination.id;

        if (!amount) {
            metrics.validationFailures +=
                1;

            recordActivity(
                "invalid-amount"
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount:
                    null,

                reason:
                    "invalid-amount",

                message:
                    "The deposit amount must be a positive whole number.",
            });
        }

        metrics.lastAmount =
            amount;

        if (
            !destination.verified ||
            !destination.fillSupported ||
            !destination
                .amountSelectorPath
        ) {
            metrics
                .unsupportedDestinations +=
                1;

            recordActivity(
                "destination-not-supported"
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount,

                reason:
                    "destination-not-mapped",

                message:
                    `${destination.name} preparation is unavailable until its page and amount field are verified.`,
            });
        }

        const amountSelector =
            dom.getSelector?.(
                destination
                    .amountSelectorPath
            );

        if (!amountSelector) {
            metrics
                .unavailableSelectors +=
                1;

            recordActivity(
                "selector-unavailable"
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount,

                reason:
                    "selector-unavailable",

                message:
                    `The ${destination.name} amount selector is unavailable.`,
            });
        }

        const timeoutMs =
            Number.isSafeInteger(
                request.timeoutMs
            ) &&
            request.timeoutMs > 0
                ? request.timeoutMs
                : DEFAULT_WAIT_TIMEOUT_MS;

        const input =
            await dom.waitFor(
                amountSelector,
                {
                    timeoutMs,

                    rejectOnTimeout:
                        false,

                    visible:
                        request.visible !==
                        false,
                }
            );

        if (!input) {
            metrics.unavailableFields +=
                1;

            recordActivity(
                "amount-field-not-found"
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount,

                selector:
                    amountSelector,

                reason:
                    "amount-field-not-found",

                message:
                    `Open the ${destination.name} deposit page before preparing the amount.`,
            });
        }

        try {
            setNativeValue(
                input,
                String(amount)
            );

            const actualValue =
                normalizeAmount(
                    String(
                        input.value ||
                        ""
                    ).replace(
                        /[^0-9]/g,
                        ""
                    )
                );

            if (
                actualValue !==
                amount
            ) {
                metrics
                    .valueVerificationFailures +=
                    1;

                const verificationError =
                    new Error(
                        `Expected deposit value ${amount}, but the field contains ${String(input.value)}.`
                    );

                reportFailure({
                    message:
                        "Deposit amount could not be verified after filling the field.",

                    details: {
                        destination:
                            destination.id,

                        requestedAmount:
                            amount,

                        actualValue:
                            input.value,

                        selector:
                            amountSelector,
                    },

                    error:
                        verificationError,

                    recovery:
                        "Review the amount manually before submitting.",
                });

                recordActivity(
                    "value-verification-failed"
                );

                return createResult({
                    destination:
                        destination.id,

                    destinationName:
                        destination.name,

                    amount,

                    selector:
                        amountSelector,

                    reason:
                        "value-verification-failed",

                    message:
                        "The deposit field did not retain the requested amount.",
                });
            }

            input.focus();

            input.select?.();

            const submitHighlighted =
                request.highlightSubmit !==
                    false &&
                highlightSubmit(
                    destination
                );

            metrics.prepared +=
                1;

            metrics.lastPreparedAt =
                Date.now();

            recordActivity(
                "prepared",
                {
                    submitHighlighted,
                }
            );

            logger?.info(
                "Deposit amount prepared",
                {
                    destination:
                        destination.id,

                    amount,

                    submitted:
                        false,

                    confirmed:
                        false,
                }
            );

            if (
                request.notify !==
                false
            ) {
                notifications?.success(
                    `${destination.name} amount prepared. Review the amount and submit it manually.`,
                    {
                        title:
                            "Deposit Ready",

                        group:
                            "deposit",

                        persistent:
                            request
                                .persistentNotification !==
                            false,
                    }
                );
            }

            return createResult({
                success:
                    true,

                prepared:
                    true,

                submitted:
                    false,

                confirmed:
                    false,

                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount,

                selector:
                    amountSelector,

                submitHighlighted,

                reason:
                    "prepared",

                message:
                    "The amount was filled successfully. The user must submit the deposit manually.",
            });
        } catch (error) {
            reportFailure({
                message:
                    "Deposit preparation failed while updating the amount field.",

                details: {
                    destination:
                        destination.id,

                    amount,

                    selector:
                        amountSelector,
                },

                error,

                recovery:
                    "Enter the deposit amount manually and review it before submitting.",
            });

            recordActivity(
                "preparation-failed"
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount,

                selector:
                    amountSelector,

                reason:
                    "preparation-failed",

                message:
                    error.message,
            });
        }
    }

    /*
     * These reserved methods deliberately deny submission and
     * confirmation. They establish the permanent capability
     * boundary without implementing the restricted behavior.
     */
    async function submit() {
        capabilities.require(
            SUBMIT_CAPABILITY,
            {
                message:
                    "TACTIC deposit submission is unavailable. Submit the prepared deposit manually.",
            }
        );

        throw new Error(
            "Deposit submission has not been implemented."
        );
    }

    async function confirm() {
        capabilities.require(
            CONFIRM_CAPABILITY,
            {
                message:
                    "TACTIC deposit confirmation is unavailable. Confirm the deposit manually.",
            }
        );

        throw new Error(
            "Deposit confirmation has not been implemented."
        );
    }

    function inspect() {
        return {
            service:
                "deposit",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            capabilities: {
                prepare:
                    capabilities.explain(
                        PREPARE_CAPABILITY
                    ),

                submit:
                    capabilities.explain(
                        SUBMIT_CAPABILITY
                    ),

                confirm:
                    capabilities.explain(
                        CONFIRM_CAPABILITY
                    ),
            },

            destinations:
                depositDestinations
                    .inspect(),

            metrics: {
                ...metrics,

                lastResult:
                    metrics.lastResult
                        ? cloneValue(
                              metrics
                                  .lastResult
                          )
                        : null,
            },

            defaults: {
                waitTimeoutMs:
                    DEFAULT_WAIT_TIMEOUT_MS,
            },
        };
    }

    TACTIC.services.deposit =
        Object.freeze({
            prepare,
            canPrepare,

            getDestination,
            listDestinations,

            submit,
            confirm,

            inspect,

            destinationIds:
                depositDestinations
                    .ids,
        });

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            null,

        metadata: {
            serviceName:
                "deposit",

            preparationPublic:
                true,

            submissionImplemented:
                false,

            confirmationImplemented:
                false,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Deposit service loaded"
    );
})();