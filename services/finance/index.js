/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/finance/index.js
 *
 * Purpose:
 * Provides reusable financial calculations, projections, and
 * recommendation logic for TACTIC applications.
 *
 * Responsibilities:
 * - Normalize investment terms and percentages
 * - Calculate projected investment profit and payout
 * - Compare multiple investment opportunities
 * - Rank investments by return, liquidity, APR, and balance
 * - Estimate principal from a verified payout
 * - Calculate simple and effective annualized returns
 * - Produce transparent recommendation results
 * - Expose diagnostics and calculation metrics
 *
 * Does NOT:
 * - Read Torn's DOM
 * - Know Torn selectors or page routes
 * - Store financial account data
 * - Submit or prepare financial transactions
 * - Assume the current rate was used for an active investment
 * - Render application interfaces
 *
 * Public API:
 * - TACTIC.services.finance
 * - calculateInvestment()
 * - compareInvestments()
 * - recommendInvestment()
 * - estimatePrincipalFromPayout()
 * - calculateCompoundProjection()
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
            "[TACTIC Finance Engine] Namespace is unavailable."
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
        "service:finance";

    const DAYS_PER_YEAR =
        365;

    const STRATEGIES =
        Object.freeze({
            MAXIMUM_RETURN:
                "maximum-return",

            BALANCED:
                "balanced",

            MAXIMUM_LIQUIDITY:
                "maximum-liquidity",

            HIGHEST_APR:
                "highest-apr",
        });

    const EVENT_NAMES =
        Object.freeze({
            CALCULATION_COMPLETED:
                "finance:calculation-completed",

            COMPARISON_COMPLETED:
                "finance:comparison-completed",

            RECOMMENDATION_CREATED:
                "finance:recommendation-created",
        });

    const DEFAULT_BALANCED_WEIGHTS =
        Object.freeze({
            totalProfit:
                0.45,

            apr:
                0.30,

            liquidity:
                0.25,
        });

    const metrics = {
        loadedAt:
            Date.now(),

        investmentCalculations:
            0,

        comparisons:
            0,

        recommendations:
            0,

        principalEstimates:
            0,

        compoundProjections:
            0,

        fundingSourceSnapshots:
            0,

        liquiditySnapshots:
            0,

        affordabilityEvaluations:
            0,

        validationFailures:
            0,

        calculationFailures:
            0,

        lastActivityAt:
            Date.now(),

        lastCalculationAt:
            null,

        lastComparisonAt:
            null,

        lastRecommendationAt:
            null,

        lastPrincipalEstimateAt:
            null,

        lastCompoundProjectionAt:
            null,

        lastFundingSourceSnapshotAt:
            null,

        lastLiquiditySnapshotAt:
            null,

        lastAffordabilityEvaluationAt:
            null,

        lastError:
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

                    investmentCalculations:
                        metrics
                            .investmentCalculations,

                    comparisons:
                        metrics.comparisons,

                    recommendations:
                        metrics
                            .recommendations,

                    ...metadata,
                },
            }
        );
    }

    function requireFiniteNumber(
        value,
        label,
        options = {}
    ) {
        const numeric =
            Number(
                value
            );

        if (
            !Number.isFinite(
                numeric
            )
        ) {
            metrics.validationFailures +=
                1;

            throw new TypeError(
                `${label} must be a finite number.`
            );
        }

        if (
            options.minimum !==
                undefined &&
            numeric <
                options.minimum
        ) {
            metrics.validationFailures +=
                1;

            throw new RangeError(
                `${label} must be at least ${options.minimum}.`
            );
        }

        if (
            options.maximum !==
                undefined &&
            numeric >
                options.maximum
        ) {
            metrics.validationFailures +=
                1;

            throw new RangeError(
                `${label} must not exceed ${options.maximum}.`
            );
        }

        return numeric;
    }

    function normalizePercentage(
        value,
        label =
            "Percentage"
    ) {
        return requireFiniteNumber(
            value,
            label,
            {
                minimum:
                    0,
            }
        );
    }

    function percentageToRate(
        percentage
    ) {
        return (
            normalizePercentage(
                percentage
            ) /
            100
        );
    }

    function rateToPercentage(
        rate
    ) {
        return (
            requireFiniteNumber(
                rate,
                "Rate"
            ) *
            100
        );
    }

    function roundMoney(
        value
    ) {
        return Math.round(
            requireFiniteNumber(
                value,
                "Money value"
            )
        );
    }

    function roundDecimal(
        value,
        digits =
            4
    ) {
        const numeric =
            requireFiniteNumber(
                value,
                "Decimal value"
            );

        const normalizedDigits =
            Math.max(
                0,
                Math.min(
                    12,
                    Math.floor(
                        Number(
                            digits
                        ) ||
                        0
                    )
                )
            );

        const multiplier =
            10 **
            normalizedDigits;

        return (
            Math.round(
                numeric *
                multiplier
            ) /
            multiplier
        );
    }

    function normalizeStrategy(
        strategy
    ) {
        const normalized =
            String(
                strategy ||
                STRATEGIES
                    .MAXIMUM_RETURN
            )
                .trim()
                .toLowerCase();

        if (
            !Object.values(
                STRATEGIES
            ).includes(
                normalized
            )
        ) {
            throw new Error(
                `Unsupported Finance strategy: ${String(strategy)}`
            );
        }

        return normalized;
    }

    function normalizeOptionId(
        value,
        fallbackIndex =
            0
    ) {
        const normalized =
            String(
                value ||
                ""
            )
                .trim()
                .toLowerCase()
                .replace(
                    /[^a-z0-9]+/g,
                    "-"
                )
                .replace(
                    /^-+|-+$/g,
                    ""
                );

        return (
            normalized ||
            `investment-option-${fallbackIndex + 1}`
        );
    }

    function normalizeInvestmentOption(
        option,
        index =
            0
    ) {
        if (
            !option ||
            typeof option !==
                "object" ||
            Array.isArray(
                option
            )
        ) {
            throw new TypeError(
                "Investment option must be an object."
            );
        }

        const label =
            String(
                option.label ||
                option.name ||
                option.id ||
                `Option ${index + 1}`
            ).trim();

        const days =
            requireFiniteNumber(
                option.days,
                `${label} duration`,
                {
                    minimum:
                        1,
                }
            );

        const profitPercent =
            normalizePercentage(
                option.profitPercent,
                `${label} profit percentage`
            );

        let aprPercent =
            null;

        if (
            option.aprPercent !==
                undefined &&
            option.aprPercent !==
                null &&
            option.aprPercent !==
                ""
        ) {
            aprPercent =
                normalizePercentage(
                    option.aprPercent,
                    `${label} APR`
                );
        }

        if (
            aprPercent ===
            null
        ) {
            aprPercent =
                profitPercent *
                (
                    DAYS_PER_YEAR /
                    days
                );
        }

        return {
            id:
                normalizeOptionId(
                    option.id ||
                    label,
                    index
                ),

            label,

            days,

            profitPercent,

            aprPercent,

            source:
                option.source ||
                "provided",

            verified:
                option.verified ===
                true,

            metadata: {
                ...(
                    option.metadata ||
                    {}
                ),
            },
        };
    }

    function calculateEffectiveAnnualPercent({
        profitPercent,
        days,
    }) {
        const normalizedProfit =
            normalizePercentage(
                profitPercent,
                "Term profit percentage"
            );

        const normalizedDays =
            requireFiniteNumber(
                days,
                "Investment duration",
                {
                    minimum:
                        1,
                }
            );

        const termRate =
            percentageToRate(
                normalizedProfit
            );

        const termsPerYear =
            DAYS_PER_YEAR /
            normalizedDays;

        const effectiveRate =
            (
                1 +
                termRate
            ) **
                termsPerYear -
            1;

        return roundDecimal(
            rateToPercentage(
                effectiveRate
            ),
            4
        );
    }

    function calculateInvestment(
        principal,
        investmentOption,
        options = {}
    ) {
        metrics.investmentCalculations +=
            1;

        metrics.lastCalculationAt =
            Date.now();

        try {
            const normalizedPrincipal =
                requireFiniteNumber(
                    principal,
                    "Investment principal",
                    {
                        minimum:
                            0,
                    }
                );

            const normalizedOption =
                normalizeInvestmentOption(
                    investmentOption
                );

            const profitRate =
                percentageToRate(
                    normalizedOption
                        .profitPercent
                );

            const profit =
                normalizedPrincipal *
                profitRate;

            const payout =
                normalizedPrincipal +
                profit;

            const profitPerDay =
                profit /
                normalizedOption.days;

            const simpleAnnualizedPercent =
                normalizedOption
                    .profitPercent *
                (
                    DAYS_PER_YEAR /
                    normalizedOption.days
                );

            const effectiveAnnualPercent =
                calculateEffectiveAnnualPercent({
                    profitPercent:
                        normalizedOption
                            .profitPercent,

                    days:
                        normalizedOption
                            .days,
                });

            const startedAt =
                Number.isFinite(
                    options.startedAt
                )
                    ? Number(
                          options.startedAt
                      )
                    : null;

            const maturesAt =
                startedAt !==
                null
                    ? startedAt +
                      normalizedOption
                          .days *
                          24 *
                          60 *
                          60 *
                          1000
                    : null;

            const result = {
                principal: {
                    value:
                        roundMoney(
                            normalizedPrincipal
                        ),

                    source:
                        options.principalSource ||
                        "provided",

                    estimated:
                        options.principalEstimated ===
                        true,

                    verified:
                        options.principalVerified ===
                        true,
                },

                option:
                    normalizedOption,

                profit: {
                    value:
                        roundMoney(
                            profit
                        ),

                    rate:
                        roundDecimal(
                            profitRate,
                            8
                        ),

                    percent:
                        roundDecimal(
                            normalizedOption
                                .profitPercent,
                            4
                        ),

                    perDay:
                        roundMoney(
                            profitPerDay
                        ),
                },

                payout: {
                    value:
                        roundMoney(
                            payout
                        ),

                    estimated:
                        options.payoutEstimated !==
                        false,

                    verified:
                        options.payoutVerified ===
                        true,
                },

                annualized: {
                    displayedAprPercent:
                        roundDecimal(
                            normalizedOption
                                .aprPercent,
                            4
                        ),

                    simplePercent:
                        roundDecimal(
                            simpleAnnualizedPercent,
                            4
                        ),

                    effectivePercent:
                        effectiveAnnualPercent,
                },

                timing: {
                    days:
                        normalizedOption
                            .days,

                    startedAt,

                    maturesAt,

                    durationMs:
                        normalizedOption
                            .days *
                        24 *
                        60 *
                        60 *
                        1000,
                },

                liquidity: {
                    lockedDays:
                        normalizedOption
                            .days,

                    score:
                        roundDecimal(
                            1 /
                                normalizedOption
                                    .days,
                            8
                        ),
                },

                calculatedAt:
                    Date.now(),
            };

            recordActivity(
                "investment-calculated",
                {
                    optionId:
                        normalizedOption.id,

                    principal:
                        result.principal
                            .value,

                    profit:
                        result.profit
                            .value,

                    payout:
                        result.payout
                            .value,
                }
            );

            events?.emit?.(
                EVENT_NAMES
                    .CALCULATION_COMPLETED,
                cloneValue(
                    result
                )
            );

            return result;
        } catch (error) {
            metrics.calculationFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            recordActivity(
                "investment-calculation-failed",
                {
                    message:
                        metrics
                            .lastError
                            .message,
                }
            );

            throw error;
        }
    }

    function normalizeScores(
        calculations,
        valueSelector,
        options = {}
    ) {
        const values =
            calculations.map(
                calculation =>
                    Number(
                        valueSelector(
                            calculation
                        )
                    )
            );

        const finiteValues =
            values.filter(
                Number.isFinite
            );

        if (
            finiteValues.length ===
            0
        ) {
            return calculations.map(
                () => 0
            );
        }

        const minimum =
            Math.min(
                ...finiteValues
            );

        const maximum =
            Math.max(
                ...finiteValues
            );

        if (
            maximum ===
            minimum
        ) {
            return calculations.map(
                () => 1
            );
        }

        return values.map(
            value => {
                if (
                    !Number.isFinite(
                        value
                    )
                ) {
                    return 0;
                }

                const normalized =
                    (
                        value -
                        minimum
                    ) /
                    (
                        maximum -
                        minimum
                    );

                return options.inverse ===
                    true
                    ? 1 -
                          normalized
                    : normalized;
            }
        );
    }

    function normalizeBalancedWeights(
        weights = {}
    ) {
        const candidate = {
            totalProfit:
                weights.totalProfit ??
                DEFAULT_BALANCED_WEIGHTS
                    .totalProfit,

            apr:
                weights.apr ??
                DEFAULT_BALANCED_WEIGHTS
                    .apr,

            liquidity:
                weights.liquidity ??
                DEFAULT_BALANCED_WEIGHTS
                    .liquidity,
        };

        for (
            const [
                key,
                value,
            ] of Object.entries(
                candidate
            )
        ) {
            candidate[key] =
                requireFiniteNumber(
                    value,
                    `Balanced ${key} weight`,
                    {
                        minimum:
                            0,
                    }
                );
        }

        const total =
            candidate.totalProfit +
            candidate.apr +
            candidate.liquidity;

        if (
            total <=
            0
        ) {
            throw new Error(
                "Balanced strategy weights must total more than zero."
            );
        }

        return {
            totalProfit:
                candidate.totalProfit /
                total,

            apr:
                candidate.apr /
                total,

            liquidity:
                candidate.liquidity /
                total,
        };
    }

    function compareInvestments(
        principal,
        investmentOptions,
        options = {}
    ) {
        metrics.comparisons +=
            1;

        metrics.lastComparisonAt =
            Date.now();

        if (
            !Array.isArray(
                investmentOptions
            ) ||
            investmentOptions.length ===
                0
        ) {
            metrics.validationFailures +=
                1;

            throw new Error(
                "At least one investment option is required."
            );
        }

        const normalizedPrincipal =
            requireFiniteNumber(
                principal,
                "Comparison principal",
                {
                    minimum:
                        0,
                }
            );

        const calculations =
            investmentOptions.map(
                (
                    investmentOption,
                    index
                ) =>
                    calculateInvestment(
                        normalizedPrincipal,
                        normalizeInvestmentOption(
                            investmentOption,
                            index
                        ),
                        {
                            principalSource:
                                options.principalSource ||
                                "comparison",

                            principalEstimated:
                                options.principalEstimated ===
                                true,

                            principalVerified:
                                options.principalVerified ===
                                true,
                        }
                    )
            );

        const profitScores =
            normalizeScores(
                calculations,
                calculation =>
                    calculation.profit
                        .value
            );

        const aprScores =
            normalizeScores(
                calculations,
                calculation =>
                    calculation
                        .annualized
                        .displayedAprPercent
            );

        const liquidityScores =
            normalizeScores(
                calculations,
                calculation =>
                    calculation.timing
                        .days,
                {
                    inverse:
                        true,
                }
            );

        const balancedWeights =
            normalizeBalancedWeights(
                options
                    .balancedWeights
            );

        const ranked =
            calculations.map(
                (
                    calculation,
                    index
                ) => {
                    const balancedScore =
                        profitScores[index] *
                            balancedWeights
                                .totalProfit +
                        aprScores[index] *
                            balancedWeights
                                .apr +
                        liquidityScores[index] *
                            balancedWeights
                                .liquidity;

                    return {
                        ...calculation,

                        scores: {
                            totalProfit:
                                roundDecimal(
                                    profitScores[
                                        index
                                    ],
                                    6
                                ),

                            apr:
                                roundDecimal(
                                    aprScores[
                                        index
                                    ],
                                    6
                                ),

                            liquidity:
                                roundDecimal(
                                    liquidityScores[
                                        index
                                    ],
                                    6
                                ),

                            balanced:
                                roundDecimal(
                                    balancedScore,
                                    6
                                ),
                        },
                    };
                }
            );

        function highestBy(
            selector
        ) {
            return [
                ...ranked,
            ].sort(
                (
                    first,
                    second
                ) => {
                    const difference =
                        selector(
                            second
                        ) -
                        selector(
                            first
                        );

                    if (
                        difference !==
                        0
                    ) {
                        return difference;
                    }

                    return (
                        first.timing
                            .days -
                        second.timing
                            .days
                    );
                }
            )[0];
        }

        function shortestByDays() {
            return [
                ...ranked,
            ].sort(
                (
                    first,
                    second
                ) =>
                    first.timing.days -
                        second.timing
                            .days ||
                    second.profit.value -
                        first.profit.value
            )[0];
        }

        const best = {
            maximumReturn:
                highestBy(
                    calculation =>
                        calculation
                            .profit
                            .value
                ),

            highestApr:
                highestBy(
                    calculation =>
                        calculation
                            .annualized
                            .displayedAprPercent
                ),

            maximumLiquidity:
                shortestByDays(),

            balanced:
                highestBy(
                    calculation =>
                        calculation
                            .scores
                            .balanced
                ),
        };

        const result = {
            principal: {
                value:
                    roundMoney(
                        normalizedPrincipal
                    ),

                estimated:
                    options.principalEstimated ===
                    true,

                verified:
                    options.principalVerified ===
                    true,

                source:
                    options.principalSource ||
                    "provided",
            },

            optionCount:
                ranked.length,

            options:
                ranked,

            best:
                cloneValue(
                    best
                ),

            balancedWeights,

            comparedAt:
                Date.now(),
        };

        recordActivity(
            "investments-compared",
            {
                principal:
                    result.principal
                        .value,

                optionCount:
                    result.optionCount,

                maximumReturnOption:
                    best.maximumReturn
                        ?.option
                        ?.id ||
                    null,

                balancedOption:
                    best.balanced
                        ?.option
                        ?.id ||
                    null,
            }
        );

        events?.emit?.(
            EVENT_NAMES
                .COMPARISON_COMPLETED,
            cloneValue(
                result
            )
        );

        return result;
    }

    function buildRecommendationReason(
        strategy,
        selected,
        comparison
    ) {
        const option =
            selected.option;

        switch (strategy) {
            case STRATEGIES
                .MAXIMUM_LIQUIDITY:
                return (
                    `${option.label} returns the funds in ` +
                    `${option.days} days, making it the most liquid current option.`
                );

            case STRATEGIES
                .HIGHEST_APR:
                return (
                    `${option.label} has the highest displayed APR at ` +
                    `${roundDecimal(
                        selected
                            .annualized
                            .displayedAprPercent,
                        2
                    )}%.`
                );

            case STRATEGIES
                .BALANCED:
                return (
                    `${option.label} provides the strongest combined score for ` +
                    "total profit, displayed APR, and access to the funds."
                );

            case STRATEGIES
                .MAXIMUM_RETURN:
            default:
                return (
                    `${option.label} produces the highest projected term profit ` +
                    `of ${selected.profit.value.toLocaleString(
                        "en-US"
                    )}.`
                );
        }
    }

    function recommendInvestment(
        principal,
        investmentOptions,
        options = {}
    ) {
        metrics.recommendations +=
            1;

        metrics.lastRecommendationAt =
            Date.now();

        const strategy =
            normalizeStrategy(
                options.strategy
            );

        const comparison =
            compareInvestments(
                principal,
                investmentOptions,
                options
            );

        let selected;

        switch (strategy) {
            case STRATEGIES
                .BALANCED:
                selected =
                    comparison.best
                        .balanced;
                break;

            case STRATEGIES
                .MAXIMUM_LIQUIDITY:
                selected =
                    comparison.best
                        .maximumLiquidity;
                break;

            case STRATEGIES
                .HIGHEST_APR:
                selected =
                    comparison.best
                        .highestApr;
                break;

            case STRATEGIES
                .MAXIMUM_RETURN:
            default:
                selected =
                    comparison.best
                        .maximumReturn;
                break;
        }

        const alternatives =
            comparison.options
                .filter(
                    calculation =>
                        calculation
                            .option
                            .id !==
                        selected.option.id
                )
                .sort(
                    (
                        first,
                        second
                    ) =>
                        second.profit
                            .value -
                        first.profit
                            .value
                );

        const result = {
            strategy,

            recommendation: {
                option:
                    cloneValue(
                        selected.option
                    ),

                principal:
                    cloneValue(
                        selected.principal
                    ),

                profit:
                    cloneValue(
                        selected.profit
                    ),

                payout:
                    cloneValue(
                        selected.payout
                    ),

                annualized:
                    cloneValue(
                        selected
                            .annualized
                    ),

                timing:
                    cloneValue(
                        selected.timing
                    ),

                scores:
                    cloneValue(
                        selected.scores
                    ),

                reason:
                    buildRecommendationReason(
                        strategy,
                        selected,
                        comparison
                    ),
            },

            alternatives:
                alternatives.map(
                    calculation => ({
                        option:
                            cloneValue(
                                calculation.option
                            ),

                        profit:
                            cloneValue(
                                calculation.profit
                            ),

                        payout:
                            cloneValue(
                                calculation.payout
                            ),

                        annualized:
                            cloneValue(
                                calculation
                                    .annualized
                            ),

                        timing:
                            cloneValue(
                                calculation.timing
                            ),

                        scores:
                            cloneValue(
                                calculation.scores
                            ),
                    })
                ),

            comparison,

            createdAt:
                Date.now(),
        };

        recordActivity(
            "investment-recommended",
            {
                strategy,

                optionId:
                    result
                        .recommendation
                        .option
                        .id,

                projectedProfit:
                    result
                        .recommendation
                        .profit
                        .value,
            }
        );

        events?.emit?.(
            EVENT_NAMES
                .RECOMMENDATION_CREATED,
            cloneValue(
                result
            )
        );

        return result;
    }

    function estimatePrincipalFromPayout({
        payout,
        profitPercent,
        options = {},
    }) {
        metrics.principalEstimates +=
            1;

        metrics.lastPrincipalEstimateAt =
            Date.now();

        const normalizedPayout =
            requireFiniteNumber(
                payout,
                "Investment payout",
                {
                    minimum:
                        0,
                }
            );

        const normalizedProfitPercent =
            normalizePercentage(
                profitPercent,
                "Investment profit percentage"
            );

        const multiplier =
            1 +
            percentageToRate(
                normalizedProfitPercent
            );

        if (
            multiplier <=
            0
        ) {
            throw new Error(
                "Investment multiplier must be greater than zero."
            );
        }

        const exactPrincipal =
            normalizedPayout /
            multiplier;

        const roundedPrincipal =
            options.roundTo !==
                undefined
                ? Math.round(
                      exactPrincipal /
                          requireFiniteNumber(
                              options.roundTo,
                              "Principal rounding increment",
                              {
                                  minimum:
                                      1,
                              }
                          )
                  ) *
                  options.roundTo
                : Math.round(
                      exactPrincipal
                  );

        const estimatedProfit =
            normalizedPayout -
            roundedPrincipal;

        const differenceFromExact =
            roundedPrincipal -
            exactPrincipal;

        const result = {
            principal: {
                value:
                    roundedPrincipal,

                exactValue:
                    exactPrincipal,

                estimated:
                    true,

                verified:
                    false,

                source:
                    "calculated-from-payout",
            },

            payout: {
                value:
                    roundMoney(
                        normalizedPayout
                    ),

                verified:
                    options.payoutVerified !==
                    false,
            },

            profit: {
                value:
                    roundMoney(
                        estimatedProfit
                    ),

                estimated:
                    true,

                percent:
                    normalizedProfitPercent,
            },

            rounding: {
                increment:
                    options.roundTo ||
                    1,

                differenceFromExact:
                    roundDecimal(
                        differenceFromExact,
                        4
                    ),
            },

            confidence:
                options.confidence ||
                "estimated",

            calculatedAt:
                Date.now(),
        };

        recordActivity(
            "principal-estimated",
            {
                payout:
                    result.payout.value,

                profitPercent:
                    normalizedProfitPercent,

                estimatedPrincipal:
                    result
                        .principal
                        .value,
            }
        );

        return result;
    }

    function calculateCompoundProjection({
        principal,
        profitPercent,
        termDays,
        totalDays =
            DAYS_PER_YEAR,
        includePartialTerm =
            false,
    }) {
        metrics.compoundProjections +=
            1;

        metrics.lastCompoundProjectionAt =
            Date.now();

        const normalizedPrincipal =
            requireFiniteNumber(
                principal,
                "Compound principal",
                {
                    minimum:
                        0,
                }
            );

        const normalizedProfitPercent =
            normalizePercentage(
                profitPercent,
                "Compound profit percentage"
            );

        const normalizedTermDays =
            requireFiniteNumber(
                termDays,
                "Compound term length",
                {
                    minimum:
                        1,
                }
            );

        const normalizedTotalDays =
            requireFiniteNumber(
                totalDays,
                "Compound projection duration",
                {
                    minimum:
                        0,
                }
            );

        const completeTerms =
            Math.floor(
                normalizedTotalDays /
                normalizedTermDays
            );

        const remainingDays =
            normalizedTotalDays -
            completeTerms *
                normalizedTermDays;

        const termMultiplier =
            1 +
            percentageToRate(
                normalizedProfitPercent
            );

        let endingValue =
            normalizedPrincipal *
            termMultiplier **
                completeTerms;

        let partialTermProfit =
            0;

        if (
            includePartialTerm &&
            remainingDays >
                0
        ) {
            const partialRate =
                percentageToRate(
                    normalizedProfitPercent
                ) *
                (
                    remainingDays /
                    normalizedTermDays
                );

            partialTermProfit =
                endingValue *
                partialRate;

            endingValue +=
                partialTermProfit;
        }

        const profit =
            endingValue -
            normalizedPrincipal;

        const result = {
            principal:
                roundMoney(
                    normalizedPrincipal
                ),

            endingValue:
                roundMoney(
                    endingValue
                ),

            profit:
                roundMoney(
                    profit
                ),

            profitPercent:
                normalizedPrincipal >
                0
                    ? roundDecimal(
                          (
                              profit /
                              normalizedPrincipal
                          ) *
                              100,
                          4
                      )
                    : 0,

            term: {
                days:
                    normalizedTermDays,

                profitPercent:
                    normalizedProfitPercent,

                multiplier:
                    roundDecimal(
                        termMultiplier,
                        8
                    ),
            },

            projection: {
                totalDays:
                    normalizedTotalDays,

                completeTerms,

                remainingDays,

                includePartialTerm,

                partialTermProfit:
                    roundMoney(
                        partialTermProfit
                    ),
            },

            calculatedAt:
                Date.now(),
        };

        recordActivity(
            "compound-projection-calculated",
            {
                principal:
                    result.principal,

                endingValue:
                    result.endingValue,

                completeTerms,
            }
        );

        return result;
    }

