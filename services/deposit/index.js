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
 * Provides reusable, capability-controlled deposit preparation,
 * including destination navigation and safe form filling.
 *
 * Responsibilities:
 * - Validate deposit preparation requests
 * - Navigate to verified deposit destinations when necessary
 * - Wait for destination pages and amount fields
 * - Fill verified deposit amount fields
 * - Dispatch input and change events
 * - Highlight submit controls for manual review
 * - Enforce the deposit.prepare capability
 *
 * Does NOT:
 * - Submit deposit forms
 * - Click deposit buttons
 * - Confirm dialogs
 * - Automatically finalize transactions
 * - Contain Protection business rules
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
        navigation,
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
        !navigation ||
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
        15_000;

    const PENDING_STORAGE_KEY =
        "deposit:pending-preparation";

    const HIGHLIGHT_ATTRIBUTE =
        "data-tactic-deposit-highlight";

    const metrics = {
        startedAt:
            Date.now(),

        preparationRequests:
            0,

        prepared:
            0,

        navigationRequests:
            0,

        navigationResumes:
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

            navigationStarted:
                false,

            pending:
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

    function getStorage() {
        return TACTIC.services
            .storage;
    }

    function savePendingPreparation(
        request
    ) {
        getStorage()?.set(
            PENDING_STORAGE_KEY,
            {
                destination:
                    request.destination,

                amount:
                    request.amount,

                notify:
                    request.notify !==
                    false,

                highlightSubmit:
                    request
                        .highlightSubmit !==
                    false,

                createdAt:
                    Date.now(),
            }
        );

        return true;
    }

    function getPendingPreparation() {
        const pending =
            getStorage()?.get(
                PENDING_STORAGE_KEY,
                null
            );

        return (
            pending &&
            typeof pending ===
                "object"
                ? pending
                : null
        );
    }

    function clearPendingPreparation() {
        getStorage()?.remove(
            PENDING_STORAGE_KEY
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

    function validateDestination(
        destinationId,
        amount
    ) {
        const destination =
            getDestination(
                destinationId
            );

        if (!destination) {
            return {
                valid:
                    false,

                result:
                    createResult({
                        destination:
                            destinationId ||
                            null,

                        amount,

                        reason:
                            "unknown-destination",

                        message:
                            "The selected deposit destination is unknown.",
                    }),
            };
        }

        if (
            !destination.verified ||
            !destination.fillSupported ||
            !destination
                .amountSelectorPath ||
            !destination.routeId
        ) {
            metrics
                .unsupportedDestinations +=
                1;

            return {
                valid:
                    false,

                result:
                    createResult({
                        destination:
                            destination.id,

                        destinationName:
                            destination.name,

                        amount,

                        reason:
                            "destination-not-mapped",

                        message:
                            `${destination.name} preparation is unavailable until its route and amount field are verified.`,
                    }),
            };
        }

        return {
            valid:
                true,

            destination,
        };
    }

    async function fillAmount({
        destination,
        amount,
        timeoutMs,
        highlightSubmitControl,
        notify,
    }) {
        const amountSelector =
            dom.getSelector?.(
                destination
                    .amountSelectorPath
            );

        if (!amountSelector) {
            metrics
                .unavailableSelectors +=
                1;

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

        const input =
            await dom.waitFor(
                amountSelector,
                {
                    timeoutMs,

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

                destinationName:
                    destination.name,

                amount,

                selector:
                    amountSelector,

                reason:
                    "amount-field-not-found",

                message:
                    `The ${destination.name} amount field could not be found.`,
            });
        }

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
            highlightSubmitControl &&
            highlightSubmit(
                destination
            );

        metrics.prepared +=
            1;

        metrics.lastPreparedAt =
            Date.now();

        clearPendingPreparation();

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

        if (notify) {
            notifications?.success(
                `${destination.name} amount prepared. Review the amount and submit it manually.`,
                {
                    title:
                        "Deposit Ready",

                    group:
                        "deposit",

                    persistent:
                        true,
                }
            );
        }

        recordActivity(
            "prepared",
            {
                submitHighlighted,
            }
        );

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

        if (!amount) {
            metrics.validationFailures +=
                1;

            return createResult({
                destination:
                    destinationId ||
                    null,

                amount:
                    null,

                reason:
                    "invalid-amount",

                message:
                    "The deposit amount must be a positive whole number.",
            });
        }

        const validation =
            validateDestination(
                destinationId,
                amount
            );

        if (!validation.valid) {
            return validation.result;
        }

        const destination =
            validation.destination;

        metrics.lastDestination =
            destination.id;

        metrics.lastAmount =
            amount;

        const timeoutMs =
            Number.isSafeInteger(
                request.timeoutMs
            ) &&
            request.timeoutMs > 0
                ? request.timeoutMs
                : DEFAULT_WAIT_TIMEOUT_MS;

        const alreadyCurrent =
            navigation.isCurrent(
                destination.routeId
            );

        if (!alreadyCurrent) {
            metrics.navigationRequests +=
                1;

            savePendingPreparation({
                destination:
                    destination.id,

                amount,

                notify:
                    request.notify !==
                    false,

                highlightSubmit:
                    request
                        .highlightSubmit !==
                    false,
            });

            const navigationResult =
                navigation.open(
                    destination.routeId
                );

            recordActivity(
                "navigation-started",
                {
                    destination:
                        destination.id,
                }
            );

            return createResult({
                success:
                    navigationResult
                        .success,

                prepared:
                    false,

                navigationStarted:
                    navigationResult
                        .navigationStarted,

                pending:
                    true,

                destination:
                    destination.id,

                destinationName:
                    destination.name,

                amount,

                reason:
                    "navigation-started",

                message:
                    `${destination.name} is opening. The amount will be prepared after the page loads.`,

                href:
                    navigationResult.href,
            });
        }

        return fillAmount({
            destination,
            amount,
            timeoutMs,

            highlightSubmitControl:
                request
                    .highlightSubmit !==
                false,

            notify:
                request.notify !==
                false,
        });
    }

    async function resumePending() {
        const pending =
            getPendingPreparation();

        if (!pending) {
            return null;
        }

        const destination =
            getDestination(
                pending.destination
            );

        if (
            !destination ||
            !destination.routeId ||
            !navigation.isCurrent(
                destination.routeId
            )
        ) {
            return null;
        }

        metrics.navigationResumes +=
            1;

        return fillAmount({
            destination,

            amount:
                normalizeAmount(
                    pending.amount
                ),

            timeoutMs:
                DEFAULT_WAIT_TIMEOUT_MS,

            highlightSubmitControl:
                pending
                    .highlightSubmit !==
                false,

            notify:
                pending.notify !==
                false,
        });
    }

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

            pending:
                cloneValue(
                    getPendingPreparation()
                ),

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
        };
    }

    TACTIC.services.deposit =
        Object.freeze({
            prepare,
            resumePending,

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

            navigationSupported:
                true,

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

    /*
     * After a full-page navigation, the userscript starts again.
     * Resume a pending preparation once the destination page has
     * rendered.
     */
    queueMicrotask(
        () => {
            resumePending().catch(
                (error) => {
                    logger?.error(
                        "Pending deposit preparation could not resume",
                        {
                            error,
                        }
                    );
                }
            );
        }
    );

    logger?.info(
        "Deposit service loaded"
    );
})();