/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/finance/advisor.js
 *
 * Purpose:
 * Converts financial state into transparent, prioritized,
 * actionable recommendations.
 *
 * Responsibilities:
 * - Evaluate Wallet Protection recommendations
 * - Evaluate active Investment Bank status
 * - Evaluate unified liquidity and funding sources
 * - Identify request-dependent and locked financial resources
 * - Identify bank maturity and availability conditions
 * - Compare current bank recommendations
 * - Generate prioritized financial next actions
 * - Keep recommendations independent of the user interface
 * - Explain why each recommendation was produced
 * - Expose diagnostics and evaluation metrics
 *
 * Does NOT:
 * - Read Torn's DOM
 * - Own financial repository data
 * - Render application interfaces
 * - Navigate between Finance tabs
 * - Perform deposits or investments
 * - Submit or confirm transactions
 *
 * Public API:
 * - TACTIC.services.financeAdvisor
 * - evaluate()
 * - getPrimaryRecommendation()
 * - inspect()
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Finance Advisor] Namespace is unavailable."
        );

        return;
    }

    if (
        !TACTIC.services ||
        typeof TACTIC.services !==
            "object"
    ) {
        TACTIC.services = {};
    }

    const logger =
        TACTIC.services.logger;

    const events =
        TACTIC.services.events;

    const health =
        TACTIC.services.health;

    const SERVICE_NAME =
        "service:financeAdvisor";

    const PRIORITIES =
        Object.freeze({
            CRITICAL:
                "critical",

            HIGH:
                "high",

            MEDIUM:
                "medium",

            LOW:
                "low",

            INFORMATIONAL:
                "informational",
        });

    const PRIORITY_SCORES =
        Object.freeze({
            [PRIORITIES.CRITICAL]:
                500,

            [PRIORITIES.HIGH]:
                400,

            [PRIORITIES.MEDIUM]:
                300,

            [PRIORITIES.LOW]:
                200,

            [PRIORITIES.INFORMATIONAL]:
                100,
        });

    const CATEGORIES =
        Object.freeze({
            WALLET_PROTECTION:
                "wallet-protection",

            BANK_MATURITY:
                "bank-maturity",

            BANK_INVESTMENT:
                "bank-investment",

            LIQUIDITY:
                "liquidity",

            FINANCIAL_STATUS:
                "financial-status",
        });

    const ACTION_TYPES =
        Object.freeze({
            OPEN_FINANCE_TAB:
                "open-finance-tab",

            OPEN_TACTIC_MODULE:
                "open-tactic-module",

            NONE:
                "none",
        });

    const EVENT_NAMES =
        Object.freeze({
            EVALUATION_COMPLETED:
                "finance-advisor:evaluation-completed",

            PRIMARY_RECOMMENDATION_CHANGED:
                "finance-advisor:primary-recommendation-changed",
        });

    const DEFAULTS =
        Object.freeze({
            MATURITY_WARNING_MS:
                24 *
                60 *
                60 *
                1_000,

            MATURITY_SOON_MS:
                3 *
                24 *
                60 *
                60 *
                1_000,

            WALLET_CHANGE_THRESHOLD:
                0,
        });

    const metrics = {
        loadedAt:
            Date.now(),

        evaluations:
            0,

        recommendationsCreated:
            0,

        emptyEvaluations:
            0,

        validationFailures:
            0,

        evaluationFailures:
            0,

        primaryRecommendationChanges:
            0,

        lastEvaluationAt:
            null,

        lastRecommendationAt:
            null,

        lastPrimaryChangeAt:
            null,

        lastActivityAt:
            Date.now(),

        lastPrimaryRecommendation:
            null,

        lastEvaluation:
            null,

        lastError:
            null,
    };

    let recommendationSequence =
        0;

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

            stack:
                error?.stack ||
                null,

            timestamp:
                Date.now(),
        };
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat?.(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    evaluations:
                        metrics.evaluations,

                    recommendationsCreated:
                        metrics
                            .recommendationsCreated,

                    ...metadata,
                },
            }
        );
    }

    function formatMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "an unavailable amount";
        }

        return new Intl.NumberFormat(
            "en-US",
            {
                style:
                    "currency",

                currency:
                    "USD",

                maximumFractionDigits:
                    0,
            }
        ).format(
            value
        );
    }

    function formatDuration(
        milliseconds
    ) {
        if (
            !Number.isFinite(
                milliseconds
            )
        ) {
            return "an unknown amount of time";
        }

        const totalMinutes =
            Math.max(
                0,
                Math.floor(
                    milliseconds /
                    60_000
                )
            );

        const days =
            Math.floor(
                totalMinutes /
                1_440
            );

        const hours =
            Math.floor(
                (
                    totalMinutes %
                    1_440
                ) /
                60
            );

        const minutes =
            totalMinutes %
            60;

        if (days > 0) {
            return `${days} day${
                days === 1
                    ? ""
                    : "s"
            }, ${hours} hour${
                hours === 1
                    ? ""
                    : "s"
            }`;
        }

        if (hours > 0) {
            return `${hours} hour${
                hours === 1
                    ? ""
                    : "s"
            }, ${minutes} minute${
                minutes === 1
                    ? ""
                    : "s"
            }`;
        }

        return `${minutes} minute${
            minutes === 1
                ? ""
                : "s"
        }`;
    }

    function normalizeInput(
        input
    ) {
        if (
            !input ||
            typeof input !==
                "object" ||
            Array.isArray(
                input
            )
        ) {
            metrics.validationFailures +=
                1;

            throw new TypeError(
                "Finance Advisor input must be an object."
            );
        }

        return {
            wallet:
                input.wallet ||
                null,

            protection:
                input.protection ||
                null,

            investmentBank:
                input.investmentBank ||
                null,

            fundingSources:
                Array.isArray(
                    input.fundingSources
                )
                    ? cloneValue(
                          input.fundingSources
                      )
                    : [],

            liquidity:
                input.liquidity &&
                typeof input.liquidity ===
                    "object"
                    ? cloneValue(
                          input.liquidity
                      )
                    : null,

            preferences: {
                ...(
                    input.preferences ||
                    {}
                ),
            },

            evaluatedAt:
                Number.isFinite(
                    input.evaluatedAt
                )
                    ? Number(
                          input.evaluatedAt
                      )
                    : Date.now(),
        };
    }

    function createAction(
        type,
        target =
            null,
        label =
            null,
        metadata = {}
    ) {
        return {
            type,

            target,

            label,

            available:
                type !==
                ACTION_TYPES.NONE,

            metadata: {
                ...metadata,
            },
        };
    }

    function createRecommendation({
        priority,
        category,
        title,
        message,
        reason,
        action,
        scoreAdjustment =
            0,
        metadata = {},
    }) {
        recommendationSequence +=
            1;

        const normalizedPriority =
            PRIORITY_SCORES[
                priority
            ]
                ? priority
                : PRIORITIES
                      .INFORMATIONAL;

        const recommendation = {
            id:
                `finance-advice-${Date.now()}-${recommendationSequence}`,

            priority:
                normalizedPriority,

            priorityScore:
                PRIORITY_SCORES[
                    normalizedPriority
                ] +
                Number(
                    scoreAdjustment ||
                    0
                ),

            category,

            title,

            message,

            reason,

            action:
                action ||
                createAction(
                    ACTION_TYPES.NONE
                ),

            metadata: {
                ...metadata,
            },

            createdAt:
                Date.now(),
        };

        metrics.recommendationsCreated +=
            1;

        metrics.lastRecommendationAt =
            recommendation.createdAt;

        return recommendation;
    }

    function getProtectionEvaluation(
        protection
    ) {
        if (!protection) {
            return null;
        }

        if (
            protection.evaluation
        ) {
            return protection.evaluation;
        }

        return protection;
    }

    function getProtectionConfiguration(
        protection
    ) {
        if (!protection) {
            return null;
        }

        if (
            protection.configuration
        ) {
            return protection.configuration;
        }

        return null;
    }

    function evaluateWalletProtection(
        context,
        recommendations
    ) {
        const wallet =
            context.wallet;

        const protection =
            context.protection;

        const evaluation =
            getProtectionEvaluation(
                protection
            );

        const configuration =
            getProtectionConfiguration(
                protection
            );

        if (
            !wallet ||
            wallet.available !==
                true ||
            !Number.isFinite(
                wallet.value
            )
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.LOW,

                    category:
                        CATEGORIES
                            .FINANCIAL_STATUS,

                    title:
                        "Wallet balance unavailable",

                    message:
                        "TACTIC cannot currently verify your wallet balance.",

                    reason:
                        "The Finance Repository does not have an available wallet reading.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "wallet",
                            "View Wallet"
                        ),

                    metadata: {
                        walletAvailable:
                            false,
                    },
                })
            );

            return;
        }

        if (
            configuration &&
            configuration.enabled ===
                false
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        wallet.value > 0
                            ? PRIORITIES.MEDIUM
                            : PRIORITIES.LOW,

                    category:
                        CATEGORIES
                            .WALLET_PROTECTION,

                    title:
                        "Wallet Protection is disabled",

                    message:
                        wallet.value > 0
                            ? `${formatMoney(
                                  wallet.value
                              )} is currently in your wallet without active Protection monitoring.`
                            : "Wallet Protection is currently disabled.",

                    reason:
                        "Protection settings show that wallet monitoring is disabled.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "wallet",
                            "Review Wallet Protection"
                        ),

                    metadata: {
                        walletValue:
                            wallet.value,

                        protectionEnabled:
                            false,
                    },
                })
            );

            return;
        }

        if (
            evaluation
                ?.shouldDeposit ===
                true &&
            Number.isFinite(
                evaluation.depositAmount
            ) &&
            evaluation.depositAmount >
                0
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.HIGH,

                    category:
                        CATEGORIES
                            .WALLET_PROTECTION,

                    title:
                        "Protect excess wallet cash",

                    message:
                        `Wallet Protection recommends moving ${formatMoney(
                            evaluation.depositAmount
                        )} out of your wallet.`,

                    reason:
                        "Your current wallet exceeds the configured Protection threshold and reserve.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "wallet",
                            "Review Recommended Deposit"
                        ),

                    scoreAdjustment:
                        Math.min(
                            50,
                            Math.floor(
                                evaluation.depositAmount /
                                100_000_000
                            )
                        ),

                    metadata: {
                        walletValue:
                            wallet.value,

                        depositAmount:
                            evaluation.depositAmount,

                        reserve:
                            evaluation
                                ?.configuration
                                ?.reserve ??
                            configuration
                                ?.reserve ??
                            null,

                        threshold:
                            evaluation
                                ?.configuration
                                ?.threshold ??
                            configuration
                                ?.threshold ??
                            null,
                    },
                })
            );

            return;
        }

        recommendations.push(
            createRecommendation({
                priority:
                    PRIORITIES.INFORMATIONAL,

                category:
                    CATEGORIES
                        .WALLET_PROTECTION,

                title:
                    "Wallet is within your protected range",

                message:
                    `${formatMoney(
                        wallet.value
                    )} is currently in your wallet, and no deposit is recommended.`,

                reason:
                    evaluation?.reason ||
                    "The wallet does not currently exceed the configured Protection rules.",

                action:
                    createAction(
                        ACTION_TYPES
                            .OPEN_FINANCE_TAB,
                        "wallet",
                        "View Wallet"
                    ),

                metadata: {
                    walletValue:
                        wallet.value,

                    depositRecommended:
                        false,
                },
            })
        );
    }

    function getRemainingMilliseconds(
        activeInvestment,
        evaluatedAt
    ) {
        const countdown =
            activeInvestment
                ?.countdown;

        if (
            Number.isFinite(
                countdown
                    ?.estimatedMaturesAt
            )
        ) {
            return Math.max(
                0,
                countdown
                    .estimatedMaturesAt -
                    evaluatedAt
            );
        }

        if (
            Number.isFinite(
                countdown
                    ?.milliseconds
            )
        ) {
            return Math.max(
                0,
                countdown
                    .milliseconds
            );
        }

        return null;
    }

    function evaluateActiveBankInvestment(
        context,
        recommendations
    ) {
        const bank =
            context.investmentBank;

        const active =
            bank
                ?.activeInvestment;

        if (
            active?.active !==
            true
        ) {
            return false;
        }

        const remainingMs =
            getRemainingMilliseconds(
                active,
                context.evaluatedAt
            );

        const payout =
            active
                ?.payout
                ?.value;

        if (
            Number.isFinite(
                remainingMs
            ) &&
            remainingMs <=
                0
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.CRITICAL,

                    category:
                        CATEGORIES
                            .BANK_MATURITY,

                    title:
                        "Bank investment may be ready",

                    message:
                        Number.isFinite(
                            payout
                        )
                            ? `Your investment payout of ${formatMoney(
                                  payout
                              )} may now be available.`
                            : "Your bank investment countdown has reached zero.",

                    reason:
                        "The recorded Investment Bank maturity time has been reached.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "bank",
                            "Review Investment Bank"
                        ),

                    metadata: {
                        payout,

                        remainingMs,
                    },
                })
            );

            return true;
        }

        if (
            Number.isFinite(
                remainingMs
            ) &&
            remainingMs <=
                DEFAULTS
                    .MATURITY_WARNING_MS
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.HIGH,

                    category:
                        CATEGORIES
                            .BANK_MATURITY,

                    title:
                        "Bank investment matures soon",

                    message:
                        `Your active investment is expected to mature in approximately ${formatDuration(
                            remainingMs
                        )}.`,

                    reason:
                        "The active investment is within one day of its estimated maturity.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "bank",
                            "Review Investment"
                        ),

                    metadata: {
                        payout,

                        remainingMs,

                        maturityWindow:
                            "within-one-day",
                    },
                })
            );

            return true;
        }

        if (
            Number.isFinite(
                remainingMs
            ) &&
            remainingMs <=
                DEFAULTS
                    .MATURITY_SOON_MS
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.MEDIUM,

                    category:
                        CATEGORIES
                            .BANK_MATURITY,

                    title:
                        "Prepare for bank maturity",

                    message:
                        `Your active investment is expected to mature in approximately ${formatDuration(
                            remainingMs
                        )}.`,

                    reason:
                        "The active investment is within three days of its estimated maturity.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "bank",
                            "View Bank Timeline"
                        ),

                    metadata: {
                        payout,

                        remainingMs,

                        maturityWindow:
                            "within-three-days",
                    },
                })
            );

            return true;
        }

        recommendations.push(
            createRecommendation({
                priority:
                    PRIORITIES.LOW,

                category:
                    CATEGORIES
                        .BANK_INVESTMENT,

                title:
                    "Bank investment is active",

                message:
                    Number.isFinite(
                        remainingMs
                    )
                        ? `Your funds remain locked for approximately ${formatDuration(
                              remainingMs
                          )}.`
                        : "Your Investment Bank funds are currently locked.",

                reason:
                    "An active Investment Bank investment was detected.",

                action:
                    createAction(
                        ACTION_TYPES
                            .OPEN_FINANCE_TAB,
                        "bank",
                        "View Active Investment"
                    ),

                metadata: {
                    payout,

                    remainingMs,

                    selectedTerm:
                        active
                            ?.selectedTerm
                            ?.id ||
                        null,
                },
            })
        );

        return true;
    }

    function evaluateAvailableBankInvestment(
        context,
        recommendations
    ) {
        const bank =
            context.investmentBank;

        if (!bank) {
            return;
        }

        if (
            bank.available !==
            true
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.LOW,

                    category:
                        CATEGORIES
                            .BANK_INVESTMENT,

                    title:
                        "Bank rates are not loaded",

                    message:
                        "Open Torn's Investment Bank page to load current terms and recommendations.",

                    reason:
                        bank.reason ||
                        "The Finance Repository does not currently have an available Investment Bank snapshot.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "bank",
                            "View Investment Bank"
                        ),

                    metadata: {
                        bankAvailable:
                            false,
                    },
                })
            );

            return;
        }

        const recommendation =
            bank
                ?.analysis
                ?.recommendation
                ?.recommendation;

        if (!recommendation) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.LOW,

                    category:
                        CATEGORIES
                            .BANK_INVESTMENT,

                    title:
                        "No bank recommendation available",

                    message:
                        "TACTIC needs a usable principal and current bank rates before it can recommend a term.",

                    reason:
                        "The Investment Bank analysis did not produce a recommendation.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "bank",
                            "Review Bank Options"
                        ),

                    metadata: {
                        optionCount:
                            bank.options
                                ?.length ||
                            0,
                    },
                })
            );

            return;
        }

        const principal =
            recommendation
                ?.principal
                ?.value;

        const profit =
            recommendation
                ?.profit
                ?.value;

        const option =
            recommendation.option;

        recommendations.push(
            createRecommendation({
                priority:
                    PRIORITIES.MEDIUM,

                category:
                    CATEGORIES
                        .BANK_INVESTMENT,

                title:
                    `${option.label} is currently recommended`,

                message:
                    Number.isFinite(
                        principal
                    ) &&
                    Number.isFinite(
                        profit
                    )
                        ? `Investing ${formatMoney(
                              principal
                          )} is projected to earn ${formatMoney(
                              profit
                          )} over ${option.days} days.`
                        : `${option.label} is the best match for your selected investment strategy.`,

                reason:
                    recommendation.reason ||
                    "This term ranked highest under the selected Investment Bank strategy.",

                action:
                    createAction(
                        ACTION_TYPES
                            .OPEN_FINANCE_TAB,
                        "bank",
                        "Review Recommended Term"
                    ),

                metadata: {
                    strategy:
                        bank.strategy,

                    optionId:
                        option.id,

                    termDays:
                        option.days,

                    principal,

                    projectedProfit:
                        profit,

                    projectedPayout:
                        recommendation
                            ?.payout
                            ?.value ??
                        null,

                    displayedAprPercent:
                        recommendation
                            ?.annualized
                            ?.displayedAprPercent ??
                        null,
                },
            })
        );
    }

    function evaluateLiquidity(
        context,
        recommendations
    ) {
        const liquidity =
            context.liquidity;

        if (
            !liquidity ||
            typeof liquidity !==
                "object"
        ) {
            return;
        }

        const immediate =
            Number.isFinite(
                liquidity.immediate
            )
                ? liquidity.immediate
                : 0;

        const conditional =
            Number.isFinite(
                liquidity.conditional
            )
                ? liquidity.conditional
                : 0;

        const selfAccessible =
            Number.isFinite(
                liquidity.selfAccessible
            )
                ? liquidity.selfAccessible
                : 0;

        const requestDependent =
            Number.isFinite(
                liquidity.requestDependent
            )
                ? liquidity.requestDependent
                : 0;

        const travelDependent =
            Number.isFinite(
                liquidity.travelDependent
            )
                ? liquidity.travelDependent
                : 0;

        const accessible =
            Number.isFinite(
                liquidity.accessible
            )
                ? liquidity.accessible
                : immediate +
                  conditional;

        const locked =
            Number.isFinite(
                liquidity.locked
            )
                ? liquidity.locked
                : 0;

        const totalKnown =
            Number.isFinite(
                liquidity.totalKnown
            )
                ? liquidity.totalKnown
                : accessible +
                  locked;

        const fundingSources =
            Array.isArray(
                context.fundingSources
            )
                ? context.fundingSources
                : [];

        const personalVault =
            fundingSources.find(
                source =>
                    source?.id ===
                    "personal-vault"
            ) ||
            null;

        const factionVault =
            fundingSources.find(
                source =>
                    source?.id ===
                    "faction-vault"
            ) ||
            null;

        const cayman =
            fundingSources.find(
                source =>
                    source?.id ===
                    "cayman"
            ) ||
            null;

        const personalVaultValue =
            Number.isFinite(
                personalVault?.amount
            )
                ? personalVault.amount
                : 0;

        const factionValue =
            Number.isFinite(
                factionVault?.amount
            )
                ? factionVault.amount
                : 0;

        const caymanValue =
            Number.isFinite(
                cayman?.amount
            )
                ? cayman.amount
                : 0;

        /*
         * No meaningful financial state is available yet.
         */
        if (
            totalKnown <=
            0
        ) {
            return;
        }

        /*
         * A meaningful amount of wealth exists, but none of it
         * is currently accessible.
         */
        if (
            accessible <=
                0 &&
            locked >
                0
        ) {
            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.MEDIUM,

                    category:
                        CATEGORIES
                            .LIQUIDITY,

                    title:
                        "Funds are currently locked",

                    message:
                        `${formatMoney(
                            locked
                        )} is currently locked, with no tracked spendable funds available outside those holdings.`,

                    reason:
                        "TACTIC detected known financial assets, but none are currently classified as immediately or conditionally accessible.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "overview",
                            "Review Finance Overview"
                        ),

                    metadata: {
                        immediate,

                        conditional,

                        accessible,

                        locked,

                        totalKnown,
                    },
                })
            );

            return;
        }

        /*
         * Most tracked wealth is locked, but the player still has
         * spendable funds through another source.
         */
        if (
            locked >
                accessible &&
            accessible >
                0
        ) {
            const accessibleDetails =
                [];

            if (
                immediate >
                0
            ) {
                accessibleDetails.push(
                    `${formatMoney(
                        immediate
                    )} is immediately available`
                );
            }

            if (
                personalVaultValue >
                0
            ) {
                accessibleDetails.push(
                    `${formatMoney(
                        personalVaultValue
                    )} is self-accessible through your Personal Vault`
                );
            }

            if (
                factionValue >
                0
            ) {
                accessibleDetails.push(
                    `${formatMoney(
                        factionValue
                    )} is available through your Faction Vault after a banker transfer`
                );
            }

            if (
                caymanValue >
                0
            ) {
                accessibleDetails.push(
                    `${formatMoney(
                        caymanValue
                    )} is available through Cayman after travel`
                );
            }

            const accessMessage =
                accessibleDetails.length >
                0
                    ? accessibleDetails.join(
                          ", while "
                      )
                    : `${formatMoney(
                          accessible
                      )} remains accessible outside the locked funds`;

            recommendations.push(
                createRecommendation({
                    priority:
                        immediate <=
                            0 &&
                        conditional >
                            0
                            ? PRIORITIES.MEDIUM
                            : PRIORITIES.LOW,

                    category:
                        CATEGORIES
                            .LIQUIDITY,

                    title:
                        "Most funds are currently locked",

                    message:
                        `${formatMoney(
                            locked
                        )} is currently locked. ${accessMessage}.`,

                    reason:
                        "Locked assets represent most of the tracked financial picture, but other spendable funding sources remain available.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "overview",
                            "Review Funding Sources"
                        ),

                    metadata: {
                        immediate,

                        selfAccessible,

                        requestDependent,

                        travelDependent,

                        conditional,

                        accessible,

                        locked,

                        totalKnown,

                        personalVault:
                            personalVaultValue,

                        factionVault:
                            factionValue,

                        cayman:
                            caymanValue,
                    },
                })
            );

            return;
        }

        /*
         * Nothing is immediately available, but spendable money
         * can be obtained through a transfer/travel dependency.
         */
        if (
            immediate <=
                0 &&
            conditional >
                0
        ) {
            const accessDetails =
                [];

            if (
                selfAccessible >
                0
            ) {
                accessDetails.push(
                    `${formatMoney(
                        selfAccessible
                    )} can be retrieved directly from your Personal Vault`
                );
            }

            if (
                requestDependent >
                0
            ) {
                accessDetails.push(
                    `${formatMoney(
                        requestDependent
                    )} requires a faction banker transfer`
                );
            }

            if (
                travelDependent >
                0
            ) {
                accessDetails.push(
                    `${formatMoney(
                        travelDependent
                    )} requires travel before it can be accessed`
                );
            }

            const accessMessage =
                accessDetails.length >
                0
                    ? accessDetails.join(
                        ". "
                    )
                    : `${formatMoney(
                        conditional
                    )} is spendable but requires an access step before use`;

            recommendations.push(
                createRecommendation({
                    priority:
                        PRIORITIES.LOW,

                    category:
                        CATEGORIES
                            .LIQUIDITY,

                    title:
                        "Spendable funds require access first",

                    message:
                        `${accessMessage}.`,

                    reason:
                        "TACTIC detected spendable non-wallet liquidity, but no immediately available cash.",

                    action:
                        createAction(
                            ACTION_TYPES
                                .OPEN_FINANCE_TAB,
                            "overview",
                            "Review Funding Sources"
                        ),

                    metadata: {
                        immediate,

                        selfAccessible,

                        requestDependent,

                        travelDependent,

                        conditional,

                        accessible,

                        locked,

                        totalKnown,

                        personalVault:
                            personalVaultValue,

                        factionVault:
                            factionValue,

                        cayman:
                            caymanValue,
                    },
                })
            );
        }
    }

    function sortRecommendations(
        recommendations
    ) {
        return [
            ...recommendations,
        ].sort(
            (
                first,
                second
            ) =>
                second.priorityScore -
                    first.priorityScore ||
                first.createdAt -
                    second.createdAt
        );
    }

    function createEvaluationSnapshot(
        context,
        recommendations
    ) {
        const sorted =
            sortRecommendations(
                recommendations
            );

        return {
            primary:
                sorted[0] ||
                null,

            recommendations:
                sorted,

            counts: {
                total:
                    sorted.length,

                critical:
                    sorted.filter(
                        item =>
                            item.priority ===
                            PRIORITIES.CRITICAL
                    ).length,

                high:
                    sorted.filter(
                        item =>
                            item.priority ===
                            PRIORITIES.HIGH
                    ).length,

                medium:
                    sorted.filter(
                        item =>
                            item.priority ===
                            PRIORITIES.MEDIUM
                    ).length,

                low:
                    sorted.filter(
                        item =>
                            item.priority ===
                            PRIORITIES.LOW
                    ).length,

                informational:
                    sorted.filter(
                        item =>
                            item.priority ===
                            PRIORITIES
                                .INFORMATIONAL
                    ).length,
            },

            sources: {
                walletAvailable:
                    context.wallet
                        ?.available ===
                    true,

                protectionAvailable:
                    Boolean(
                        context.protection
                    ),

                investmentBankAvailable:
                    context
                        .investmentBank
                        ?.available ===
                    true,

                activeBankInvestment:
                    context
                        .investmentBank
                        ?.activeInvestment
                        ?.active ===
                    true,

                fundingSourcesAvailable:
                    context
                        .fundingSources
                        .length >
                    0,

                fundingSourceCount:
                    context
                        .fundingSources
                        .length,

                liquidityAvailable:
                    Boolean(
                        context.liquidity
                    ),

                immediateLiquidity:
                    context
                        .liquidity
                        ?.immediate ??
                    null,

                selfAccessibleLiquidity:
                    context
                        .liquidity
                        ?.selfAccessible ??
                    null,

                requestDependentLiquidity:
                    context
                        .liquidity
                        ?.requestDependent ??
                    null,

                travelDependentLiquidity:
                    context
                        .liquidity
                        ?.travelDependent ??
                    null,

                conditionalLiquidity:
                    context
                        .liquidity
                        ?.conditional ??
                    null,

                lockedLiquidity:
                    context
                        .liquidity
                        ?.locked ??
                    null,

                totalKnown:
                    context
                        .liquidity
                        ?.totalKnown ??
                    null,
            },

            evaluatedAt:
                context.evaluatedAt,
        };
    }

    function primaryRecommendationsEqual(
        first,
        second
    ) {
        if (
            !first &&
            !second
        ) {
            return true;
        }

        if (
            !first ||
            !second
        ) {
            return false;
        }

        return (
            first.priority ===
                second.priority &&
            first.category ===
                second.category &&
            first.title ===
                second.title &&
            first.action
                ?.type ===
                second.action
                    ?.type &&
            first.action
                ?.target ===
                second.action
                    ?.target
        );
    }

    function evaluate(
        input
    ) {
        metrics.evaluations +=
            1;

        metrics.lastEvaluationAt =
            Date.now();

        metrics.lastError =
            null;

        try {
            const context =
                normalizeInput(
                    input
                );

            const recommendations =
                [];

            evaluateWalletProtection(
                context,
                recommendations
            );

            const activeBankInvestment =
                evaluateActiveBankInvestment(
                    context,
                    recommendations
                );

            if (!activeBankInvestment) {
                evaluateAvailableBankInvestment(
                    context,
                    recommendations
                );
            }

            evaluateLiquidity(
                context,
                recommendations
            );

            if (
                recommendations.length ===
                0
            ) {
                metrics.emptyEvaluations +=
                    1;

                recommendations.push(
                    createRecommendation({
                        priority:
                            PRIORITIES
                                .INFORMATIONAL,

                        category:
                            CATEGORIES
                                .FINANCIAL_STATUS,

                        title:
                            "No immediate financial action",

                        message:
                            "TACTIC did not identify an urgent financial action from the currently available data.",

                        reason:
                            "No evaluated financial rule produced an actionable condition.",

                        action:
                            createAction(
                                ACTION_TYPES
                                    .OPEN_FINANCE_TAB,
                                "overview",
                                "View Finance Overview"
                            ),
                    })
                );
            }

            const result =
                createEvaluationSnapshot(
                    context,
                    recommendations
                );

            const previousPrimary =
                metrics
                    .lastPrimaryRecommendation;

            if (
                !primaryRecommendationsEqual(
                    previousPrimary,
                    result.primary
                )
            ) {
                metrics
                    .primaryRecommendationChanges +=
                    1;

                metrics.lastPrimaryChangeAt =
                    Date.now();

                events?.emit?.(
                    EVENT_NAMES
                        .PRIMARY_RECOMMENDATION_CHANGED,
                    {
                        previous:
                            cloneValue(
                                previousPrimary
                            ),

                        current:
                            cloneValue(
                                result.primary
                            ),

                        timestamp:
                            metrics
                                .lastPrimaryChangeAt,
                    }
                );
            }

            metrics.lastPrimaryRecommendation =
                cloneValue(
                    result.primary
                );

            metrics.lastEvaluation =
                cloneValue(
                    result
                );

            recordActivity(
                "evaluation-completed",
                {
                    recommendationCount:
                        result.counts.total,

                    primaryPriority:
                        result.primary
                            ?.priority ||
                        null,

                    primaryCategory:
                        result.primary
                            ?.category ||
                        null,
                }
            );

            events?.emit?.(
                EVENT_NAMES
                    .EVALUATION_COMPLETED,
                cloneValue(
                    result
                )
            );

            return result;
        } catch (error) {
            metrics.evaluationFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            recordActivity(
                "evaluation-failed",
                {
                    message:
                        metrics
                            .lastError
                            .message,
                }
            );

            logger?.error(
                "Finance Advisor evaluation failed",
                {
                    error,
                }
            );

            throw error;
        }
    }

    function getPrimaryRecommendation(
        input
    ) {
        return evaluate(
            input
        ).primary;
    }

    function inspect() {
        return {
            service:
                "finance-advisor",

            priorities: {
                ...PRIORITIES,
            },

            categories: {
                ...CATEGORIES,
            },

            actionTypes: {
                ...ACTION_TYPES,
            },

            defaults: {
                ...DEFAULTS,
            },

            liquiditySupport: {
                fundingSources:
                    true,

                unifiedLiquidity:
                    true,

                selfAccessibleFunds:
                    true,

                requestDependentFunds:
                    true,

                lockedFunds:
                    true,

                travelDependentFunds:
                    true,
            },

            lastEvaluation:
                cloneValue(
                    metrics.lastEvaluation
                ),

            lastPrimaryRecommendation:
                cloneValue(
                    metrics
                        .lastPrimaryRecommendation
                ),

            metrics: {
                ...metrics,

                lastEvaluation:
                    undefined,

                lastPrimaryRecommendation:
                    undefined,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
                        : null,
            },

            events: {
                ...EVENT_NAMES,
            },
        };
    }

    const financeAdvisor =
        Object.freeze({
            priorities:
                PRIORITIES,

            categories:
                CATEGORIES,

            actionTypes:
                ACTION_TYPES,

            events:
                EVENT_NAMES,

            evaluate,

            getPrimaryRecommendation,

            inspect,
        });

    TACTIC.services.financeAdvisor =
        financeAdvisor;

    health?.register?.({
        name:
            SERVICE_NAME,

        type:
            health.types
                ?.SERVICE ||
            "service",

        status:
            TACTIC
                .HEALTH_STATES
                ?.HEALTHY ||
            "healthy",

        staleAfterMs:
            null,

        metadata: {
            serviceName:
                "financeAdvisor",

            priorities:
                Object.values(
                    PRIORITIES
                ),

            categories:
                Object.values(
                    CATEGORIES
                ),

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Finance Advisor loaded",
        {
            categories:
                Object.values(
                    CATEGORIES
                ),

            actionTypes:
                Object.values(
                    ACTION_TYPES
                ),
        }
    );
})();