function normalizeFundingSource({
    id,
    label,
    amount,
    availability,
    source,
    verified = false,
    estimated = false,
    requiresAction = false,
    action = null,
    metadata = {},
}) {
    const normalizedAmount =
        requireFiniteNumber(
            amount ?? 0,
            `${label || id || "Funding source"} amount`,
            {
                minimum:
                    0,
            }
        );

    return {
        id:
            String(id || "")
                .trim()
                .toLowerCase(),

        label:
            String(
                label ||
                id ||
                "Funding Source"
            ).trim(),

        amount:
            roundMoney(
                normalizedAmount
            ),

        availability:
            String(
                availability ||
                "unavailable"
            )
                .trim()
                .toLowerCase(),

        source:
            source ||
            "provided",

        verified:
            verified ===
            true,

        estimated:
            estimated ===
            true,

        requiresAction:
            requiresAction ===
            true,

        action:
            action
                ? cloneValue(
                      action
                  )
                : null,

        metadata:
            cloneValue(
                metadata
            ) || {},
    };
}

function getFundingSources(
    financialState = {}
) {
    metrics.fundingSourceSnapshots +=
        1;

    metrics.lastFundingSourceSnapshotAt =
        Date.now();

    const wallet =
        financialState.wallet ||
        {};

    const factionVault =
        financialState.factionVault ||
        {};

    const investmentBank =
        financialState.investmentBank ||
        {};

    const cayman =
        financialState.cayman ||
        {};

    const sources = [
        normalizeFundingSource({
            id:
                "wallet",

            label:
                "Wallet",

            amount:
                wallet.amount ??
                wallet.balance ??
                0,

            availability:
                "immediate",

            source:
                wallet.source ||
                "wallet",

            verified:
                wallet.verified ===
                true,

            estimated:
                wallet.estimated ===
                true,

            requiresAction:
                false,

            metadata:
                wallet.metadata ||
                {},
        }),

        normalizeFundingSource({
            id:
                "faction-vault",

            label:
                "Faction Vault",

            amount:
                factionVault.amount ??
                factionVault.balance ??
                0,

            availability:
                "request-dependent",

            source:
                factionVault.source ||
                "faction-vault",

            verified:
                factionVault.verified ===
                true,

            estimated:
                factionVault.estimated ===
                true,

            requiresAction:
                true,

            action: {
                type:
                    "request-transfer",

                description:
                    "Request funds from a faction banker.",
            },

            metadata:
                factionVault.metadata ||
                {},
        }),

        normalizeFundingSource({
            id:
                "investment-bank",

            label:
                "Investment Bank",

            amount:
                investmentBank.amount ??
                investmentBank.balance ??
                investmentBank.principal ??
                0,

            availability:
                "locked",

            source:
                investmentBank.source ||
                "investment-bank",

            verified:
                investmentBank.verified ===
                true,

            estimated:
                investmentBank.estimated ===
                true,

            requiresAction:
                false,

            metadata: {
                ...(
                    investmentBank.metadata ||
                    {}
                ),

                maturesAt:
                    investmentBank.maturesAt ??
                    null,
            },
        }),

        normalizeFundingSource({
            id:
                "cayman",

            label:
                "Cayman",

            amount:
                cayman.amount ??
                cayman.balance ??
                0,

            availability:
                cayman.availability ||
                (
                    (
                        cayman.amount ??
                        cayman.balance
                    ) !==
                    undefined
                        ? "accessible"
                        : "unknown"
                ),

            source:
                cayman.source ||
                "cayman",

            verified:
                cayman.verified ===
                true,

            estimated:
                cayman.estimated ===
                true,

            requiresAction:
                cayman.requiresAction !==
                false,

            action:
                cayman.action ||
                null,

            metadata:
                cayman.metadata ||
                {},
        }),
    ];

    recordActivity(
        "funding-sources-created",
        {
            sourceCount:
                sources.length,
        }
    );

    return sources;
}

