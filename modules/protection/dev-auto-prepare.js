/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/dev-auto-prepare.js
 *
 * Purpose:
 * Automatically prepares and submits Protection deposits in the
 * development build.
 *
 * Responsibilities:
 * - Watch Protection evaluations
 * - Prepare eligible deposits
 * - Navigate through the normal Deposit service when required
 * - Verify the prepared page and submit control
 * - Click the verified Deposit button
 * - Prevent duplicate or concurrent submissions
 *
 * Safety:
 * - Development build only
 * - Protection must be enabled
 * - Destination must be explicitly allowlisted
 * - Deposit preparation must succeed first
 * - Submit control must be enabled and labeled DEPOSIT
 * - Confirmation controls are never clicked
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection Dev Auto Deposit] Namespace is unavailable."
        );

        return;
    }

    const isDevelopmentBuild =
        String(
            TACTIC.version ||
            ""
        )
            .toLowerCase()
            .includes(
                "dev"
            );

    if (!isDevelopmentBuild) {
        return;
    }

    if (
        typeof TACTIC.use !==
        "function"
    ) {
        console.error(
            "[TACTIC Protection Dev Auto Deposit] Dependency Registry is unavailable."
        );

        return;
    }

    let dependencies;

    try {
        dependencies =
            TACTIC.use({
                actions:
                    true,

                pageapi:
                    true,

                logger:
                    false,

                notifications:
                    false,
            });
    } catch (error) {
        console.error(
            "[TACTIC Protection Dev Auto Deposit] Required dependencies are unavailable.",
            error
        );

        return;
    }

    const {
        actions,

        pageapi:
            pageApi,

        logger,
        notifications,
    } = dependencies;

    if (
        !TACTIC.protection ||
        typeof TACTIC.protection.inspect !==
            "function"
    ) {
        console.error(
            "[TACTIC Protection Dev Auto Deposit] Protection module is unavailable."
        );

        return;
    }

    const CHECK_INTERVAL_MS =
        2_000;

    const DUPLICATE_COOLDOWN_MS =
        30_000;

    const POST_CLICK_COOLDOWN_MS =
        5_000;

    const ALLOWED_DESTINATIONS =
        Object.freeze(
            new Set([
                "faction-bank",
                "personal-vault",
            ])
        );

    let active =
        false;

    let running =
        false;

    let timerId =
        null;

    let lastAttemptKey =
        null;

    let lastAttemptAt =
        0;

    let lastSubmissionAt =
        0;

    const metrics = {
        loadedAt:
            Date.now(),

        startedAt:
            null,

        stoppedAt:
            null,

        checks:
            0,

        eligibleChecks:
            0,

        preparationAttempts:
            0,

        preparationPending:
            0,

        preparationsCompleted:
            0,

        submissionAttempts:
            0,

        submissionsCompleted:
            0,

        preparationFailures:
            0,

        submissionFailures:
            0,

        duplicateSkips:
            0,

        busySkips:
            0,

        cooldownSkips:
            0,

        destinationSkips:
            0,

        validationSkips:
            0,

        lastCheckedAt:
            null,

        lastAttemptAt:
            null,

        lastPreparedAt:
            null,

        lastSubmittedAt:
            null,

        lastDestination:
            null,

        lastAmount:
            null,

        lastPreparationResult:
            null,

        lastSubmissionResult:
            null,

        lastError:
            null,
    };

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

    function createAttemptKey(
        destination,
        amount
    ) {
        return `${destination}:${amount}`;
    }

    function normalizeAmount(
        value
    ) {
        const amount =
            Number(
                value
            );

        if (
            !Number.isSafeInteger(
                amount
            ) ||
            amount <= 0
        ) {
            return null;
        }

        return amount;
    }

    function getPreparedResult(
        executionResult
    ) {
        if (
            executionResult?.result &&
            typeof executionResult.result ===
                "object"
        ) {
            return executionResult.result;
        }

        if (
            executionResult?.output &&
            typeof executionResult.output ===
                "object"
        ) {
            return executionResult.output;
        }

        return executionResult;
    }

    function isVisible(
        element
    ) {
        if (
            !(element instanceof Element)
        ) {
            return false;
        }

        const style =
            globalThis.getComputedStyle(
                element
            );

        if (
            style.display ===
                "none" ||
            style.visibility ===
                "hidden" ||
            Number(
                style.opacity
            ) === 0
        ) {
            return false;
        }

        const rectangle =
            element.getBoundingClientRect();

        return (
            rectangle.width > 0 &&
            rectangle.height > 0
        );
    }

    function verifySubmitControl(
        control
    ) {
        if (
            !control ||
            !(
                control instanceof
                HTMLElement
            )
        ) {
            return {
                valid:
                    false,

                reason:
                    "submit-control-unavailable",
            };
        }

        if (!isVisible(control)) {
            return {
                valid:
                    false,

                reason:
                    "submit-control-not-visible",
            };
        }

        const disabled =
            control.matches(
                ":disabled"
            ) ||
            control.getAttribute(
                "aria-disabled"
            ) ===
                "true" ||
            control.classList.contains(
                "disabled"
            );

        if (disabled) {
            return {
                valid:
                    false,

                reason:
                    "submit-control-disabled",
            };
        }

        const label =
            String(
                control.value ||
                control.textContent ||
                control.getAttribute(
                    "aria-label"
                ) ||
                ""
            )
                .trim()
                .toUpperCase();

        if (label !== "DEPOSIT") {
            return {
                valid:
                    false,

                reason:
                    "unexpected-submit-label",

                label,
            };
        }

        return {
            valid:
                true,

            reason:
                "verified",

            label,
        };
    }

    async function submitPreparedDeposit({
        destination,
        amount,
    }) {
        const page =
            pageApi.current({
                capability:
                    "submit.locate",

                requireReady:
                    true,
            });

        if (!page) {
            return {
                success:
                    false,

                submitted:
                    false,

                reason:
                    "current-page-unavailable",
            };
        }

        if (
            page.id !==
            destination
        ) {
            return {
                success:
                    false,

                submitted:
                    false,

                reason:
                    "destination-page-mismatch",

                expectedPage:
                    destination,

                actualPage:
                    page.id,
            };
        }

        if (
            page.submit
                .locateSupported !==
            true
        ) {
            return {
                success:
                    false,

                submitted:
                    false,

                reason:
                    "submit-location-unsupported",
            };
        }

        const control =
            await page.submit.locate();

        const verification =
            verifySubmitControl(
                control
            );

        if (!verification.valid) {
            return {
                success:
                    false,

                submitted:
                    false,

                reason:
                    verification.reason,

                verification,
            };
        }

        metrics.submissionAttempts +=
            1;

        /*
         * This is the only automatic transaction action.
         * No confirmation control is searched for or clicked.
         */
        control.click();

        lastSubmissionAt =
            Date.now();

        metrics.submissionsCompleted +=
            1;

        metrics.lastSubmittedAt =
            lastSubmissionAt;

        return {
            success:
                true,

            submitted:
                true,

            confirmed:
                false,

            destination,

            amount,

            reason:
                "deposit-clicked",

            clickedAt:
                lastSubmissionAt,

            safety: {
                submitClicked:
                    true,

                confirmationClicked:
                    false,
            },
        };
    }

    async function check() {
        metrics.checks +=
            1;

        metrics.lastCheckedAt =
            Date.now();

        if (!active) {
            return null;
        }

        if (running) {
            metrics.busySkips +=
                1;

            return null;
        }

        if (
            Date.now() -
                lastSubmissionAt <
            POST_CLICK_COOLDOWN_MS
        ) {
            metrics.cooldownSkips +=
                1;

            return null;
        }

        const inspection =
            TACTIC.protection.inspect();

        const evaluation =
            inspection?.evaluation;

        const configuration =
            inspection?.configuration;

        if (
            configuration?.enabled !==
                true ||
            evaluation?.shouldDeposit !==
                true
        ) {
            return null;
        }

        const destination =
            String(
                evaluation.destination ||
                ""
            )
                .trim()
                .toLowerCase();

        const amount =
            normalizeAmount(
                evaluation.depositAmount
            );

        if (
            !ALLOWED_DESTINATIONS.has(
                destination
            )
        ) {
            metrics.destinationSkips +=
                1;

            return null;
        }

        if (!amount) {
            metrics.validationSkips +=
                1;

            return null;
        }

        metrics.eligibleChecks +=
            1;

        const attemptKey =
            createAttemptKey(
                destination,
                amount
            );

        if (
            attemptKey ===
                lastAttemptKey &&
            Date.now() -
                lastAttemptAt <
                DUPLICATE_COOLDOWN_MS
        ) {
            metrics.duplicateSkips +=
                1;

            return null;
        }

        running =
            true;

        lastAttemptKey =
            attemptKey;

        lastAttemptAt =
            Date.now();

        metrics.lastAttemptAt =
            lastAttemptAt;

        metrics.lastDestination =
            destination;

        metrics.lastAmount =
            amount;

        metrics.preparationAttempts +=
            1;

        try {
            const executionResult =
                await actions.execute(
                    "deposit.prepare",
                    {
                        destination,

                        amount,

                        notify:
                            false,

                        highlightSubmit:
                            true,
                    }
                );

            const preparationResult =
                getPreparedResult(
                    executionResult
                );

            metrics.lastPreparationResult =
                preparationResult;

            if (
                preparationResult
                    ?.pending ===
                    true ||
                preparationResult
                    ?.navigationStarted ===
                    true
            ) {
                metrics.preparationPending +=
                    1;

                /*
                 * Allow the resumed page preparation to be picked
                 * up quickly after navigation.
                 */
                lastAttemptKey =
                    null;

                return preparationResult;
            }

            if (
                preparationResult
                    ?.success !==
                    true ||
                preparationResult
                    ?.prepared !==
                    true ||
                preparationResult
                    ?.submitted ===
                    true
            ) {
                metrics.preparationFailures +=
                    1;

                return preparationResult;
            }

            metrics.preparationsCompleted +=
                1;

            metrics.lastPreparedAt =
                Date.now();

            const submissionResult =
                await submitPreparedDeposit({
                    destination,
                    amount,
                });

            metrics.lastSubmissionResult =
                submissionResult;

            if (
                submissionResult
                    .success !==
                    true ||
                submissionResult
                    .submitted !==
                    true
            ) {
                metrics.submissionFailures +=
                    1;

                return submissionResult;
            }

            notifications?.success(
                `${amount.toLocaleString()} deposited into ${destination}.`,
                {
                    title:
                        "Developer Auto Deposit",

                    group:
                        "protection-dev",
                }
            );

            return submissionResult;
        } catch (error) {
            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            metrics.submissionFailures +=
                1;

            logger?.error(
                "Development automatic deposit failed",
                {
                    destination,
                    amount,
                    error,
                }
            );

            return null;
        } finally {
            running =
                false;
        }
    }

    function start() {
        if (timerId !== null) {
            active =
                true;

            return false;
        }

        active =
            true;

        metrics.startedAt =
            Date.now();

        timerId =
            globalThis.setInterval(
                () => {
                    check().catch(
                        (error) => {
                            metrics.lastError =
                                createErrorSnapshot(
                                    error
                                );

                            logger?.error(
                                "Development auto-deposit check failed",
                                {
                                    error,
                                }
                            );
                        }
                    );
                },
                CHECK_INTERVAL_MS
            );

        check().catch(
            () => {}
        );

        return true;
    }

    function stop() {
        active =
            false;

        metrics.stoppedAt =
            Date.now();

        if (timerId === null) {
            return false;
        }

        globalThis.clearInterval(
            timerId
        );

        timerId =
            null;

        return true;
    }

    function inspect() {
        return {
            service:
                "protection-dev-auto-deposit",

            developmentBuild:
                true,

            active,

            running,

            allowedDestinations: [
                ...ALLOWED_DESTINATIONS,
            ],

            checkIntervalMs:
                CHECK_INTERVAL_MS,

            duplicateCooldownMs:
                DUPLICATE_COOLDOWN_MS,

            postClickCooldownMs:
                POST_CLICK_COOLDOWN_MS,

            safety: {
                developmentOnly:
                    true,

                protectionRequired:
                    true,

                verifiedDestinationsOnly:
                    true,

                exactSubmitLabelRequired:
                    true,

                automaticNavigation:
                    true,

                automaticFill:
                    true,

                automaticSubmission:
                    true,

                automaticConfirmation:
                    false,
            },

            metrics: {
                ...metrics,
            },
        };
    }

    const api =
        Object.freeze({
            start,
            stop,
            check,
            inspect,
        });

    TACTIC.protection.devAutoDeposit =
        api;

    /*
     * Retain the previous property name temporarily so existing
     * console commands do not break.
     */
    TACTIC.protection.devAutoPrepare =
        api;

    start();

    logger?.warn(
        "Protection development automatic deposits are enabled",
        {
            allowedDestinations: [
                ...ALLOWED_DESTINATIONS,
            ],

            automaticSubmission:
                true,

            automaticConfirmation:
                false,
        }
    );
})();