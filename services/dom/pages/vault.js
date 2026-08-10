/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/vault.js
 *
 * Purpose:
 * Registers page-specific DOM helpers for the Personal Vault
 * deposit interface.
 *
 * Responsibilities:
 * - Determine whether Personal Vault deposit controls are ready
 * - Locate the verified deposit amount and submit controls
 * - Fill a requested deposit amount
 * - Dispatch input and change events
 * - Highlight the manual Deposit control
 * - Expose helper diagnostics
 *
 * Does NOT:
 * - Navigate to the property page
 * - Click the Deposit button
 * - Submit the vault form
 * - Confirm a transaction
 * - Decide how much should be deposited
 *
 * Public API:
 * - TACTIC.services.dom.pages.getHelper("personal-vault")
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
            "[TACTIC DOM Vault Page] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (!dom) {
        console.error(
            "[TACTIC DOM Vault Page] DOM service is unavailable."
        );

        return;
    }

    if (!dom.pages) {
        console.error(
            "[TACTIC DOM Vault Page] DOM page subsystem is unavailable."
        );

        return;
    }

    if (
        typeof dom.getSelector !==
        "function"
    ) {
        console.error(
            "[TACTIC DOM Vault Page] DOM selector catalog is unavailable."
        );

        return;
    }

    const HELPER_ID =
        "personal-vault";

    const SELECTOR_KEYS =
        Object.freeze({
            BALANCE:
                "VAULT.BALANCE",

            AMOUNT:
                "VAULT.DEPOSIT_AMOUNT",

            SUBMIT:
                "VAULT.DEPOSIT_BUTTON",
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
            `Personal Vault DOM helper: ${operation}`,
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
                "Personal Vault deposit amount must be a positive whole number."
            );
        }

        return numeric;
    }

    function getMaximumDeposit(
        input =
            getAmountInput()
    ) {
        if (!input) {
            return null;
        }

        const maximum =
            Number(
                input.dataset.max
            );

        return Number.isSafeInteger(
            maximum
        ) &&
            maximum > 0
            ? maximum
            : null;
    }

    function getWalletMaximum(
        input =
            getAmountInput()
    ) {
        if (!input) {
            return null;
        }

        const wallet =
            Number(
                input.dataset.money
            );

        return Number.isSafeInteger(
            wallet
        ) &&
            wallet >= 0
            ? wallet
            : null;
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

    function getBalanceElement() {
        return findByKey(
            SELECTOR_KEYS.BALANCE
        );
    }

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

    function parseMoney(
        value
    ) {
        const normalized =
            normalizeText(
                value
            );

        if (!normalized) {
            return null;
        }

        const numericText =
            normalized.replace(
                /[^0-9.-]/g,
                ""
            );

        if (!numericText) {
            return null;
        }

        const numeric =
            Number(
                numericText
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

                reason:
                    "balance-element-not-found",

                readAt:
                    metrics
                        .lastBalanceReadAt,
            };
        }

        const raw =
            normalizeText(
                element.textContent
            );

        const value =
            parseMoney(
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
                    "balance-value-invalid",

                readAt:
                    metrics
                        .lastBalanceReadAt,
            };
        }

        metrics.balanceReadSuccesses +=
            1;

        metrics.lastBalance =
            value;

        recordActivity(
            "balance-read",
            {
                value,
            }
        );

        return {
            available:
                true,

            verified:
                true,

            value,

            raw,

            source:
                "personal-vault-balance",

            selector:
                getSelector(
                    SELECTOR_KEYS.BALANCE
                ),

            readAt:
                metrics
                    .lastBalanceReadAt,
        };
    }

    function getFinancialSnapshot() {
        metrics.financialSnapshotReads +=
            1;

        const balance =
            getBalance();

        return {
            id:
                "personal-vault",

            type:
                "personal-vault",

            name:
                "Personal Vault",

            ownership:
                "personal",

            balance,

            spendable:
                balance.available,

            immediatelyAvailable:
                false,

            liquidityClass:
                "self-accessible",

            access: {
                canDeposit:
                    Boolean(
                        getAmountInput()
                    ),

                canSelfWithdraw:
                    true,

                requiresThirdParty:
                    false,

                requiresTravel:
                    false,

                timing:
                    "immediate-on-access",
            },

            accessCost: {
                timeMinutes:
                    0,

                timeKnown:
                    true,

                risk:
                    "low",

                dependencies: [],
            },

            funding: {
                usableForRecommendations:
                    balance.available,

                affordabilityClass:
                    balance.available
                        ? "affordable-after-self-withdrawal"
                        : "unavailable",

                transferRequired:
                    false,

                selfWithdrawalRequired:
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
                "personal-vault-dom-helper",
        };
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

    function isReady() {
        metrics.readinessChecks +=
            1;

        const checks = {
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

        const result = {
            ...isReady(),

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
                    "Timed out waiting for the Personal Vault deposit controls."
                );

            error.name =
                "PersonalVaultPageTimeoutError";

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

            return {
                success:
                    false,

                reason:
                    "amount-input-not-found",

                amount:
                    normalizedAmount,
            };
        }

        const maximumDeposit =
            getMaximumDeposit(
                input
            );

        const availableWallet =
            getWalletMaximum(
                input
            );

        if (
            maximumDeposit !==
                null &&
            normalizedAmount >
                maximumDeposit
        ) {
            metrics.amountSetFailures +=
                1;

            return {
                success:
                    false,

                reason:
                    "amount-exceeds-vault-maximum",

                amount:
                    normalizedAmount,

                maximumDeposit,
            };
        }

        if (
            availableWallet !==
                null &&
            normalizedAmount >
                availableWallet
        ) {
            metrics.amountSetFailures +=
                1;

            return {
                success:
                    false,

                reason:
                    "amount-exceeds-wallet",

                amount:
                    normalizedAmount,

                availableWallet,
            };
        }

        input.focus();

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

                maximumDeposit,

                availableWallet,
            }
        );

        return {
            success:
                true,

            amount:
                normalizedAmount,

            rawValue:
                input.value,

            maximumDeposit,

            availableWallet,

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

        recordActivity(
            "highlight-submit",
            {
                durationMs,

                disabled:
                    button.disabled,
            }
        );

        return {
            success:
                true,

            durationMs,

            disabled:
                button.disabled,

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

            return {
                success:
                    false,

                prepared:
                    false,

                submitted:
                    false,

                reason:
                    amountResult.reason,

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
                    amountResult.amount,

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
                amountResult.amount,

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

        const input =
            getAmountInput();

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

                balance:
                    Boolean(
                        getBalanceElement()
                    ),

                balanceReadable:
                    getBalance()
                        .available ===
                    true,

                amountInput:
                    Boolean(
                        input
                    ),

                submitButton:
                    Boolean(
                        getSubmitButton()
                    ),
            },

            limits: {
                availableWallet:
                    getWalletMaximum(
                        input
                    ),

                maximumDeposit:
                    getMaximumDeposit(
                        input
                    ),
            },

            selectors: {

                balance:
                    getSelector(
                        SELECTOR_KEYS.BALANCE
                    ),

                amount:
                    getSelector(
                        SELECTOR_KEYS.AMOUNT
                    ),

                submit:
                    getSelector(
                        SELECTOR_KEYS.SUBMIT
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

    const personalVault =
        Object.freeze({
            id:
                HELPER_ID,

            name:
                "Personal Vault",

            description:
                "Prepares deposits into the player's Personal Vault for manual submission.",

            pageId:
                "properties",

            routeId:
                "deposit:personal-vault",

            capabilities: {
                "page.ready":
                    "isReady",

                "page.wait-until-ready":
                    "waitUntilReady",

                "page.inspect":
                    "inspect",

                "finance.balance.read":
                    "getBalance",

                "finance.snapshot.read":
                    "getFinancialSnapshot",

                "amount.read":
                    "getAmountInput",

                "amount.set":
                    "setAmount",

                "amount.maximum":
                    "getMaximumDeposit",

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
                    "finance",

                secondaryCategory:
                    "deposit",

                destination:
                    "personal-vault",

                fundingSource:
                    true,

                liquidityClass:
                    "self-accessible",

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

            getBalanceElement,
            getBalance,
            getFinancialSnapshot,

            getAmountInput,
            getSubmitButton,

            getMaximumDeposit,
            getWalletMaximum,

            setAmount,
            highlightSubmit,
            prepareDeposit,

            inspect,
        });

    dom.pages.registerHelper(
        HELPER_ID,
        personalVault,
        {
            replace:
                true,
        }
    );

    logger?.info(
        "Personal Vault DOM page helper loaded",
        {
            helperId:
                HELPER_ID,

            routeId:
                "deposit:personal-vault",

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
                "amount.maximum",
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