function getLiquiditySnapshot(
    financialState = {}
) {
    metrics.liquiditySnapshots +=
        1;

    metrics.lastLiquiditySnapshotAt =
        Date.now();

    const sources =
        getFundingSources(
            financialState
        );

    const immediateSources =
        sources.filter(
            source =>
                source.availability ===
                "immediate"
        );

    const conditionalSources =
        sources.filter(
            source =>
                source.availability ===
                    "request-dependent" ||
                source.availability ===
                    "accessible"
        );

    const lockedSources =
        sources.filter(
            source =>
                source.availability ===
                "locked"
        );

    const immediate =
        immediateSources.reduce(
            (
                total,
                source
            ) =>
                total +
                source.amount,
            0
        );

    const conditional =
        conditionalSources.reduce(
            (
                total,
                source
            ) =>
                total +
                source.amount,
            0
        );

    const locked =
        lockedSources.reduce(
            (
                total,
                source
            ) =>
                total +
                source.amount,
            0
        );

    const result = {
        immediate:
            roundMoney(
                immediate
            ),

        conditional:
            roundMoney(
                conditional
            ),

        accessible:
            roundMoney(
                immediate +
                conditional
            ),

        locked:
            roundMoney(
                locked
            ),

        totalKnown:
            roundMoney(
                immediate +
                conditional +
                locked
            ),

        sources:
            cloneValue(
                sources
            ),

        sourceGroups: {
            immediate:
                immediateSources.map(
                    source =>
                        source.id
                ),

            conditional:
                conditionalSources.map(
                    source =>
                        source.id
                ),

            locked:
                lockedSources.map(
                    source =>
                        source.id
                ),
        },

        calculatedAt:
            Date.now(),
    };

    recordActivity(
        "liquidity-snapshot-created",
        {
            immediate:
                result.immediate,

            conditional:
                result.conditional,

            locked:
                result.locked,
        }
    );

    return result;
}

