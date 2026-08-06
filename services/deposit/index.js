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
 * including destination navigation and safe page preparation.
 *
 * Responsibilities:
 * - Validate deposit preparation requests
 * - Enforce deposit preparation capabilities
 * - Resolve verified deposit destinations
 * - Navigate to deposit destinations when necessary
 * - Preserve pending preparation across navigation
 * - Resume pending preparation after startup or SPA navigation
 * - Resolve registered DOM page helpers
 * - Ask page helpers to fill and highlight deposit controls
 * - Notify the user when a deposit is ready for manual review
 * - Expose deposit diagnostics and Health information
 *
 * Does NOT:
 * - Query Torn deposit controls directly
 * - Contain Torn-specific selectors
 * - Set input values directly
 * - Click deposit buttons
 * - Submit deposit forms
 * - Confirm transactions
 * - Contain Protection business rules
 *
 * Public API:
 * - prepare()
 * - resumePending()
 * - canPrepare()
 * - getDestination()
 * - listDestinations()
 * - submit()
 * - confirm()
 * - inspect()
 *
 * Dependencies:
 * - core/dependencies.js
 * - services/capabilities/index.js
 * - services/deposit/destinations.js
 * - services/navigation/index.js
 * - services/dom/index.js
 * - services/dom/pages/index.js
 * - services/dom/pages/faction.js
 * - services/storage.js
 * - services/notifications/index.js
 * - core/logger.js
 * - core/errors.js
 * - core/health.js
 *
 * Safety boundary:
 * - Deposit preparation may navigate and fill a verified form.
 * - The final submit and confirmation remain user actions.
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

    if (
        typeof TACTIC.use !==
        "function"
    ) {
        console.error(
            "[TACTIC Deposit] Dependency Registry is unavailable."
        );

        return;
    }

    let requiredDependencies;
    let optionalDependencies;

    try {
        requiredDependencies =
            TACTIC.use([
                "capabilities",
                "depositdestinations",
                "navigation",
                "pageapi",
            ]);

        optionalDependencies =
            TACTIC.use({
                storage:
                    false,

                logger:
                    false,

                notifications:
                    false,

                errors:
                    false,

                health:
                    false,
            });
    } catch (error) {
        console.error(
            "[TACTIC Deposit] Required dependencies are unavailable.",
            error
        );

        return;
    }

    const {
        capabilities,
        depositdestinations,
        navigation,

        pageapi:
            pageApi,
    } = requiredDependencies;

    const depositDestinations =
        depositdestinations;

    const {
        storage,
        logger,
        notifications,
        errors,
        health,
    } = optionalDependencies;

    const {
        HEALTH_STATES,
    } = TACTIC.constants;

    if (
        typeof navigation.subscribe !==
            "function" ||
        !pageApi ||
        typeof pageApi.get !==
            "function" ||
        typeof pageApi.require !==
            "function" ||
        typeof pageApi.list !==
            "function"
    ) {
        console.error(
            "[TACTIC Deposit] Required dependency APIs are unavailable."
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

    const DEFAULT_HELPER_ID_BY_DESTINATION =
        Object.freeze({
            "faction-bank":
                "faction-bank",
        });

    const PENDING_STORAGE_KEY =
        "deposit:pending-preparation";

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

        navigationEventsHandled:
            0,

        resumeRequests:
            0,

        resumeSkippedInProgress:
            0,

        resumeWithoutPending:
            0,

        authorizationFailures:
            0,

        validationFailures:
            0,

        unsupportedDestinations:
            0,

        helperResolutions:
            0,

        helperResolutionFailures:
            0,

        helperWaits:
            0,

        helperWaitFailures:
            0,

        helperPreparationFailures:
            0,

        pendingPreparationsSaved:
            0,

        pendingPreparationsCleared:
            0,

        notificationsSent:
            0,

        lastActivityAt:
            Date.now(),

        lastPreparedAt:
            null,

        lastResumeAt:
            null,

        lastResumeReason:
            null,

        lastDestination:
            null,

        lastHelperId:
            null,

        lastAmount:
            null,

        lastResult:
            null,

        lastError:
            null,
    };

    let resumeInProgress =
        false;

    let navigationSubscriptionId =
        null;

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

    function createErrorSnapshot(
        error
    ) {
        if (!error) {
            return null;
        }

        return {
            name:
                error?.name ||
                "Error",

            message:
                error?.message ||
                String(error),

            timestamp:
                Date.now(),
        };
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

            helperId:
                null,

            amount:
                null,

            reason:
                null,

            message:
                null,

            submitHighlighted:
                false,

            helperResult:
                null,

            timestamp:
                Date.now(),

            safety: {
                submitClicked:
                    false,

                confirmationClicked:
                    false,

                userSubmissionRequired:
                    true,
            },

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

                    lastHelperId:
                        metrics
                            .lastHelperId,

                    lastAmount:
                        metrics.lastAmount,

                    preparationRequests:
                        metrics
                            .preparationRequests,

                    prepared:
                        metrics.prepared,

                    resumeInProgress,

                    navigationSubscriptionId,

                    pending:
                        Boolean(
                            getPendingPreparation()
                        ),

                    ...metadata,
                },
            }
        );
    }

    function normalizeAmount(
        amount
    ) {
        const numeric =
            Number(
                amount
            );

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

    function normalizeTimeout(
        timeoutMs
    ) {
        return (
            Number.isSafeInteger(
                timeoutMs
            ) &&
            timeoutMs > 0
                ? timeoutMs
                : DEFAULT_WAIT_TIMEOUT_MS
        );
    }

    function getStorage() {
        return (
            storage ||
            null
        );
    }

    function savePendingPreparation(
        request
    ) {
        const storageService =
            getStorage();

        if (
            !storageService ||
            typeof storageService.set !==
                "function"
        ) {
            return false;
        }

        storageService.set(
            PENDING_STORAGE_KEY,
            {
                destination:
                    request.destination,

                helperId:
                    request.helperId ||
                    null,

                amount:
                    request.amount,

                notify:
                    request.notify !==
                    false,

                highlightSubmit:
                    request
                        .highlightSubmit !==
                    false,

                timeoutMs:
                    normalizeTimeout(
                        request.timeoutMs
                    ),

                createdAt:
                    Date.now(),
            }
        );

        metrics
            .pendingPreparationsSaved +=
            1;

        return true;
    }

    function getPendingPreparation() {
        const storageService =
            getStorage();

        if (
            !storageService ||
            typeof storageService.get !==
                "function"
        ) {
            return null;
        }

        const pending =
            storageService.get(
                PENDING_STORAGE_KEY,
                null
            );

        return (
            pending &&
            typeof pending ===
                "object" &&
            !Array.isArray(
                pending
            )
                ? pending
                : null
        );
    }

    function clearPendingPreparation() {
        const storageService =
            getStorage();

        if (!storageService) {
            return false;
        }

        if (
            typeof storageService.remove ===
                "function"
        ) {
            storageService.remove(
                PENDING_STORAGE_KEY
            );

            metrics
                .pendingPreparationsCleared +=
                1;

            return true;
        }

        if (
            typeof storageService.delete ===
                "function"
        ) {
            storageService.delete(
                PENDING_STORAGE_KEY
            );

            metrics
                .pendingPreparationsCleared +=
                1;

            return true;
        }

        return false;
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

    function resolveHelperId(
        destination
    ) {
        if (!destination) {
            return null;
        }

        const configuredHelperId =
            destination.helperId ||
            destination.pageHelperId ||
            destination.domHelperId;

        if (
            typeof configuredHelperId ===
                "string" &&
            configuredHelperId.trim()
        ) {
            return configuredHelperId
                .trim()
                .toLowerCase();
        }

        return (
            DEFAULT_HELPER_ID_BY_DESTINATION[
                destination.id
            ] ||
            null
        );
    }

    function getPage(
        helperId
    ) {
        metrics.helperResolutions +=
            1;

        if (
            typeof helperId !==
                "string" ||
            !helperId.trim()
        ) {
            metrics
                .helperResolutionFailures +=
                1;

            return null;
        }

        const page =
            pageApi.get(
                helperId
            );

        if (!page) {
            metrics
                .helperResolutionFailures +=
                1;
        }

        return page;
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

        if (
            !destination ||
            !destination.verified ||
            !destination.fillSupported ||
            !destination.routeId
        ) {
            return false;
        }

        const helperId =
            resolveHelperId(
                destination
            );

        if (!helperId) {
            return false;
        }

        const page =
            pageApi.get(
                helperId
            );

        return Boolean(
            page &&
            page.deposit
                .prepareSupported ===
                true
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
                            `${destination.name} preparation is unavailable until its route and page integration are verified.`,
                    }),
            };
        }

        const helperId =
            resolveHelperId(
                destination
            );

        if (!helperId) {
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
                            "page-not-configured",

                        message:
                            `${destination.name} does not have a configured Page API entry.`,
                    }),
            };
        }

        const page =
            pageApi.get(
                helperId
            );

        if (!page) {
            metrics
                .helperResolutionFailures +=
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

                        helperId,

                        amount,

                        reason:
                            "page-unavailable",

                        message:
                            `The Page API entry for ${destination.name} is unavailable.`,
                    }),
            };
        }

        if (
            page.deposit
                .prepareSupported !==
            true
        ) {
            metrics
                .helperResolutionFailures +=
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

                        helperId,

                        amount,

                        reason:
                            "page-capability-unavailable",

                        message:
                            `The ${destination.name} page does not support deposit preparation.`,
                    }),
            };
        }

        return {
            valid:
                true,

            destination,

            helperId,

            page,
        };
    }

    async function waitForHelper(
        helper,
        helperId,
        timeoutMs
    ) {
        metrics.helperWaits +=
            1;

        if (
            typeof helper.waitUntilReady !==
                "function"
        ) {
            if (
                typeof helper.isReady ===
                    "function"
            ) {
                const readiness =
                    helper.isReady();

                return {
                    ...readiness,

                    waitedMs:
                        0,
                };
            }

            return {
                ready:
                    true,

                reason:
                    "helper-has-no-readiness-check",

                waitedMs:
                    0,
            };
        }

        try {
            return await helper.waitUntilReady({
                timeoutMs,

                rejectOnTimeout:
                    false,
            });
        } catch (error) {
            metrics.helperWaitFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.warn(
                "Deposit page helper readiness check failed",
                {
                    helperId,
                    timeoutMs,
                    error,
                }
            );

            return {
                ready:
                    false,

                reason:
                    "helper-wait-failed",

                waitedMs:
                    null,

                error:
                    createErrorSnapshot(
                        error
                    ),
            };
        }
    }

    function notifyPrepared(
        destination,
        amount
    ) {
        if (
            !notifications ||
            typeof notifications.success !==
                "function"
        ) {
            return false;
        }

        notifications.success(
            `${destination.name} amount prepared. Review the amount and submit it manually.`,
            {
                title:
                    "Deposit Ready",

                group:
                    "deposit",

                persistent:
                    true,

                metadata: {
                    destination:
                        destination.id,

                    amount,

                    submitted:
                        false,

                    confirmed:
                        false,
                },
            }
        );

        metrics.notificationsSent +=
            1;

        return true;
    }

    function reportHelperFailure({
        destination,
        helperId,
        amount,
        helperResult,
    }) {
        const message =
            helperResult?.error
                ?.message ||
            helperResult?.message ||
            `The ${destination.name} page helper could not prepare the deposit.`;

        const error =
            new Error(
                message
            );

        error.name =
            helperResult?.error
                ?.name ||
            "DepositPageHelperError";

        errors?.report({
            code:
                TACTIC.ERROR_CODES
                    ?.DOM
                    ?.OBSERVER_FAILED ||
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

            message:
                `Deposit preparation failed for ${destination.name}.`,

            details: {
                destination:
                    destination.id,

                helperId,

                amount,

                helperReason:
                    helperResult?.reason ||
                    null,

                helperResult:
                    cloneValue(
                        helperResult
                    ),
            },

            error,

            recoverable:
                true,

            retryable:
                true,

            recovery:
                "Verify the destination page is fully loaded and that its DOM page helper selectors remain valid.",
        });
    }

    async function prepareCurrentPage({
        destination,
        helperId,
        amount,
        timeoutMs,
        highlightSubmitControl,
        notify,
    }) {
        const helper =
            getHelper(
                helperId
            );

        if (!helper) {
            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                helperId,

                amount,

                reason:
                    "helper-unavailable",

                message:
                    `The ${destination.name} DOM page helper is unavailable.`,
            });
        }

        metrics.lastHelperId =
            helperId;

        const readiness =
            await waitForHelper(
                helper,
                helperId,
                timeoutMs
            );

        if (
            readiness?.ready !==
            true
        ) {
            metrics.helperWaitFailures +=
                1;

            recordActivity(
                "helper-not-ready",
                {
                    destination:
                        destination.id,

                    helperId,

                    readiness:
                        cloneValue(
                            readiness
                        ),
                }
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                helperId,

                amount,

                reason:
                    readiness?.reason ||
                    "page-not-ready",

                message:
                    `The ${destination.name} deposit controls did not become ready.`,

                helperResult: {
                    readiness:
                        cloneValue(
                            readiness
                        ),
                },
            });
        }

        if (
            !dom.pages.can(
                helper,
                PREPARE_CAPABILITY
            )
        ) {
            metrics
                .helperPreparationFailures +=
                1;

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                helperId,

                amount,

                reason:
                    "helper-capability-unavailable",

                message:
                    `The ${destination.name} helper does not support deposit preparation.`,
            });
        }

        let helperResult;

        try {
            helperResult =
                await dom.pages.invoke(
                    helper,
                    PREPARE_CAPABILITY,
                    amount,
                    {
                        highlightSubmit:
                            highlightSubmitControl,
                    }
                );
        } catch (error) {
            metrics
                .helperPreparationFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            reportHelperFailure({
                destination,
                helperId,
                amount,

                helperResult: {
                    reason:
                        "helper-threw",

                    error:
                        metrics.lastError,
                },
            });

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                helperId,

                amount,

                reason:
                    "helper-threw",

                message:
                    error?.message ||
                    `The ${destination.name} helper failed.`,

                helperResult: {
                    error:
                        createErrorSnapshot(
                            error
                        ),
                },
            });
        }

        if (
            !helperResult ||
            helperResult.success !==
                true ||
            helperResult.prepared !==
                true
        ) {
            metrics
                .helperPreparationFailures +=
                1;

            reportHelperFailure({
                destination,
                helperId,
                amount,
                helperResult,
            });

            recordActivity(
                "helper-preparation-failed",
                {
                    destination:
                        destination.id,

                    helperId,

                    reason:
                        helperResult
                            ?.reason ||
                        "unknown",
                }
            );

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                helperId,

                amount,

                reason:
                    helperResult?.reason ||
                    "helper-preparation-failed",

                message:
                    helperResult?.message ||
                    `The ${destination.name} helper could not prepare the deposit.`,

                helperResult:
                    cloneValue(
                        helperResult
                    ),
            });
        }

        const preparedAmount =
            normalizeAmount(
                helperResult.amount
            );

        if (
            preparedAmount !==
            amount
        ) {
            metrics
                .helperPreparationFailures +=
                1;

            return createResult({
                destination:
                    destination.id,

                destinationName:
                    destination.name,

                helperId,

                amount,

                reason:
                    "value-verification-failed",

                message:
                    "The page helper did not confirm the requested deposit amount.",

                helperResult:
                    cloneValue(
                        helperResult
                    ),
            });
        }

        metrics.prepared +=
            1;

        metrics.lastPreparedAt =
            Date.now();

        metrics.lastError =
            null;

        clearPendingPreparation();

        const submitHighlighted =
            helperResult
                .highlightResult
                ?.success ===
            true;

        logger?.info(
            "Deposit amount prepared",
            {
                destination:
                    destination.id,

                helperId,

                amount,

                submitted:
                    false,

                confirmed:
                    false,

                submitHighlighted,
            }
        );

        if (notify) {
            notifyPrepared(
                destination,
                amount
            );
        }

        recordActivity(
            "prepared",
            {
                destination:
                    destination.id,

                helperId,

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

            helperId,

            amount,

            submitHighlighted,

            reason:
                "prepared",

            message:
                "The amount was filled successfully. The user must submit the deposit manually.",

            helperResult:
                cloneValue(
                    helperResult
                ),

            safety: {
                submitClicked:
                    helperResult
                        .safety
                        ?.submitClicked ===
                    true,

                confirmationClicked:
                    helperResult
                        .safety
                        ?.confirmationClicked ===
                    true,

                userSubmissionRequired:
                    helperResult
                        .safety
                        ?.userSubmissionRequired !==
                    false,
            },
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

            metrics.lastError =
                createErrorSnapshot(
                    error
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

        const {
            destination,
            helperId,
        } = validation;

        metrics.lastDestination =
            destination.id;

        metrics.lastHelperId =
            helperId;

        metrics.lastAmount =
            amount;

        const timeoutMs =
            normalizeTimeout(
                request.timeoutMs
            );

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

                helperId,

                amount,

                timeoutMs,

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

                    helperId,

                    navigationStarted:
                        navigationResult
                            .navigationStarted,
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

                helperId,

                amount,

                reason:
                    "navigation-started",

                message:
                    `${destination.name} is opening. The amount will be prepared after the page loads.`,

                href:
                    navigationResult.href,
            });
        }

        return prepareCurrentPage({
            destination,
            helperId,
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

    async function resumePending(
        options = {}
    ) {
        metrics.resumeRequests +=
            1;

        if (resumeInProgress) {
            metrics
                .resumeSkippedInProgress +=
                1;

            return null;
        }

        resumeInProgress =
            true;

        metrics.lastResumeAt =
            Date.now();

        metrics.lastResumeReason =
            typeof options.reason ===
                "string" &&
            options.reason.trim()
                ? options.reason.trim()
                : "manual";

        try {
            const pending =
                getPendingPreparation();

            if (!pending) {
                metrics.resumeWithoutPending +=
                    1;

                return null;
            }

            const amount =
                normalizeAmount(
                    pending.amount
                );

            if (!amount) {
                clearPendingPreparation();

                metrics.validationFailures +=
                    1;

                return createResult({
                    destination:
                        pending.destination ||
                        null,

                    amount:
                        null,

                    reason:
                        "invalid-pending-amount",

                    message:
                        "The pending deposit amount is invalid and was cleared.",
                });
            }

            const validation =
                validateDestination(
                    pending.destination,
                    amount
                );

            if (!validation.valid) {
                return validation.result;
            }

            const {
                destination,
            } = validation;

            const helperId =
                pending.helperId ||
                validation.helperId;

            if (
                !navigation.isCurrent(
                    destination.routeId
                )
            ) {
                return null;
            }

            metrics.navigationResumes +=
                1;

            metrics.lastDestination =
                destination.id;

            metrics.lastHelperId =
                helperId;

            metrics.lastAmount =
                amount;

            recordActivity(
                "navigation-resume",
                {
                    destination:
                        destination.id,

                    helperId,

                    resumeReason:
                        metrics
                            .lastResumeReason,
                }
            );

            return await prepareCurrentPage({
                destination,
                helperId,
                amount,

                timeoutMs:
                    normalizeTimeout(
                        pending.timeoutMs
                    ),

                highlightSubmitControl:
                    pending
                        .highlightSubmit !==
                    false,

                notify:
                    pending.notify !==
                    false,
            });
        } finally {
            resumeInProgress =
                false;
        }
    }

    function handleNavigationEvent(
        navigationEvent
    ) {
        metrics.navigationEventsHandled +=
            1;

        resumePending({
            reason:
                navigationEvent?.reason ||
                "navigation-event",
        }).catch(
            (error) => {
                metrics.lastError =
                    createErrorSnapshot(
                        error
                    );

                logger?.error(
                    "Pending deposit preparation could not resume after navigation",
                    {
                        navigationEvent:
                            cloneValue(
                                navigationEvent
                            ),

                        error,
                    }
                );
            }
        );
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
        const pending =
            getPendingPreparation();

        return {
            service:
                "deposit",

            dependencySource:
                "TACTIC.use",

            dependencies: {
                capabilities:
                    Boolean(capabilities),

                depositDestinations:
                    Boolean(
                        depositDestinations
                    ),

                navigation:
                    Boolean(navigation),

                dom:
                    Boolean(dom),

                storage:
                    Boolean(storage),

                logger:
                    Boolean(logger),

                notifications:
                    Boolean(notifications),

                errors:
                    Boolean(errors),

                health:
                    Boolean(health),
            },

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            pending:
                cloneValue(
                    pending
                ),

            resume: {
                inProgress:
                    resumeInProgress,

                navigationSubscriptionId,

                subscribed:
                    Number.isSafeInteger(
                        navigationSubscriptionId
                    ),

                lastResumeAt:
                    metrics.lastResumeAt,

                lastResumeReason:
                    metrics
                        .lastResumeReason,
            },

            helperIntegration: {
                pageSubsystemAvailable:
                    Boolean(
                        dom.pages
                    ),

                frameworkAvailable:
                    typeof dom.pages.can ===
                        "function" &&
                    typeof dom.pages.invoke ===
                        "function",

                capability:
                    PREPARE_CAPABILITY,

                navigationSubscriptionId,

                registeredHelpers:
                    dom.pages
                        .listHelpers(),

                factionBankAvailable:
                    dom.pages
                        .hasHelper(
                            "faction-bank"
                        ),

                destinationMappings: {
                    ...DEFAULT_HELPER_ID_BY_DESTINATION,
                },
            },

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

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
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

            eventDrivenResume:
                true,

            pageHelperIntegration:
                true,

            preparationPublic:
                true,

            submissionImplemented:
                false,

            confirmationImplemented:
                false,

            requiresHeartbeat:
                false,

            dependencySource:
                "TACTIC.use",
        },
    });

    /*
     * The initial event replaces the old startup queueMicrotask.
     *
     * It attempts to resume a pending preparation after the
     * service has loaded, while later events handle Torn SPA
     * navigation without requiring a browser refresh.
     */
    navigationSubscriptionId =
        navigation.subscribe(
            handleNavigationEvent,
            {
                emitInitial:
                    true,

                metadata: {
                    service:
                        "deposit",

                    purpose:
                        "resume-pending-deposit",
                },
            }
        );

    logger?.info(
        "Deposit service loaded",
        {
            pageHelperIntegration:
                true,

            eventDrivenResume:
                true,

            navigationSubscriptionId,

            registeredHelpers:
                dom.pages
                    .listHelpers(),

            dependencySource:
                "TACTIC.use",
        }
    );
})();