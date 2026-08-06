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
 * Automatically prepares, submits, and confirms Protection
 * deposits for the authorized developer account when the
 * protection.autoDeposit developer feature is enabled.
 *
 * Safety:
 * - Development build only
 * - Authorized developer account only
 * - Developer Mode must be enabled
 * - Auto Deposit feature must be enabled
 * - Wallet Protection must be enabled
 * - Destination must be allowlisted
 * - Live wallet must cover the deposit
 * - Deposit preparation must succeed first
 * - Submit label must be approved
 * - Confirmation amount must exactly match
 * - Confirmation control must use the verified aria-label
 *
 * Public API:
 * - TACTIC.protection.devAutoDeposit
 * - TACTIC.protection.devAutoPrepare
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

    const developer =
        TACTIC.services.developer;

    const events =
        TACTIC.services.events;

    const AUTO_DEPOSIT_FEATURE_ID =
        "protection.autoDeposit";

    if (
        !developer ||
        typeof developer.isDeveloper !==
            "function" ||
        typeof developer.canUse !==
            "function"
    ) {
        console.error(
            "[TACTIC Protection Dev Auto Deposit] Developer service is unavailable."
        );

        return;
    }

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

    const POST_SUBMISSION_COOLDOWN_MS =
        5_000;

    const CONFIRMATION_TIMEOUT_MS =
        5_000;

    const CONFIRMATION_POLL_INTERVAL_MS =
        100;

    const CONFIRMATION_SETTLE_DELAY_MS =
        300;

    const ALLOWED_DESTINATIONS =
        Object.freeze(
            new Set([
                "faction-bank",
                "personal-vault",
            ])
        );

    const ALLOWED_SUBMIT_LABELS =
        Object.freeze(
            new Set([
                "DEPOSIT",
                "DEPOSIT MONEY",
            ])
        );

    const CONFIRMATION_SELECTOR =
        'a.yes[aria-label="Yes, I want to deposit"]';

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

    const removeDeveloperListeners =
        [];

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

        preparationFailures:
            0,

        submissionAttempts:
            0,

        submissionsTriggered:
            0,

        submissionFailures:
            0,

        confirmationAttempts:
            0,

        confirmationsCompleted:
            0,

        confirmationFailures:
            0,

        depositsCompleted:
            0,

        walletGuardSkips:
            0,

        amountClearAttempts:
            0,

        amountClearsCompleted:
            0,

        amountClearFailures:
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

        permissionSkips:
            0,

        activationChanges:
            0,

        lastCheckedAt:
            null,

        lastAttemptAt:
            null,

        lastPreparedAt:
            null,

        lastSubmittedAt:
            null,

        lastConfirmedAt:
            null,

        lastCompletedAt:
            null,

        lastDestination:
            null,

        lastAmount:
            null,

        lastWalletAmount:
            null,

        lastPreparationResult:
            null,

        lastSubmissionResult:
            null,

        lastConfirmationResult:
            null,

        lastClearResult:
            null,

        lastActivationReason:
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

        try {
            return JSON.parse(
                JSON.stringify(
                    value
                )
            );
        } catch {
            return value;
        }
    }

    function delay(
        milliseconds
    ) {
        return new Promise(
            resolve => {
                globalThis.setTimeout(
                    resolve,
                    milliseconds
                );
            }
        );
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

    function normalizeLabel(
        value
    ) {
        return String(
            value ||
            ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .toUpperCase();
    }

    function parseMoney(
        value
    ) {
        const match =
            String(
                value ||
                ""
            ).match(
                /\$([\d,]+)/
            );

        if (!match) {
            return null;
        }

        const amount =
            Number(
                match[1].replace(
                    /,/g,
                    ""
                )
            );

        return Number.isSafeInteger(
            amount
        )
            ? amount
            : null;
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
            ) ===
                0
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

    function canRunAutoDeposit() {
        return (
            developer.isDeveloper() ===
                true &&
            developer.canUse(
                AUTO_DEPOSIT_FEATURE_ID
            ) ===
                true
        );
    }

    function resolveClickableControl(
        originalControl
    ) {
        if (
            !originalControl ||
            !(
                originalControl instanceof
                HTMLElement
            )
        ) {
            return null;
        }

        if (
            originalControl.matches(
                "button, input[type='submit'], input[type='button'], a"
            )
        ) {
            return originalControl;
        }

        return originalControl.querySelector(
            "button, input[type='submit'], input[type='button'], a"
        );
    }

    function readControlLabel(
        control
    ) {
        if (
            control instanceof
            HTMLInputElement
        ) {
            return normalizeLabel(
                control.value
            );
        }

        return normalizeLabel(
            control.textContent ||
            control.getAttribute(
                "aria-label"
            ) ||
            control.getAttribute(
                "title"
            ) ||
            ""
        );
    }

    function verifySubmitControl(
        originalControl
    ) {
        const control =
            resolveClickableControl(
                originalControl
            );

        if (!control) {
            return {
                valid:
                    false,

                reason:
                    "submit-control-unavailable",

                control:
                    null,
            };
        }

        if (!control.isConnected) {
            return {
                valid:
                    false,

                reason:
                    "submit-control-disconnected",

                control,
            };
        }

        if (!isVisible(control)) {
            return {
                valid:
                    false,

                reason:
                    "submit-control-not-visible",

                control,
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

                control,
            };
        }

        const label =
            readControlLabel(
                control
            );

        if (
            !ALLOWED_SUBMIT_LABELS.has(
                label
            )
        ) {
            return {
                valid:
                    false,

                reason:
                    "unexpected-submit-label",

                label,

                allowedLabels: [
                    ...ALLOWED_SUBMIT_LABELS,
                ],

                control,
            };
        }

        return {
            valid:
                true,

            reason:
                "verified",

            label,

            control,
        };
    }

    function findConfirmationContext(
        confirmationControl
    ) {
        let current =
            confirmationControl;

        for (
            let depth = 0;
            depth < 10 &&
            current;
            depth += 1
        ) {
            const text =
                String(
                    current.textContent ||
                    ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            if (
                /are you sure you want to deposit\s+\$[\d,]+/i.test(
                    text
                )
            ) {
                return {
                    element:
                        current,

                    text,
                };
            }

            current =
                current.parentElement;
        }

        return {
            element:
                null,

            text:
                "",
        };
    }

    function verifyConfirmationControl(
        control,
        expectedAmount
    ) {
        if (
            !control ||
            !(
                control instanceof
                HTMLAnchorElement
            )
        ) {
            return {
                valid:
                    false,

                reason:
                    "confirmation-control-unavailable",
            };
        }

        if (!control.isConnected) {
            return {
                valid:
                    false,

                reason:
                    "confirmation-control-disconnected",
            };
        }

        if (!isVisible(control)) {
            return {
                valid:
                    false,

                reason:
                    "confirmation-control-not-visible",
            };
        }

        const ariaLabel =
            String(
                control.getAttribute(
                    "aria-label"
                ) ||
                ""
            )
                .trim()
                .toLowerCase();

        if (
            ariaLabel !==
            "yes, i want to deposit"
        ) {
            return {
                valid:
                    false,

                reason:
                    "unexpected-confirmation-aria-label",

                ariaLabel,
            };
        }

        const label =
            normalizeLabel(
                control.textContent
            );

        if (label !== "YES") {
            return {
                valid:
                    false,

                reason:
                    "unexpected-confirmation-label",

                label,
            };
        }

        const context =
            findConfirmationContext(
                control
            );

        if (!context.element) {
            return {
                valid:
                    false,

                reason:
                    "confirmation-dialog-unavailable",
            };
        }

        const confirmedAmount =
            parseMoney(
                context.text
            );

        if (
            confirmedAmount ===
            null
        ) {
            return {
                valid:
                    false,

                reason:
                    "confirmation-amount-unreadable",

                dialogText:
                    context.text,
            };
        }

        if (
            confirmedAmount !==
            expectedAmount
        ) {
            return {
                valid:
                    false,

                reason:
                    "confirmation-amount-mismatch",

                expectedAmount,

                confirmedAmount,

                dialogText:
                    context.text,
            };
        }

        return {
            valid:
                true,

            reason:
                "verified",

            label,

            ariaLabel,

            confirmedAmount,

            dialogText:
                context.text,

            dialogElement:
                context.element,

            control,
        };
    }

    async function confirmDeposit({
        destination,
        amount,
        timeoutMs =
            CONFIRMATION_TIMEOUT_MS,
    }) {
        metrics.confirmationAttempts +=
            1;

        const startedAt =
            Date.now();

        while (
            Date.now() -
                startedAt <
            timeoutMs
        ) {
            if (!canRunAutoDeposit()) {
                metrics.permissionSkips +=
                    1;

                return {
                    success:
                        false,

                    confirmed:
                        false,

                    destination,

                    amount,

                    reason:
                        "developer-auto-deposit-disabled",
                };
            }

            const control =
                document.querySelector(
                    CONFIRMATION_SELECTOR
                );

            if (control) {
                const verification =
                    verifyConfirmationControl(
                        control,
                        amount
                    );

                if (!verification.valid) {
                    metrics.confirmationFailures +=
                        1;

                    return {
                        success:
                            false,

                        confirmed:
                            false,

                        destination,

                        amount,

                        reason:
                            verification.reason,

                        verification: {
                            valid:
                                false,

                            reason:
                                verification.reason,

                            label:
                                verification.label ||
                                null,

                            ariaLabel:
                                verification.ariaLabel ||
                                null,

                            expectedAmount:
                                verification.expectedAmount ??
                                amount,

                            confirmedAmount:
                                verification.confirmedAmount ??
                                null,

                            dialogText:
                                verification.dialogText ||
                                null,
                        },
                    };
                }

                if (!canRunAutoDeposit()) {
                    metrics.permissionSkips +=
                        1;

                    return {
                        success:
                            false,

                        confirmed:
                            false,

                        destination,

                        amount,

                        reason:
                            "developer-auto-deposit-disabled",
                    };
                }

                const verifiedControl =
                    verification.control;

                verifiedControl.focus();

                HTMLElement.prototype.click.call(
                    verifiedControl
                );

                await delay(
                    CONFIRMATION_SETTLE_DELAY_MS
                );

                const stillPresent =
                    document.querySelector(
                        CONFIRMATION_SELECTOR
                    );

                if (
                    stillPresent &&
                    stillPresent.isConnected &&
                    isVisible(
                        stillPresent
                    )
                ) {
                    metrics.confirmationFailures +=
                        1;

                    return {
                        success:
                            false,

                        confirmed:
                            false,

                        destination,

                        amount,

                        reason:
                            "confirmation-remained-visible",

                        clicked:
                            true,

                        waitedMs:
                            Date.now() -
                            startedAt,
                    };
                }

                metrics.confirmationsCompleted +=
                    1;

                metrics.lastConfirmedAt =
                    Date.now();

                return {
                    success:
                        true,

                    confirmed:
                        true,

                    destination,

                    amount,

                    confirmedAmount:
                        verification.confirmedAmount,

                    reason:
                        "deposit-confirmation-clicked",

                    clicked:
                        true,

                    clickedAt:
                        metrics.lastConfirmedAt,

                    waitedMs:
                        Date.now() -
                        startedAt,
                };
            }

            await delay(
                CONFIRMATION_POLL_INTERVAL_MS
            );
        }

        metrics.confirmationFailures +=
            1;

        return {
            success:
                false,

            confirmed:
                false,

            destination,

            amount,

            reason:
                "confirmation-timeout",

            waitedMs:
                Date.now() -
                startedAt,
        };
    }

    async function clearPreparedAmount(
        page
    ) {
        metrics.amountClearAttempts +=
            1;

        if (
            !page?.amount ||
            page.amount.readSupported !==
                true
        ) {
            metrics.amountClearFailures +=
                1;

            return {
                success:
                    false,

                cleared:
                    false,

                reason:
                    "amount-control-unavailable",
            };
        }

        try {
            const readResult =
                await page.amount.read();

            const control =
                readResult instanceof
                    HTMLInputElement
                    ? readResult
                    : (
                          readResult?.control ||
                          readResult?.element ||
                          readResult?.input ||
                          null
                      );

            if (
                !(
                    control instanceof
                    HTMLInputElement
                )
            ) {
                metrics.amountClearFailures +=
                    1;

                return {
                    success:
                        false,

                    cleared:
                        false,

                    reason:
                        "amount-control-invalid",
                };
            }

            const valueSetter =
                Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value"
                )?.set;

            if (
                typeof valueSetter ===
                "function"
            ) {
                valueSetter.call(
                    control,
                    ""
                );
            } else {
                control.value =
                    "";
            }

            control.dispatchEvent(
                new Event(
                    "input",
                    {
                        bubbles:
                            true,
                    }
                )
            );

            control.dispatchEvent(
                new Event(
                    "change",
                    {
                        bubbles:
                            true,
                    }
                )
            );

            const cleared =
                control.value ===
                "";

            if (cleared) {
                metrics.amountClearsCompleted +=
                    1;
            } else {
                metrics.amountClearFailures +=
                    1;
            }

            return {
                success:
                    cleared,

                cleared,

                reason:
                    cleared
                        ? "amount-cleared"
                        : "amount-remained-populated",

                value:
                    control.value,
            };
        } catch (error) {
            metrics.amountClearFailures +=
                1;

            return {
                success:
                    false,

                cleared:
                    false,

                reason:
                    "amount-clear-failed",

                error:
                    createErrorSnapshot(
                        error
                    ),
            };
        }
    }

    async function submitPreparedDeposit({
        destination,
        amount,
    }) {
        if (!canRunAutoDeposit()) {
            metrics.permissionSkips +=
                1;

            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    "developer-auto-deposit-disabled",
            };
        }

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

                confirmed:
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

                confirmed:
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
                ?.locateSupported !==
            true
        ) {
            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    "submit-location-unsupported",
            };
        }

        const locatedControl =
            await page.submit.locate();

        const verification =
            verifySubmitControl(
                locatedControl
            );

        if (!verification.valid) {
            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    verification.reason,

                verification: {
                    valid:
                        false,

                    reason:
                        verification.reason,

                    label:
                        verification.label ||
                        null,

                    allowedLabels:
                        verification.allowedLabels ||
                        [
                            ...ALLOWED_SUBMIT_LABELS,
                        ],
                },
            };
        }

        if (!canRunAutoDeposit()) {
            metrics.permissionSkips +=
                1;

            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    "developer-auto-deposit-disabled",
            };
        }

        const verifiedControl =
            verification.control;

        metrics.submissionAttempts +=
            1;

        verifiedControl.focus();

        HTMLElement.prototype.click.call(
            verifiedControl
        );

        metrics.submissionsTriggered +=
            1;

        metrics.lastSubmittedAt =
            Date.now();

        const confirmationResult =
            await confirmDeposit({
                destination,
                amount,
            });

        metrics.lastConfirmationResult =
            cloneValue(
                confirmationResult
            );

        if (
            confirmationResult
                .success !==
                true ||
            confirmationResult
                .confirmed !==
                true
        ) {
            metrics.submissionFailures +=
                1;

            return {
                success:
                    false,

                submitted:
                    true,

                confirmed:
                    false,

                destination,

                amount,

                submitLabel:
                    verification.label,

                reason:
                    confirmationResult.reason,

                confirmationResult,

                safety: {
                    submitClicked:
                        true,

                    confirmationClicked:
                        confirmationResult
                            ?.clicked ===
                        true,
                },
            };
        }

        lastSubmissionAt =
            Date.now();

        metrics.lastCompletedAt =
            lastSubmissionAt;

        metrics.depositsCompleted +=
            1;

        const clearResult =
            await clearPreparedAmount(
                page
            );

        metrics.lastClearResult =
            cloneValue(
                clearResult
            );

        return {
            success:
                true,

            submitted:
                true,

            confirmed:
                true,

            destination,

            amount,

            submitLabel:
                verification.label,

            reason:
                "deposit-completed",

            completedAt:
                lastSubmissionAt,

            confirmationResult,

            clearResult,

            safety: {
                submitClicked:
                    true,

                confirmationClicked:
                    true,
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

        if (!canRunAutoDeposit()) {
            metrics.permissionSkips +=
                1;

            stop();

            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    "developer-auto-deposit-disabled",
            };
        }

        if (running) {
            metrics.busySkips +=
                1;

            return null;
        }

        if (
            Date.now() -
                lastSubmissionAt <
            POST_SUBMISSION_COOLDOWN_MS
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

        const walletAmount =
            Number(
                inspection?.wallet?.value
            );

        metrics.lastWalletAmount =
            Number.isSafeInteger(
                walletAmount
            )
                ? walletAmount
                : null;

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

        if (
            !Number.isSafeInteger(
                walletAmount
            ) ||
            walletAmount <= 0 ||
            walletAmount < amount
        ) {
            metrics.validationSkips +=
                1;

            metrics.walletGuardSkips +=
                1;

            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    "insufficient-current-wallet",

                walletAmount:
                    Number.isSafeInteger(
                        walletAmount
                    )
                        ? walletAmount
                        : null,

                requestedAmount:
                    amount,
            };
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
            if (!canRunAutoDeposit()) {
                metrics.permissionSkips +=
                    1;

                return {
                    success:
                        false,

                    submitted:
                        false,

                    confirmed:
                        false,

                    reason:
                        "developer-auto-deposit-disabled",
                };
            }

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
                cloneValue(
                    preparationResult
                );

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
                 * Allow the next check on the destination page
                 * to complete submission after navigation.
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

            if (!canRunAutoDeposit()) {
                metrics.permissionSkips +=
                    1;

                return {
                    success:
                        false,

                    submitted:
                        false,

                    confirmed:
                        false,

                    reason:
                        "developer-auto-deposit-disabled-after-prepare",
                };
            }

            const submissionResult =
                await submitPreparedDeposit({
                    destination,
                    amount,
                });

            metrics.lastSubmissionResult =
                cloneValue(
                    submissionResult
                );

            if (
                submissionResult
                    .success !==
                    true ||
                submissionResult
                    .submitted !==
                    true ||
                submissionResult
                    .confirmed !==
                    true
            ) {
                return submissionResult;
            }

            notifications?.success?.(
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

            return {
                success:
                    false,

                submitted:
                    false,

                confirmed:
                    false,

                reason:
                    "auto-deposit-threw",

                error:
                    createErrorSnapshot(
                        error
                    ),
            };
        } finally {
            running =
                false;
        }
    }

    function start() {
        if (!canRunAutoDeposit()) {
            active =
                false;

            return false;
        }

        if (timerId !== null) {
            active =
                true;

            return false;
        }

        active =
            true;

        metrics.startedAt =
            Date.now();

        metrics.stoppedAt =
            null;

        timerId =
            globalThis.setInterval(
                () => {
                    check().catch(
                        error => {
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
            error => {
                metrics.lastError =
                    createErrorSnapshot(
                        error
                    );
            }
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

    function synchronizeActivation(
        reason =
            "manual"
    ) {
        metrics.activationChanges +=
            1;

        metrics.lastActivationReason =
            reason;

        if (canRunAutoDeposit()) {
            const started =
                start();

            logger?.info?.(
                "Developer Auto Deposit enabled",
                {
                    reason,
                    started,
                    active,
                }
            );

            return {
                enabled:
                    true,

                active,

                started,

                reason,
            };
        }

        const stopped =
            stop();

        logger?.info?.(
            "Developer Auto Deposit disabled",
            {
                reason,
                stopped,
                active,
            }
        );

        return {
            enabled:
                false,

            active,

            stopped,

            reason,
        };
    }

    function resetDuplicateProtection() {
        lastAttemptKey =
            null;

        lastAttemptAt =
            0;

        lastSubmissionAt =
            0;

        return true;
    }

    function inspect() {
        return {
            service:
                "protection-dev-auto-deposit",

            developmentBuild:
                true,

            developer: {
                developerUserId:
                    developer.developerUserId,

                currentUserId:
                    developer.getIdentity?.()
                        ?.currentUserId ??
                    null,

                verified:
                    developer.isDeveloper(),

                masterEnabled:
                    developer.isEnabled?.() ??
                    false,

                featureId:
                    AUTO_DEPOSIT_FEATURE_ID,

                featureState:
                    developer.getFeatureState?.(
                        AUTO_DEPOSIT_FEATURE_ID
                    ) ||
                    null,

                usable:
                    canRunAutoDeposit(),
            },

            active,

            running,

            allowedDestinations: [
                ...ALLOWED_DESTINATIONS,
            ],

            allowedSubmitLabels: [
                ...ALLOWED_SUBMIT_LABELS,
            ],

            confirmationSelector:
                CONFIRMATION_SELECTOR,

            checkIntervalMs:
                CHECK_INTERVAL_MS,

            duplicateCooldownMs:
                DUPLICATE_COOLDOWN_MS,

            postSubmissionCooldownMs:
                POST_SUBMISSION_COOLDOWN_MS,

            confirmationTimeoutMs:
                CONFIRMATION_TIMEOUT_MS,

            safety: {
                developmentOnly:
                    true,

                developerIdentityRequired:
                    true,

                developerMasterModeRequired:
                    true,

                developerFeatureRequired:
                    true,

                protectionRequired:
                    true,

                verifiedDestinationsOnly:
                    true,

                approvedSubmitLabelRequired:
                    true,

                exactConfirmationAriaLabelRequired:
                    true,

                confirmationAmountMustMatch:
                    true,

                liveWalletMustCoverAmount:
                    true,

                clearsPreparedAmountAfterDeposit:
                    true,

                automaticNavigation:
                    true,

                automaticFill:
                    true,

                automaticSubmission:
                    true,

                automaticConfirmation:
                    true,
            },

            metrics: {
                ...metrics,

                lastPreparationResult:
                    cloneValue(
                        metrics
                            .lastPreparationResult
                    ),

                lastSubmissionResult:
                    cloneValue(
                        metrics
                            .lastSubmissionResult
                    ),

                lastConfirmationResult:
                    cloneValue(
                        metrics
                            .lastConfirmationResult
                    ),

                lastClearResult:
                    cloneValue(
                        metrics
                            .lastClearResult
                    ),

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

    const api =
        Object.freeze({
            start,
            stop,
            check,
            inspect,
            synchronizeActivation,
            resetDuplicateProtection,
        });

    TACTIC.protection.devAutoDeposit =
        api;

    /*
     * Compatibility alias retained for earlier developer builds.
     */
    TACTIC.protection.devAutoPrepare =
        api;

    if (
        events &&
        typeof events.on ===
            "function"
    ) {
        removeDeveloperListeners.push(
            events.on(
                "developer:feature-changed",
                ({
                    featureId,
                }) => {
                    if (
                        featureId !==
                        AUTO_DEPOSIT_FEATURE_ID
                    ) {
                        return;
                    }

                    synchronizeActivation(
                        "feature-changed"
                    );
                }
            )
        );

        removeDeveloperListeners.push(
            events.on(
                "developer:changed",
                () => {
                    synchronizeActivation(
                        "developer-master-changed"
                    );
                }
            )
        );

        removeDeveloperListeners.push(
            events.on(
                "developer:identity-changed",
                () => {
                    synchronizeActivation(
                        "developer-identity-changed"
                    );
                }
            )
        );
    }

    synchronizeActivation(
        "module-load"
    );

    logger?.info(
        "Protection development automatic deposit module loaded",
        {
            developerUserId:
                developer.developerUserId,

            currentUserId:
                developer.getIdentity?.()
                    ?.currentUserId ??
                null,

            featureId:
                AUTO_DEPOSIT_FEATURE_ID,

            enabled:
                canRunAutoDeposit(),

            allowedDestinations: [
                ...ALLOWED_DESTINATIONS,
            ],

            allowedSubmitLabels: [
                ...ALLOWED_SUBMIT_LABELS,
            ],

            automaticSubmission:
                true,

            automaticConfirmation:
                true,
        }
    );
})();