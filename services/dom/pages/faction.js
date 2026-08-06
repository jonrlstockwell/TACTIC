/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/faction.js
 *
 * Purpose:
 * Registers page-specific DOM helpers for the faction armoury
 * cash interface, including personal faction balance reading
 * and safe deposit preparation.
 *
 * Responsibilities:
 * - Determine whether the faction cash interface is ready
 * - Locate verified faction cash and deposit elements
 * - Read the player's personal faction-held cash balance
 * - Describe faction funds as request-dependent liquidity
 * - Fill the deposit amount
 * - Dispatch input and change events
 * - Highlight the manual submit control
 * - Expose page-helper diagnostics
 *
 * Does NOT:
 * - Navigate to the faction page
 * - Click the deposit button
 * - Submit the deposit form
 * - Confirm a transaction
 * - Decide how much should be deposited
 *
 * Public API:
 * - TACTIC.services.dom.pages.getHelper("faction-bank")
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/dom/selectors.js
 * - services/dom/pages/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Faction Page] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (!dom) {
        console.error(
            "[TACTIC DOM Faction Page] DOM service is unavailable."
        );

        return;
    }

    if (!dom.pages) {
        console.error(
            "[TACTIC DOM Faction Page] DOM page subsystem is unavailable."
        );

        return;
    }

    if (
        typeof dom.getSelector !==
        "function"
    ) {
        console.error(
            "[TACTIC DOM Faction Page] DOM selector catalog is unavailable."
        );

        return;
    }

    const HELPER_ID =
        "faction-bank";

    const SELECTOR_KEYS =
        Object.freeze({
            ROOT:
                "FACTION.ARMOURY_DONATE_ROOT",

            CASH_SECTION:
                "FACTION.CASH_SECTION",

            FORM:
                "FACTION.CASH_FORM",

            AMOUNT:
                "FACTION.DEPOSIT_AMOUNT",

            SUBMIT:
                "FACTION.DEPOSIT_BUTTON",

            PRESETS:
                "FACTION.PRESET_AMOUNT_BUTTONS",
        });

    const metrics = {
        registeredAt:
            Date.now(),

        readinessChecks:
            0,

        readinessPasses:
            0,

        readinessFailures:
            0,

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

        amountSets:
            0,

        amountSetFailures:
            0,

        submitHighlights:
            0,

        submitHighlightFailures:
            0,

        preparations:
            0,

        preparationFailures:
            0,

        waits:
            0,

        waitTimeouts:
            0,

        lastAmount:
            null,

        lastOperation:
            null,

        lastActivityAt:
            Date.now(),

        lastError:
            null,
    };

    function createErrorSnapshot(
        error
    ) {
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

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastOperation =
            operation;

        metrics.lastActivityAt =
            Date.now();

        logger?.debug(
            `Faction Bank DOM helper: ${operation}`,
            metadata
        );
    }

    function getSelector(
        selectorKey
    ) {
        return dom.getSelector(
            selectorKey
        );
    }

    function findByKey(
        selectorKey,
        options = {}
    ) {
        const selector =
            getSelector(
                selectorKey
            );

        if (!selector) {
            return null;
        }

        return dom.find(
            selector,
            options
        );
    }

    function findAllByKey(
        selectorKey,
        options = {}
    ) {
        const selector =
            getSelector(
                selectorKey
            );

        if (!selector) {
            return [];
        }

        return dom.findAll(
            selector,
            options
        );
    }

    function normalizeAmount(
        value
    ) {
        const numeric =
            Number(
                value
            );

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric <= 0
        ) {
            throw new TypeError(
                "Faction deposit amount must be a positive whole number."
            );
        }

        return numeric;
    }

    function dispatchInputEvents(
        element
    ) {
        element.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles:
                        true,
                }
            )
        );

        element.dispatchEvent(
            new Event(
                "change",
                {
                    bubbles:
                        true,
                }
            )
        );
    }

    function getRoot() {
        return findByKey(
            SELECTOR_KEYS.ROOT
        );
    }

    function getCashSection() {
        return findByKey(
            SELECTOR_KEYS
                .CASH_SECTION
        );
    }

    function getForm() {
        return findByKey(
            SELECTOR_KEYS.FORM
        );
    }

    function getAmountInput() {
        return findByKey(
            SELECTOR_KEYS.AMOUNT
        );
    }

    function getSubmitButton() {
        return findByKey(
            SELECTOR_KEYS.SUBMIT
        );
    }

    function getPresetButtons() {
        return findAllByKey(
            SELECTOR_KEYS.PRESETS
        );
    }

    function normalizeText(
        value
    ) {
        return String(
            value ?? ""
        )
            .replace(/\s+/g, " ")
            .trim();
    }

    function parseMoney(
        value
    ) {
        const normalized =
            normalizeText(value);

        const numeric =
            Number(
                normalized.replace(
                    /[^0-9.-]/g,
                    ""
                )
            );

        return Number.isSafeInteger(
            numeric
        )
            ? numeric
            : null;
    }

    function parsePersonalBalanceText(
        text
    ) {
        const match =
            normalizeText(text).match(
                /\bbalance\s+of\s+\$([\d,]+)/i
            );

        if (!match) {
            return null;
        }

        return parseMoney(
            match[1]
        );
    }

    function getPersonalBalance() {
        metrics.balanceReads++;

        metrics.lastBalanceReadAt =
            Date.now();

        const cashSection =
            getCashSection();

        if (!cashSection) {
            metrics.balanceReadFailures++;

            return {
                available: false,
                verified: false,
                value: null,
                reason:
                    "cash-section-not-found",
            };
        }

        const raw =
            normalizeText(
                cashSection.textContent
            );

        const value =
            parsePersonalBalanceText(
                raw
            );

        if (
            !Number.isSafeInteger(
                value
            )
        ) {
            metrics.balanceReadFailures++;

            return {
                available: false,
                verified: false,
                value: null,
                raw,
                reason:
                    "balance-not-found",
            };
        }

        metrics.balanceReadSuccesses++;

        metrics.lastBalance =
            value;

        return {
            available: true,
            verified: true,
            value,
            raw,
            source:
                "faction-cash-section",
            readAt:
                metrics.lastBalanceReadAt,
        };
    }

    function getFinancialSnapshot() {

        metrics.financialSnapshotReads++;

        const balance =
            getPersonalBalance();

        return {

            id:
                "faction-vault",

            type:
                "faction-vault",

            ownership:
                "personal",

            balance,

            spendable:
                balance.available,

            immediatelyAvailable:
                false,

            liquidityClass:
                "request-dependent",

            access: {

                canDeposit:
                    true,

                canSelfWithdraw:
                    false,

                canRequestWithdrawal:
                    true,

                requiresFactionBanker:
                    true,

                timing:
                    "variable",
            },

            state: {

                live:
                    balance.available,

                cached:
                    false,
            },

            verifiedAt:
                balance.readAt,

            source:
                "faction-bank-dom-helper",
        };
    }

    function isReady() {
        metrics.readinessChecks +=
            1;

        const checks = {
            root:
                Boolean(
                    getRoot()
                ),

            amountInput:
                Boolean(
                    getAmountInput()
                ),

            submitButton:
                Boolean(
                    getSubmitButton()
                ),
        };

        const ready =
            checks.root &&
            checks.amountInput &&
            checks.submitButton;

        if (ready) {
            metrics.readinessPasses +=
                1;
        } else {
            metrics.readinessFailures +=
                1;
        }

        recordActivity(
            "readiness-check",
            {
                ready,
                checks,
            }
        );

        return {
            ready,

            reason:
                ready
                    ? "ready"
                    : "required-element-missing",

            checks,

            checkedAt:
                Date.now(),
        };
    }

    async function waitUntilReady(
        options = {}
    ) {
        metrics.waits +=
            1;

        const timeoutMs =
            Number.isFinite(
                options.timeoutMs
            ) &&
            options.timeoutMs >= 0
                ? Math.floor(
                      options.timeoutMs
                  )
                : 15_000;

        const pollIntervalMs =
            Number.isFinite(
                options.pollIntervalMs
            ) &&
            options.pollIntervalMs > 0
                ? Math.floor(
                      options.pollIntervalMs
                  )
                : 100;

        const startedAt =
            Date.now();

        while (
            Date.now() -
                startedAt <
            timeoutMs
        ) {
            const readiness =
                isReady();

            if (
                readiness.ready
            ) {
                return {
                    ...readiness,

                    waitedMs:
                        Date.now() -
                        startedAt,
                };
            }

            await new Promise(
                (resolve) => {
                    setTimeout(
                        resolve,
                        pollIntervalMs
                    );
                }
            );
        }

        metrics.waitTimeouts +=
            1;

        const finalReadiness =
            isReady();

        const result = {
            ...finalReadiness,

            ready:
                false,

            reason:
                "timeout",

            waitedMs:
                Date.now() -
                startedAt,
        };

        recordActivity(
            "wait-timeout",
            {
                timeoutMs,
            }
        );

        if (
            options.rejectOnTimeout ===
            true
        ) {
            const error =
                new Error(
                    "Timed out waiting for the faction deposit controls."
                );

            error.name =
                "FactionBankPageTimeoutError";

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }

        return result;
    }

    function setAmount(
        amount
    ) {
        const normalizedAmount =
            normalizeAmount(
                amount
            );

        const input =
            getAmountInput();

        if (!input) {
            metrics.amountSetFailures +=
                1;

            recordActivity(
                "set-amount-failed",
                {
                    amount:
                        normalizedAmount,

                    reason:
                        "amount-input-not-found",
                }
            );

            return {
                success:
                    false,

                reason:
                    "amount-input-not-found",

                amount:
                    normalizedAmount,
            };
        }

        input.focus();

        /*
         * Use the native input-value setter when available.
         * This helps controlled interfaces detect the update.
         */
        const valueSetter =
            Object.getOwnPropertyDescriptor(
                HTMLInputElement
                    .prototype,
                "value"
            )?.set;

        if (valueSetter) {
            valueSetter.call(
                input,
                String(
                    normalizedAmount
                )
            );
        } else {
            input.value =
                String(
                    normalizedAmount
                );
        }

        dispatchInputEvents(
            input
        );

        metrics.amountSets +=
            1;

        metrics.lastAmount =
            normalizedAmount;

        metrics.lastError =
            null;

        recordActivity(
            "set-amount",
            {
                amount:
                    normalizedAmount,
            }
        );

        return {
            success:
                true,

            amount:
                normalizedAmount,

            rawValue:
                input.value,

            selector:
                getSelector(
                    SELECTOR_KEYS.AMOUNT
                ),
        };
    }

    function highlightSubmit(
        options = {}
    ) {
        const button =
            getSubmitButton();

        if (!button) {
            metrics
                .submitHighlightFailures +=
                1;

            recordActivity(
                "highlight-submit-failed",
                {
                    reason:
                        "submit-button-not-found",
                }
            );

            return {
                success:
                    false,

                reason:
                    "submit-button-not-found",
            };
        }

        const durationMs =
            Number.isFinite(
                options.durationMs
            ) &&
            options.durationMs > 0
                ? Math.floor(
                      options.durationMs
                  )
                : 10_000;

        const previousOutline =
            button.style.outline;

        const previousOffset =
            button.style
                .outlineOffset;

        button.style.outline =
            "3px solid #f5a623";

        button.style.outlineOffset =
            "2px";

        setTimeout(
            () => {
                button.style.outline =
                    previousOutline;

                button.style
                    .outlineOffset =
                    previousOffset;
            },
            durationMs
        );

        metrics.submitHighlights +=
            1;

        metrics.lastError =
            null;

        recordActivity(
            "highlight-submit",
            {
                durationMs,
            }
        );

        return {
            success:
                true,

            durationMs,

            selector:
                getSelector(
                    SELECTOR_KEYS.SUBMIT
                ),
        };
    }

    function prepareDeposit(
        amount,
        options = {}
    ) {
        metrics.preparations +=
            1;

        const readiness =
            isReady();

        if (!readiness.ready) {
            metrics.preparationFailures +=
                1;

            recordActivity(
                "prepare-deposit-failed",
                {
                    reason:
                        "page-not-ready",
                }
            );

            return {
                success:
                    false,

                prepared:
                    false,

                submitted:
                    false,

                reason:
                    "page-not-ready",

                readiness,

                safety: {
                    submitClicked:
                        false,

                    confirmationClicked:
                        false,

                    userSubmissionRequired:
                        true,
                },
            };
        }

        let amountResult;

        try {
            amountResult =
                setAmount(
                    amount
                );
        } catch (error) {
            metrics.preparationFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            recordActivity(
                "prepare-deposit-failed",
                {
                    reason:
                        "invalid-amount",

                    error:
                        metrics.lastError,
                }
            );

            return {
                success:
                    false,

                prepared:
                    false,

                submitted:
                    false,

                reason:
                    "invalid-amount",

                error: {
                    ...metrics.lastError,
                },

                safety: {
                    submitClicked:
                        false,

                    confirmationClicked:
                        false,

                    userSubmissionRequired:
                        true,
                },
            };
        }

        if (
            !amountResult.success
        ) {
            metrics.preparationFailures +=
                1;

            recordActivity(
                "prepare-deposit-failed",
                {
                    reason:
                        amountResult
                            .reason,
                }
            );

            return {
                success:
                    false,

                prepared:
                    false,

                submitted:
                    false,

                reason:
                    amountResult
                        .reason,

                amountResult,

                safety: {
                    submitClicked:
                        false,

                    confirmationClicked:
                        false,

                    userSubmissionRequired:
                        true,
                },
            };
        }

        const highlightResult =
            options
                .highlightSubmit ===
            false
                ? {
                      success:
                          false,

                      skipped:
                          true,

                      reason:
                          "highlight-disabled",
                  }
                : highlightSubmit(
                      options
                  );

        metrics.lastError =
            null;

        recordActivity(
            "prepare-deposit",
            {
                amount:
                    amountResult
                        .amount,

                highlighted:
                    highlightResult
                        .success ===
                    true,
            }
        );

        return {
            success:
                true,

            prepared:
                true,

            submitted:
                false,

            amount:
                amountResult
                    .amount,

            amountResult,

            highlightResult,

            safety: {
                submitClicked:
                    false,

                confirmationClicked:
                    false,

                userSubmissionRequired:
                    true,
            },
        };
    }

    function inspect() {
        const readiness =
            isReady();

        return {
            helperId:
                HELPER_ID,

            page:
                dom.pages.detect(),

            ready:
                readiness.ready,

            readiness,

            financialSnapshot:
                getFinancialSnapshot(),

            elements: {
                root:
                    Boolean(
                        getRoot()
                    ),

                cashSection:
                    Boolean(
                        getCashSection()
                    ),

                form:
                    Boolean(
                        getForm()
                    ),

                amountInput:
                    Boolean(
                        getAmountInput()
                    ),

                submitButton:
                    Boolean(
                        getSubmitButton()
                    ),

                presetButtons:
                    getPresetButtons()
                        .length,
            },

            selectors: {
                root:
                    getSelector(
                        SELECTOR_KEYS.ROOT
                    ),

                cashSection:
                    getSelector(
                        SELECTOR_KEYS
                            .CASH_SECTION
                    ),

                form:
                    getSelector(
                        SELECTOR_KEYS.FORM
                    ),

                amount:
                    getSelector(
                        SELECTOR_KEYS.AMOUNT
                    ),

                submit:
                    getSelector(
                        SELECTOR_KEYS.SUBMIT
                    ),

                presets:
                    getSelector(
                        SELECTOR_KEYS.PRESETS
                    ),
            },

            safety: {
                canFillAmount:
                    true,

                canHighlightSubmit:
                    true,

                submitsForm:
                    false,

                confirmsTransaction:
                    false,

                userSubmissionRequired:
                    true,
            },

            metrics: {
                ...metrics,

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

    const factionBank =
        Object.freeze({
            id:
                HELPER_ID,

            name:
                "Faction Bank",

            description:
                "Prepares a cash deposit into the Faction Bank for manual submission.",

            pageId:
                "faction",

            routeId:
                "deposit:faction-bank",

            capabilities: {
                "page.ready":
                    "isReady",

                "page.wait-until-ready":
                    "waitUntilReady",

                "page.inspect":
                    "inspect",

                "finance.balance.read":
                    "getPersonalBalance",

                "finance.snapshot.read":
                    "getFinancialSnapshot",

                "amount.read":
                    "getAmountInput",

                "amount.set":
                    "setAmount",

                "submit.locate":
                    "getSubmitButton",

                "submit.highlight":
                    "highlightSubmit",

                "deposit.prepare":
                    "prepareDeposit",

                "deposit.submit":
                    false,

                "transaction.confirm":
                    false,
            },

            metadata: {
                category:
                    "deposit",

                destination:
                    "faction-bank",

                selectorsVerified:
                    true,

                manualSubmissionRequired:
                    true,

                automaticSubmission:
                    false,

                automaticConfirmation:
                    false,
            },

            isReady,
            waitUntilReady,

            getPersonalBalance,
            getFinancialSnapshot,

            getAmountInput,
            getSubmitButton,

            setAmount,
            highlightSubmit,
            prepareDeposit,

            inspect,
        });

    /*
     * Register the helper through the page-helper registry.
     *
     * Do not attach dom.pages.factionBank directly because the
     * framework may expose dom.pages as a protected or
     * non-extensible object.
     */
    dom.pages.registerHelper(
        HELPER_ID,
        factionBank,
        {
            replace:
                true,
        }
    );

    logger.info(
        "Faction Bank DOM page helper loaded",
        {
            helperId:
                HELPER_ID,

            routeId:
                "deposit:faction-bank",

            capabilitySource:
                "explicit",

            capabilities: [
                "page.ready",
                "page.wait-until-ready",
                "page.inspect",
                "finance.balance.read",
                "finance.snapshot.read",
                "amount.read",
                "amount.set",
                "submit.locate",
                "submit.highlight",
                "deposit.prepare",
            ],

            submitsForm:
                false,

            confirmsTransaction:
                false,
        }
    );
})();