function evaluateAffordability(
    amount,
    financialState = {}
) {
    metrics.affordabilityEvaluations +=
        1;

    metrics.lastAffordabilityEvaluationAt =
        Date.now();

    const required =
        requireFiniteNumber(
            amount,
            "Required amount",
            {
                minimum:
                    0,
            }
        );

    const liquidity =
        getLiquiditySnapshot(
            financialState
        );

    const immediateShortfall =
        Math.max(
            0,
            required -
                liquidity.immediate
        );

    const accessibleShortfall =
        Math.max(
            0,
            required -
                liquidity.accessible
        );

    let status;
    let affordable;
    let requiresAction;

    if (
        required <=
        liquidity.immediate
    ) {
        status =
            "immediately-affordable";

        affordable =
            true;

        requiresAction =
            false;
    } else if (
        required <=
        liquidity.accessible
    ) {
        status =
            "conditionally-affordable";

        affordable =
            true;

        requiresAction =
            true;
    } else {
        status =
            "not-affordable";

        affordable =
            false;

        requiresAction =
            false;
    }

    let remaining =
        required;

    const fundingPlan = [];

    const usableSources =
        liquidity.sources
            .filter(
                source =>
                    source.availability ===
                        "immediate" ||
                    source.availability ===
                        "request-dependent" ||
                    source.availability ===
                        "accessible"
            )
            .sort(
                (
                    first,
                    second
                ) => {
                    const priority = {
                        immediate:
                            0,

                        accessible:
                            1,

                        "request-dependent":
                            2,
                    };

                    return (
                        (
                            priority[
                                first
                                    .availability
                            ] ??
                            99
                        ) -
                        (
                            priority[
                                second
                                    .availability
                            ] ??
                            99
                        )
                    );
                }
            );

    for (
        const source of
            usableSources
    ) {
        if (
            remaining <=
            0
        ) {
            break;
        }

        if (
            source.amount <=
            0
        ) {
            continue;
        }

        const useAmount =
            Math.min(
                source.amount,
                remaining
            );

        fundingPlan.push({
            sourceId:
                source.id,

            label:
                source.label,

            amount:
                roundMoney(
                    useAmount
                ),

            availability:
                source.availability,

            requiresAction:
                source.requiresAction,

            action:
                cloneValue(
                    source.action
                ),
        });

        remaining -=
            useAmount;
    }

    const result = {
        required:
            roundMoney(
                required
            ),

        affordable,

        status,

        requiresAction,

        immediateShortfall:
            roundMoney(
                immediateShortfall
            ),

        accessibleShortfall:
            roundMoney(
                accessibleShortfall
            ),

        unfunded:
            roundMoney(
                Math.max(
                    0,
                    remaining
                )
            ),

        fundingPlan,

        liquidity,

        evaluatedAt:
            Date.now(),
    };

    recordActivity(
        "affordability-evaluated",
        {
            required:
                result.required,

            affordable:
                result.affordable,

            status:
                result.status,

            requiresAction:
                result.requiresAction,
        }
    );

    return result;
}

    function inspect() {
        return {
            service:
                "finance",

            strategies: {
                ...STRATEGIES,
            },

            defaultBalancedWeights: {
                ...DEFAULT_BALANCED_WEIGHTS,
            },

            constants: {
                daysPerYear:
                    DAYS_PER_YEAR,
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

            events: {
                ...EVENT_NAMES,
            },
        };
    }

    const financeEngine =
        Object.freeze({
            strategies:
                STRATEGIES,

            events:
                EVENT_NAMES,

            calculateInvestment,

            compareInvestments,

            recommendInvestment,

            estimatePrincipalFromPayout,

            calculateCompoundProjection,

            calculateEffectiveAnnualPercent,

            normalizeInvestmentOption,

            percentageToRate,

            rateToPercentage,

            getFundingSources,

            getLiquiditySnapshot,

            evaluateAffordability,

            inspect,
        });

    TACTIC.services.finance =
        financeEngine;

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
                "finance",

            strategies:
                Object.values(
                    STRATEGIES
                ),

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Finance Engine loaded",
        {
            strategies:
                Object.values(
                    STRATEGIES
                ),
        }
    );
})();