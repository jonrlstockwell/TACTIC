/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/bank.js
 *
 * Purpose:
 * Provides verified, read-only DOM access to Torn's Investment
 * Bank page.
 *
 * Responsibilities:
 * - Detect whether the Investment Bank interface is present
 * - Read all currently displayed investment opportunities
 * - Read term profit percentages
 * - Read displayed APR values
 * - Detect an active investment
 * - Read the verified maturity payout
 * - Read and parse the live remaining-time countdown
 * - Identify the selected investment term
 * - Expose normalized page data and diagnostics
 *
 * Does NOT:
 * - Estimate principal or active-investment profit
 * - Recommend an investment
 * - Select an investment term
 * - Fill the investment amount
 * - Click Invest
 * - Withdraw a matured investment
 * - Submit or confirm any transaction
 *
 * Public API:
 * - TACTIC.services.dom.pages.getHelper("investment-bank")
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Investment Bank] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (!dom) {
        console.error(
            "[TACTIC DOM Investment Bank] DOM service is unavailable."
        );

        return;
    }

    if (
        !dom.pages ||
        typeof dom.pages.registerHelper !==
            "function"
    ) {
        console.error(
            "[TACTIC DOM Investment Bank] DOM page-helper registry is unavailable."
        );

        return;
    }

    const HELPER_ID =
        "investment-bank";

    /*
     * These selectors were verified against the active
     * Investment Bank interface.
     *
     * They remain local to this helper for now. We can move them
     * into the central selector catalog after the Bank feature
     * has been exercised against both active and inactive states.
     */
    const SELECTORS =
        Object.freeze({
            ROOT:
                ".invest-wrap",

            CONTENT:
                ".invest-cont",

            TERM_SELECT:
                ".invest-cont select",

            TERM_OPTIONS:
                ".invest-cont select option",

            SELECTED_TERM_DISPLAY:
                ".invest-cont .ui-selectmenu-status",

            ACTIVE_INVESTMENT:
                ".invest-cont .invest-success",

            ACTIVE_PAYOUT:
                ".invest-cont .invest-success .profit",

            ACTIVE_COUNTDOWN:
                ".invest-cont .invest-success .counter.hasCountdown",

            ACTIVE_COUNTDOWN_ROW:
                ".invest-cont .invest-success p.m-clear",

            INVEST_BUTTON:
                ".invest-cont .invest-head-wrap button.torn-btn",

            AMOUNT_INPUT:
                ".invest-cont .money-wrap input.money.input-money",

            APR_LIST:
                ".invest-cont .diagram-desc",

            APR_ROWS:
                ".invest-cont .diagram-desc li",

            ACTIVE_APR_ROW:
                ".invest-cont .diagram-desc li.bold",

            OPPORTUNITY_VALUE:
                ".invest-cont .values li.act",
        });

    const TERM_IDS =
        Object.freeze({
            "one week":
                "one-week",

            "two weeks":
                "two-weeks",

            "one month":
                "one-month",

            "two months":
                "two-months",

            "three months":
                "three-months",
        });

    const TERM_DAYS =
        Object.freeze({
            "one week":
                7,

            "two weeks":
                14,

            "one month":
                30,

            "two months":
                60,

            "three months":
                90,
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

        optionReads:
            0,

        activeInvestmentReads:
            0,

        snapshotReads:
            0,

        countdownParses:
            0,

        countdownParseFailures:
            0,

        moneyParses:
            0,

        moneyParseFailures:
            0,

        percentageParses:
            0,

        percentageParseFailures:
            0,

        lastActivityAt:
            Date.now(),

        lastOperation:
            null,

        lastOptionCount:
            0,

        lastActiveState:
            null,

        lastSnapshotAt:
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
        metrics.lastOperation =
            operation;

        metrics.lastActivityAt =
            Date.now();

        logger?.debug(
            `Investment Bank DOM helper: ${operation}`,
            metadata
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

    function find(
        selector,
        root =
            document
    ) {
        if (
            !selector ||
            !root
        ) {
            return null;
        }

        if (
            typeof dom.find ===
            "function"
        ) {
            return dom.find(
                selector,
                {
                    root,
                }
            );
        }

        return root.querySelector(
            selector
        );
    }

    function findAll(
        selector,
        root =
            document
    ) {
        if (
            !selector ||
            !root
        ) {
            return [];
        }

        if (
            typeof dom.findAll ===
            "function"
        ) {
            return dom.findAll(
                selector,
                {
                    root,
                }
            );
        }

        return Array.from(
            root.querySelectorAll(
                selector
            )
        );
    }

    /*
     * Some versions of the DOM service may not accept a root
     * option. Use direct querySelector as a safe local fallback.
     */
    function query(
        selector,
        root =
            document
    ) {
        try {
            return (
                root.querySelector(
                    selector
                ) ||
                find(
                    selector,
                    root
                )
            );
        } catch {
            return null;
        }
    }

    function queryAll(
        selector,
        root =
            document
    ) {
        try {
            return Array.from(
                root.querySelectorAll(
                    selector
                )
            );
        } catch {
            return findAll(
                selector,
                root
            );
        }
    }

    function getRoot() {
        return query(
            SELECTORS.ROOT
        );
    }

    function getContent() {
        return query(
            SELECTORS.CONTENT
        );
    }

    function getTermSelect() {
        return query(
            SELECTORS.TERM_SELECT
        );
    }

    function getTermOptionElements() {
        return queryAll(
            SELECTORS.TERM_OPTIONS
        );
    }

    function getSelectedTermDisplay() {
        return query(
            SELECTORS
                .SELECTED_TERM_DISPLAY
        );
    }

    function getActiveInvestmentElement() {
        return query(
            SELECTORS
                .ACTIVE_INVESTMENT
        );
    }

    function getActivePayoutElement() {
        return query(
            SELECTORS.ACTIVE_PAYOUT
        );
    }

    function getCountdownElement() {
        return query(
            SELECTORS
                .ACTIVE_COUNTDOWN
        );
    }

    function getInvestButton() {
        return query(
            SELECTORS.INVEST_BUTTON
        );
    }

    function getAmountInput() {
        return query(
            SELECTORS.AMOUNT_INPUT
        );
    }

    function getAprRows() {
        return queryAll(
            SELECTORS.APR_ROWS
        );
    }

    function getActiveAprRow() {
        return query(
            SELECTORS
                .ACTIVE_APR_ROW
        );
    }

    function parseMoney(
        value
    ) {
        metrics.moneyParses +=
            1;

        const normalized =
            normalizeText(
                value
            );

        if (!normalized) {
            metrics.moneyParseFailures +=
                1;

            return null;
        }

        const numericText =
            normalized.replace(
                /[^0-9.-]/g,
                ""
            );

        if (
            !numericText ||
            numericText ===
                "-" ||
            numericText ===
                "." ||
            numericText ===
                "-."
        ) {
            metrics.moneyParseFailures +=
                1;

            return null;
        }

        const numeric =
            Number(
                numericText
            );

        if (
            !Number.isFinite(
                numeric
            )
        ) {
            metrics.moneyParseFailures +=
                1;

            return null;
        }

        return Math.round(
            numeric
        );
    }

    function parsePercentage(
        value
    ) {
        metrics.percentageParses +=
            1;

        const match =
            normalizeText(
                value
            ).match(
                /(-?\d+(?:\.\d+)?)\s*%/
            );

        if (!match) {
            metrics
                .percentageParseFailures +=
                1;

            return null;
        }

        const numeric =
            Number(
                match[1]
            );

        if (
            !Number.isFinite(
                numeric
            )
        ) {
            metrics
                .percentageParseFailures +=
                1;

            return null;
        }

        return numeric;
    }

    function normalizeTermLabel(
        value
    ) {
        return normalizeText(
            value
        )
            .replace(
                /\([^)]*\)/g,
                ""
            )
            .trim()
            .toLowerCase();
    }

    function getTermDays(
        termLabel
    ) {
        const normalized =
            normalizeTermLabel(
                termLabel
            );

        if (
            TERM_DAYS[
                normalized
            ] !==
            undefined
        ) {
            return TERM_DAYS[
                normalized
            ];
        }

        const weekMatch =
            normalized.match(
                /(\d+)\s*weeks?/
            );

        if (weekMatch) {
            return (
                Number(
                    weekMatch[1]
                ) *
                7
            );
        }

        const monthMatch =
            normalized.match(
                /(\d+)\s*months?/
            );

        if (monthMatch) {
            return (
                Number(
                    monthMatch[1]
                ) *
                30
            );
        }

        if (
            normalized.includes(
                "one week"
            )
        ) {
            return 7;
        }

        if (
            normalized.includes(
                "two weeks"
            )
        ) {
            return 14;
        }

        if (
            normalized.includes(
                "one month"
            )
        ) {
            return 30;
        }

        if (
            normalized.includes(
                "two months"
            )
        ) {
            return 60;
        }

        if (
            normalized.includes(
                "three months"
            )
        ) {
            return 90;
        }

        return null;
    }

    function getTermId(
        termLabel,
        fallbackIndex =
            0
    ) {
        const normalized =
            normalizeTermLabel(
                termLabel
            );

        if (
            TERM_IDS[
                normalized
            ]
        ) {
            return TERM_IDS[
                normalized
            ];
        }

        const slug =
            normalized
                .replace(
                    /[^a-z0-9]+/g,
                    "-"
                )
                .replace(
                    /^-+|-+$/g,
                    ""
                );

        return (
            slug ||
            `investment-option-${fallbackIndex + 1}`
        );
    }

    function parseTermOptionText(
        value,
        index =
            0
    ) {
        const text =
            normalizeText(
                value
            );

        if (
            !text ||
            /please select/i.test(
                text
            )
        ) {
            return null;
        }

        const label =
            normalizeText(
                text.replace(
                    /\([^)]*\)/g,
                    ""
                )
            );

        const profitPercent =
            parsePercentage(
                text
            );

        const days =
            getTermDays(
                label
            );

        if (
            !label ||
            !Number.isFinite(
                days
            ) ||
            !Number.isFinite(
                profitPercent
            )
        ) {
            return null;
        }

        return {
            id:
                getTermId(
                    label,
                    index
                ),

            label,

            days,

            profitPercent,

            rawText:
                text,

            source:
                "term-option",

            verified:
                true,
        };
    }

    function parseAprRow(
        element,
        index =
            0
    ) {
        const text =
            normalizeText(
                element?.textContent
            );

        if (!text) {
            return null;
        }

        const match =
            text.match(
                /^(.+?)\s*:\s*(-?\d+(?:\.\d+)?)\s*%\s*APR$/i
            );

        if (!match) {
            return null;
        }

        const shortLabel =
            normalizeText(
                match[1]
            );

        const aprPercent =
            Number(
                match[2]
            );

        if (
            !Number.isFinite(
                aprPercent
            )
        ) {
            return null;
        }

        const className =
            String(
                element.className ||
                ""
            );

        return {
            index,

            shortLabel,

            aprPercent,

            selected:
                className
                    .split(/\s+/)
                    .includes(
                        "bold"
                    ),

            rawText:
                text,

            source:
                "apr-chart",

            verified:
                true,
        };
    }

    function mapAprToOption(
        option,
        aprRows
    ) {
        const expectedShortLabels =
            [];

        if (
            option.days ===
            7
        ) {
            expectedShortLabels.push(
                "1w"
            );
        } else if (
            option.days ===
            14
        ) {
            expectedShortLabels.push(
                "2w"
            );
        } else if (
            option.days ===
            30
        ) {
            expectedShortLabels.push(
                "1m"
            );
        } else if (
            option.days ===
            60
        ) {
            expectedShortLabels.push(
                "2m"
            );
        } else if (
            option.days ===
            90
        ) {
            expectedShortLabels.push(
                "3m"
            );
        }

        const matched =
            aprRows.find(
                row =>
                    expectedShortLabels.includes(
                        row.shortLabel
                            .toLowerCase()
                    )
            );

        return {
            ...option,

            aprPercent:
                matched
                    ?.aprPercent ??
                null,

            aprVerified:
                Boolean(
                    matched
                ),

            selected:
                matched
                    ?.selected ===
                true,

            aprRawText:
                matched
                    ?.rawText ||
                null,
        };
    }

    function getInvestmentOptions() {
        metrics.optionReads +=
            1;

        const termOptions =
            getTermOptionElements()
                .map(
                    (
                        element,
                        index
                    ) =>
                        parseTermOptionText(
                            element.textContent,
                            index
                        )
                )
                .filter(
                    Boolean
                );

        const aprRows =
            getAprRows()
                .map(
                    (
                        element,
                        index
                    ) =>
                        parseAprRow(
                            element,
                            index
                        )
                )
                .filter(
                    Boolean
                );

        const options =
            termOptions.map(
                option =>
                    mapAprToOption(
                        option,
                        aprRows
                    )
            );

        metrics.lastOptionCount =
            options.length;

        recordActivity(
            "investment-options-read",
            {
                optionCount:
                    options.length,

                aprRowCount:
                    aprRows.length,
            }
        );

        return options;
    }

    function parseCountdown(
        value
    ) {
        metrics.countdownParses +=
            1;

        const text =
            normalizeText(
                value
            );

        if (!text) {
            metrics
                .countdownParseFailures +=
                1;

            return null;
        }

        function readUnit(
            unit
        ) {
            const match =
                text.match(
                    new RegExp(
                        `(\\d+)\\s+${unit}s?`,
                        "i"
                    )
                );

            return match
                ? Number(
                      match[1]
                  )
                : 0;
        }

        const days =
            readUnit(
                "day"
            );

        const hours =
            readUnit(
                "hour"
            );

        const minutes =
            readUnit(
                "minute"
            );

        const seconds =
            readUnit(
                "second"
            );

        if (
            days === 0 &&
            hours === 0 &&
            minutes === 0 &&
            seconds === 0 &&
            !/\b0\s+seconds?\b/i.test(
                text
            )
        ) {
            metrics
                .countdownParseFailures +=
                1;

            return null;
        }

        const totalSeconds =
            days *
                86_400 +
            hours *
                3_600 +
            minutes *
                60 +
            seconds;

        const milliseconds =
            totalSeconds *
            1_000;

        const observedAt =
            Date.now();

        return {
            text,

            days,

            hours,

            minutes,

            seconds,

            totalSeconds,

            milliseconds,

            observedAt,

            estimatedMaturesAt:
                observedAt +
                milliseconds,

            source:
                "live-countdown",

            verified:
                true,
        };
    }

    function getSelectedTerm() {
        const displayElement =
            getSelectedTermDisplay();

        const select =
            getTermSelect();

        const selectedOption =
            select?.selectedOptions?.[0] ||
            null;

        const displayText =
            normalizeText(
                displayElement
                    ?.textContent
            );

        const optionText =
            normalizeText(
                selectedOption
                    ?.textContent
            );

        const rawText =
            displayText ||
            optionText;

        const parsed =
            parseTermOptionText(
                rawText
            );

        if (!parsed) {
            return null;
        }

        return {
            ...parsed,

            source:
                displayText
                    ? "selected-term-display"
                    : "selected-option",

            verified:
                true,
        };
    }

    function getCurrentInvestment() {
        metrics.activeInvestmentReads +=
            1;

        const activeElement =
            getActiveInvestmentElement();

        const active =
            Boolean(
                activeElement
            );

        metrics.lastActiveState =
            active;

        if (!active) {
            const inactiveResult = {
                active:
                    false,

                investmentLocked:
                    false,

                payout:
                    null,

                countdown:
                    null,

                selectedTerm:
                    getSelectedTerm(),

                readAt:
                    Date.now(),

                source:
                    "investment-bank-page",
            };

            recordActivity(
                "active-investment-read",
                {
                    active:
                        false,
                }
            );

            return inactiveResult;
        }

        const payoutElement =
            getActivePayoutElement();

        const countdownElement =
            getCountdownElement();

        const payoutRaw =
            normalizeText(
                payoutElement
                    ?.textContent
            );

        const countdownRaw =
            normalizeText(
                countdownElement
                    ?.textContent
            );

        const payoutValue =
            parseMoney(
                payoutRaw
            );

        const countdown =
            parseCountdown(
                countdownRaw
            );

        const selectedTerm =
            getSelectedTerm();

        const result = {
            active:
                true,

            investmentLocked:
                true,

            payout: {
                value:
                    payoutValue,

                raw:
                    payoutRaw,

                available:
                    Number.isFinite(
                        payoutValue
                    ),

                source:
                    "active-investment-message",

                verified:
                    Number.isFinite(
                        payoutValue
                    ),
            },

            countdown,

            selectedTerm,

            /*
             * The displayed term percentage and APR are today's
             * currently shown values. They must not automatically
             * be treated as the historical rate used when this
             * active investment began.
             */
            rateRelationship: {
                currentDisplayedRateOnly:
                    true,

                originalActiveRateVerified:
                    false,
            },

            readAt:
                Date.now(),

            source:
                "investment-bank-page",
        };

        recordActivity(
            "active-investment-read",
            {
                active:
                    true,

                payout:
                    payoutValue,

                countdownMilliseconds:
                    countdown
                        ?.milliseconds ??
                    null,

                selectedTermId:
                    selectedTerm
                        ?.id ||
                    null,
            }
        );

        return result;
    }

    function isReady() {
        metrics.readinessChecks +=
            1;

        const checks = {
            root:
                Boolean(
                    getRoot()
                ),

            content:
                Boolean(
                    getContent()
                ),

            termOptions:
                getTermOptionElements()
                    .length >
                1,

            aprRows:
                getAprRows()
                    .length >
                0,
        };

        const ready =
            checks.root &&
            checks.content &&
            checks.termOptions &&
            checks.aprRows;

        if (ready) {
            metrics.readinessPasses +=
                1;
        } else {
            metrics.readinessFailures +=
                1;
        }

        const result = {
            ready,

            reason:
                ready
                    ? "ready"
                    : "required-element-missing",

            checks,

            checkedAt:
                Date.now(),
        };

        recordActivity(
            "readiness-check",
            result
        );

        return result;
    }

    async function waitUntilReady(
        options = {}
    ) {
        const timeoutMs =
            Number.isFinite(
                options.timeoutMs
            ) &&
            options.timeoutMs >=
                0
                ? Math.floor(
                      options.timeoutMs
                  )
                : 15_000;

        const pollIntervalMs =
            Number.isFinite(
                options.pollIntervalMs
            ) &&
            options.pollIntervalMs >
                0
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
                resolve => {
                    globalThis.setTimeout(
                        resolve,
                        pollIntervalMs
                    );
                }
            );
        }

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

        if (
            options.rejectOnTimeout ===
            true
        ) {
            const error =
                new Error(
                    "Timed out waiting for the Investment Bank interface."
                );

            error.name =
                "InvestmentBankPageTimeoutError";

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }

        return result;
    }

    function getSnapshot() {
        metrics.snapshotReads +=
            1;

        metrics.lastSnapshotAt =
            Date.now();

        const readiness =
            isReady();

        const options =
            readiness.ready
                ? getInvestmentOptions()
                : [];

        const currentInvestment =
            getCurrentInvestment();

        const investButton =
            getInvestButton();

        const amountInput =
            getAmountInput();

        const result = {
            page:
                "investment-bank",

            ready:
                readiness.ready,

            readiness,

            options,

            currentInvestment,

            controls: {
                amountInputPresent:
                    Boolean(
                        amountInput
                    ),

                investButtonPresent:
                    Boolean(
                        investButton
                    ),

                investButtonDisabled:
                    Boolean(
                        investButton
                            ?.disabled ||
                        investButton
                            ?.classList
                            ?.contains(
                                "disabled"
                            )
                    ),
            },

            state: {
                activeInvestment:
                    currentInvestment
                        .active,

                investmentLocked:
                    currentInvestment
                        .investmentLocked,

                canStartInvestment:
                    !currentInvestment
                        .active &&
                    Boolean(
                        amountInput
                    ) &&
                    Boolean(
                        investButton
                    ) &&
                    !Boolean(
                        investButton
                            ?.disabled
                    ),
            },

            readAt:
                Date.now(),

            source:
                "dom-helper",
        };

        recordActivity(
            "snapshot-read",
            {
                ready:
                    result.ready,

                optionCount:
                    result.options
                        .length,

                activeInvestment:
                    result.state
                        .activeInvestment,

                canStartInvestment:
                    result.state
                        .canStartInvestment,
            }
        );

        return result;
    }

    function inspect() {
        const readiness =
            isReady();

        const options =
            readiness.ready
                ? getInvestmentOptions()
                : [];

        const currentInvestment =
            getCurrentInvestment();

        return {
            helperId:
                HELPER_ID,

            page:
                dom.pages.detect?.() ||
                null,

            ready:
                readiness.ready,

            readiness,

            elements: {
                root:
                    Boolean(
                        getRoot()
                    ),

                content:
                    Boolean(
                        getContent()
                    ),

                termSelect:
                    Boolean(
                        getTermSelect()
                    ),

                termOptions:
                    getTermOptionElements()
                        .length,

                selectedTermDisplay:
                    Boolean(
                        getSelectedTermDisplay()
                    ),

                activeInvestment:
                    Boolean(
                        getActiveInvestmentElement()
                    ),

                activePayout:
                    Boolean(
                        getActivePayoutElement()
                    ),

                countdown:
                    Boolean(
                        getCountdownElement()
                    ),

                aprRows:
                    getAprRows()
                        .length,

                activeAprRow:
                    Boolean(
                        getActiveAprRow()
                    ),

                amountInput:
                    Boolean(
                        getAmountInput()
                    ),

                investButton:
                    Boolean(
                        getInvestButton()
                    ),
            },

            selectors: {
                ...SELECTORS,
            },

            data: {
                optionCount:
                    options.length,

                options,

                currentInvestment,
            },

            safety: {
                readOnly:
                    true,

                changesTerm:
                    false,

                fillsAmount:
                    false,

                clicksInvest:
                    false,

                withdrawsInvestment:
                    false,

                submitsTransaction:
                    false,

                confirmsTransaction:
                    false,
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

    const investmentBank =
        Object.freeze({
            id:
                HELPER_ID,

            name:
                "Investment Bank",

            description:
                "Reads current Investment Bank opportunities and active-investment data.",

            pageId:
                "city",

            routeId:
                "finance:investment-bank",

            capabilities: {
                "page.ready":
                    "isReady",

                "page.wait-until-ready":
                    "waitUntilReady",

                "page.inspect":
                    "inspect",

                "investment.options.read":
                    "getInvestmentOptions",

                "investment.current.read":
                    "getCurrentInvestment",

                "investment.snapshot.read":
                    "getSnapshot",

                "investment.term.read":
                    "getSelectedTerm",

                "investment.countdown.read":
                    "parseCountdown",

                "investment.submit":
                    false,

                "investment.withdraw":
                    false,

                "transaction.confirm":
                    false,
            },

            metadata: {
                category:
                    "finance",

                destination:
                    "investment-bank",

                selectorsVerified:
                    true,

                readOnly:
                    true,

                dynamicRates:
                    true,

                activeRateHistoricalVerification:
                    false,

                automaticSubmission:
                    false,

                automaticConfirmation:
                    false,
            },

            isReady,
            waitUntilReady,

            getInvestmentOptions,
            getCurrentInvestment,
            getSelectedTerm,
            getSnapshot,

            parseMoney,
            parsePercentage,
            parseCountdown,

            inspect,
        });

    dom.pages.registerHelper(
        HELPER_ID,
        investmentBank,
        {
            replace:
                true,
        }
    );

    logger?.info(
        "Investment Bank DOM page helper loaded",
        {
            helperId:
                HELPER_ID,

            routeId:
                "finance:investment-bank",

            capabilitySource:
                "explicit",

            capabilities: [
                "page.ready",
                "page.wait-until-ready",
                "page.inspect",
                "investment.options.read",
                "investment.current.read",
                "investment.snapshot.read",
                "investment.term.read",
                "investment.countdown.read",
            ],

            readOnly:
                true,

            submitsTransaction:
                false,

            confirmsTransaction:
                false,
        }
    );
})();