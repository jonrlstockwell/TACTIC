/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/finance/sections/bank.js
 *
 * Purpose:
 * Displays active Investment Bank information, live investment
 * opportunities, projections, and strategy recommendations
 * inside the Finance application.
 *
 * Responsibilities:
 * - Register the Investment Bank Finance section
 * - Read canonical bank data from Finance Repository
 * - Display an active investment and maturity countdown
 * - Clearly distinguish verified and estimated values
 * - Display all currently available investment terms
 * - Compare projected profit, payout, APR, and liquidity
 * - Allow the user to select a recommendation strategy
 * - Refresh when Investment Bank repository data changes
 *
 * Does NOT:
 * - Read Torn's DOM directly
 * - Select an investment term on Torn
 * - Fill an investment amount
 * - Start or withdraw an investment
 * - Submit or confirm a transaction
 *
 * Dependencies:
 * - modules/finance/index.js
 * - repositories/finance/index.js
 * - services/finance/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Finance Bank] Namespace is unavailable."
        );

        return;
    }

    if (
        !TACTIC.finance ||
        typeof TACTIC.finance.registerSection !==
            "function"
    ) {
        console.error(
            "[TACTIC Finance Bank] Finance application is unavailable."
        );

        return;
    }

    const financeRepository =
        TACTIC.repositories?.finance;

    const financeEngine =
        TACTIC.services?.finance;

    const logger =
        TACTIC.services?.logger;

    const notifications =
        TACTIC.services?.notifications;

    if (
        !financeRepository ||
        typeof financeRepository.getInvestmentBank !==
            "function" ||
        typeof financeRepository.refreshInvestmentBank !==
            "function" ||
        typeof financeRepository.subscribe !==
            "function"
    ) {
        console.error(
            "[TACTIC Finance Bank] Finance Repository is unavailable."
        );

        return;
    }

    if (!financeEngine) {
        console.error(
            "[TACTIC Finance Bank] Finance Engine is unavailable."
        );

        return;
    }

    const SECTION_ID =
        "bank";

    const SECTION_NAME =
        "Investment Bank";

    const SECTION_ORDER =
        200;

    let latestBank =
        financeRepository.getInvestmentBank();

    let unsubscribeBank =
        null;

    let refreshTimerId =
        null;

    let refreshScheduled =
        false;

    let destroyedAt =
        null;

    const metrics = {
        loadedAt:
            Date.now(),

        renders:
            0,

        bankUpdates:
            0,

        refreshRequests:
            0,

        refreshesCompleted:
            0,

        refreshesSkipped:
            0,

        strategyChanges:
            0,

        strategyChangeFailures:
            0,

        lastRenderedAt:
            null,

        lastBankUpdateAt:
            null,

        lastRefreshRequestedAt:
            null,

        lastRefreshCompletedAt:
            null,

        lastStrategyChangeAt:
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

    function createElement(
        tagName,
        options = {}
    ) {
        const element =
            document.createElement(
                tagName
            );

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                String(
                    options.text
                );
        }

        if (options.className) {
            element.className =
                options.className;
        }

        if (options.styles) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        if (options.attributes) {
            for (
                const [
                    name,
                    value,
                ] of Object.entries(
                    options.attributes
                )
            ) {
                element.setAttribute(
                    name,
                    String(value)
                );
            }
        }

        return element;
    }

    function formatMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "Unavailable";
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

    function formatPercent(
        value,
        digits =
            2
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "Unavailable";
        }

        return `${value.toFixed(
            digits
        )}%`;
    }

    function formatDuration(
        milliseconds
    ) {
        if (
            !Number.isFinite(
                milliseconds
            )
        ) {
            return "Unavailable";
        }

        const totalSeconds =
            Math.max(
                0,
                Math.floor(
                    milliseconds /
                    1_000
                )
            );

        const days =
            Math.floor(
                totalSeconds /
                86_400
            );

        const hours =
            Math.floor(
                (
                    totalSeconds %
                    86_400
                ) /
                3_600
            );

        const minutes =
            Math.floor(
                (
                    totalSeconds %
                    3_600
                ) /
                60
            );

        const seconds =
            totalSeconds %
            60;

        const parts =
            [];

        if (days > 0) {
            parts.push(
                `${days} day${
                    days === 1
                        ? ""
                        : "s"
                }`
            );
        }

        if (
            hours > 0 ||
            days > 0
        ) {
            parts.push(
                `${hours} hour${
                    hours === 1
                        ? ""
                        : "s"
                }`
            );
        }

        if (
            minutes > 0 ||
            hours > 0 ||
            days > 0
        ) {
            parts.push(
                `${minutes} minute${
                    minutes === 1
                        ? ""
                        : "s"
                }`
            );
        }

        if (days === 0) {
            parts.push(
                `${seconds} second${
                    seconds === 1
                        ? ""
                        : "s"
                }`
            );
        }

        return parts.join(
            ", "
        );
    }

    function formatDateTime(
        timestamp
    ) {
        if (
            !Number.isFinite(
                timestamp
            )
        ) {
            return "Unavailable";
        }

        return new Intl.DateTimeFormat(
            undefined,
            {
                dateStyle:
                    "medium",

                timeStyle:
                    "short",
            }
        ).format(
            new Date(
                timestamp
            )
        );
    }

    function formatStrategyName(
        strategy
    ) {
        switch (strategy) {
            case "maximum-liquidity":
                return "Maximum Liquidity";

            case "highest-apr":
                return "Highest APR";

            case "balanced":
                return "Balanced";

            case "maximum-return":
            default:
                return "Maximum Return";
        }
    }

    function createBadge(
        text,
        options = {}
    ) {
        return createElement(
            "span",
            {
                text,

                styles: {
                    display:
                        "inline-block",

                    padding:
                        "3px 7px",

                    border:
                        `1px solid ${
                            options.border ||
                            "rgba(255,255,255,.15)"
                        }`,

                    borderRadius:
                        "999px",

                    background:
                        options.background ||
                        "rgba(255,255,255,.05)",

                    color:
                        options.color ||
                        "#bbb",

                    fontSize:
                        "9px",

                    fontWeight:
                        "700",

                    letterSpacing:
                        ".03em",

                    textTransform:
                        "uppercase",
                },
            }
        );
    }

    function createCard(
        label,
        value,
        options = {}
    ) {
        const card =
            createElement(
                "div",
                {
                    styles: {
                        boxSizing:
                            "border-box",

                        minWidth:
                            "0",

                        padding:
                            "10px 11px",

                        border:
                            `1px solid ${
                                options.border ||
                                "rgba(255,255,255,.11)"
                            }`,

                        borderRadius:
                            "6px",

                        background:
                            options.background ||
                            "rgba(255,255,255,.035)",
                    },
                }
            );

        const labelElement =
            createElement(
                "div",
                {
                    text:
                        label,

                    styles: {
                        marginBottom:
                            "4px",

                        color:
                            "#969696",

                        fontSize:
                            "10px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".04em",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        const valueElement =
            createElement(
                "div",
                {
                    text:
                        value,

                    styles: {
                        color:
                            options.color ||
                            "#f1f1f1",

                        fontSize:
                            options.compact
                                ? "12px"
                                : "15px",

                        fontWeight:
                            "700",

                        lineHeight:
                            "1.25",

                        overflowWrap:
                            "anywhere",
                    },
                }
            );

        card.append(
            labelElement,
            valueElement
        );

        if (options.badge) {
            const badgeRow =
                createElement(
                    "div",
                    {
                        styles: {
                            marginTop:
                                "6px",
                        },
                    }
                );

            badgeRow.appendChild(
                createBadge(
                    options.badge.text,
                    options.badge
                )
            );

            card.appendChild(
                badgeRow
            );
        }

        return card;
    }

    function createButton(
        text,
        onClick,
        options = {}
    ) {
        const button =
            createElement(
                "button",
                {
                    text,

                    attributes: {
                        type:
                            "button",
                    },

                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "9px 11px",

                        border:
                            "1px solid rgba(255,255,255,.16)",

                        borderRadius:
                            "5px",

                        background:
                            options.primary
                                ? "rgba(75,145,230,.24)"
                                : "rgba(255,255,255,.06)",

                        color:
                            "#f2f2f2",

                        cursor:
                            options.disabled
                                ? "not-allowed"
                                : "pointer",

                        fontSize:
                            "12px",

                        fontWeight:
                            "700",

                        opacity:
                            options.disabled
                                ? ".5"
                                : "1",
                    },
                }
            );

        button.disabled =
            options.disabled ===
            true;

        if (
            !button.disabled &&
            typeof onClick ===
                "function"
        ) {
            button.addEventListener(
                "click",
                onClick
            );
        }

        return button;
    }

    function createSectionHeader(
        titleText,
        subtitleText
    ) {
        const header =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        justifyContent:
                            "space-between",

                        alignItems:
                            "flex-start",

                        gap:
                            "10px",

                        paddingBottom:
                            "8px",

                        borderBottom:
                            "1px solid rgba(255,255,255,.10)",
                    },
                }
            );

        const textGroup =
            createElement(
                "div"
            );

        const title =
            createElement(
                "h3",
                {
                    text:
                        titleText,

                    styles: {
                        margin:
                            "0",

                        color:
                            "#eee",

                        fontSize:
                            "15px",

                        lineHeight:
                            "1.2",
                    },
                }
            );

        const subtitle =
            createElement(
                "div",
                {
                    text:
                        subtitleText,

                    styles: {
                        marginTop:
                            "3px",

                        color:
                            "#8f8f8f",

                        fontSize:
                            "10px",

                        lineHeight:
                            "1.4",
                    },
                }
            );

        textGroup.append(
            title,
            subtitle
        );

        header.appendChild(
            textGroup
        );

        return {
            header,
            textGroup,
        };
    }

    function createActiveInvestmentPanel(
        bank
    ) {
        const active =
            bank.activeInvestment;

        const panel =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "9px",

                        padding:
                            "12px",

                        border:
                            "1px solid rgba(139,195,74,.24)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(139,195,74,.07)",
                    },
                }
            );

        const headingRow =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "space-between",

                        gap:
                            "8px",
                    },
                }
            );

        headingRow.append(
            createElement(
                "div",
                {
                    text:
                        "Active Investment",

                    styles: {
                        color:
                            "#e8f5e9",

                        fontSize:
                            "13px",

                        fontWeight:
                            "700",
                    },
                }
            ),

            createBadge(
                "Funds Locked",
                {
                    background:
                        "rgba(139,195,74,.10)",

                    border:
                        "rgba(139,195,74,.28)",

                    color:
                        "#c5e1a5",
                }
            )
        );

        const countdown =
            active?.countdown;

        const countdownValue =
            Number.isFinite(
                countdown
                    ?.estimatedMaturesAt
            )
                ? Math.max(
                      0,
                      countdown
                          .estimatedMaturesAt -
                      Date.now()
                  )
                : countdown
                      ?.milliseconds;

        const summaryGrid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0,1fr))",

                        gap:
                            "7px",
                    },
                }
            );

        summaryGrid.append(
            createCard(
                "Verified Payout",
                formatMoney(
                    active
                        ?.payout
                        ?.value
                ),
                {
                    badge: {
                        text:
                            "Verified",

                        background:
                            "rgba(76,175,80,.10)",

                        border:
                            "rgba(76,175,80,.25)",

                        color:
                            "#a5d6a7",
                    },
                }
            ),

            createCard(
                "Term",
                active
                    ?.selectedTerm
                    ?.label ||
                "Unavailable",
                {
                    compact:
                        true,

                    badge: {
                        text:
                            "Verified",

                        background:
                            "rgba(76,175,80,.10)",

                        border:
                            "rgba(76,175,80,.25)",

                        color:
                            "#a5d6a7",
                    },
                }
            ),

            createCard(
                "Time Remaining",
                formatDuration(
                    countdownValue
                ),
                {
                    compact:
                        true,

                    badge: {
                        text:
                            "Live Countdown",

                        background:
                            "rgba(76,175,80,.10)",

                        border:
                            "rgba(76,175,80,.25)",

                        color:
                            "#a5d6a7",
                    },
                }
            ),

            createCard(
                "Estimated Maturity",
                formatDateTime(
                    countdown
                        ?.estimatedMaturesAt
                ),
                {
                    compact:
                        true,

                    badge: {
                        text:
                            "Estimated",

                        background:
                            "rgba(245,166,35,.08)",

                        border:
                            "rgba(245,166,35,.25)",

                        color:
                            "#ffcc80",
                    },
                }
            )
        );

        const activeEstimate =
            bank.analysis
                ?.activeEstimate;

        if (activeEstimate) {
            const estimateGrid =
                createElement(
                    "div",
                    {
                        styles: {
                            display:
                                "grid",

                            gridTemplateColumns:
                                "repeat(2, minmax(0,1fr))",

                            gap:
                                "7px",
                        },
                    }
                );

            estimateGrid.append(
                createCard(
                    "Estimated Principal",
                    formatMoney(
                        activeEstimate
                            .principal
                            ?.value
                    ),
                    {
                        badge: {
                            text:
                                "Estimated from current rate",

                            background:
                                "rgba(245,166,35,.08)",

                            border:
                                "rgba(245,166,35,.25)",

                            color:
                                "#ffcc80",
                        },
                    }
                ),

                createCard(
                    "Estimated Profit",
                    formatMoney(
                        activeEstimate
                            .profit
                            ?.value
                    ),
                    {
                        badge: {
                            text:
                                "Estimated from current rate",

                            background:
                                "rgba(245,166,35,.08)",

                            border:
                                "rgba(245,166,35,.25)",

                            color:
                                "#ffcc80",
                        },
                    }
                )
            );

            panel.append(
                headingRow,
                summaryGrid,
                estimateGrid
            );
        } else {
            panel.append(
                headingRow,
                summaryGrid
            );
        }

        const notice =
            createElement(
                "div",
                {
                    text:
                        "The payout, selected term, and live countdown are read directly from Torn. Principal and profit estimates use the currently displayed rate, which may differ from the rate available when this investment began.",

                    styles: {
                        color:
                            "#bdbdbd",

                        fontSize:
                            "10px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        panel.appendChild(
            notice
        );

        return panel;
    }

    function createInactivePanel(
        bank
    ) {
        const panel =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "12px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.035)",
                    },
                }
            );

        const title =
            createElement(
                "div",
                {
                    text:
                        "No Active Investment",

                    styles: {
                        color:
                            "#eee",

                        fontSize:
                            "13px",

                        fontWeight:
                            "700",
                    },
                }
            );

        const message =
            createElement(
                "div",
                {
                    text:
                        bank.state
                            ?.canStartInvestment
                            ? "The Investment Bank is currently available for a new investment."
                            : "TACTIC cannot currently verify that the investment controls are available.",

                    styles: {
                        marginTop:
                            "5px",

                        color:
                            "#aaa",

                        fontSize:
                            "11px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        panel.append(
            title,
            message
        );

        return panel;
    }

    function createStrategySelector(
        bank
    ) {
        const wrapper =
            createElement(
                "label",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "5px",
                    },
                }
            );

        const label =
            createElement(
                "span",
                {
                    text:
                        "Recommendation Strategy",

                    styles: {
                        color:
                            "#bbb",

                        fontSize:
                            "11px",

                        fontWeight:
                            "700",
                    },
                }
            );

        const select =
            createElement(
                "select",
                {
                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "9px 10px",

                        border:
                            "1px solid rgba(255,255,255,.16)",

                        borderRadius:
                            "5px",

                        background:
                            "#202020",

                        color:
                            "#fff",

                        fontSize:
                            "12px",
                    },
                }
            );

        const strategies = [
            {
                value:
                    "maximum-return",

                label:
                    "Maximum Return",
            },
            {
                value:
                    "balanced",

                label:
                    "Balanced",
            },
            {
                value:
                    "maximum-liquidity",

                label:
                    "Maximum Liquidity",
            },
            {
                value:
                    "highest-apr",

                label:
                    "Highest APR",
            },
        ];

        for (
            const strategy of
            strategies
        ) {
            const option =
                createElement(
                    "option",
                    {
                        text:
                            strategy.label,

                        attributes: {
                            value:
                                strategy.value,
                        },
                    }
                );

            option.selected =
                strategy.value ===
                bank.strategy;

            select.appendChild(
                option
            );
        }

        select.addEventListener(
            "change",
            async () => {
                try {
                    const result =
                        financeRepository
                            .setInvestmentStrategy(
                                select.value,
                                {
                                    source:
                                        "finance-bank-ui",
                                }
                            );

                    if (
                        result.changed ===
                        true
                    ) {
                        metrics.strategyChanges +=
                            1;

                        metrics.lastStrategyChangeAt =
                            Date.now();

                        notifications?.info?.(
                            `Investment strategy changed to ${formatStrategyName(
                                result.strategy
                            )}.`,
                            {
                                title:
                                    "Investment Bank",

                                group:
                                    "finance",
                            }
                        );
                    }

                    await refreshFinance(
                        "investment-strategy-change"
                    );
                } catch (error) {
                    metrics.strategyChangeFailures +=
                        1;

                    metrics.lastError =
                        createErrorSnapshot(
                            error
                        );

                    select.value =
                        financeRepository
                            .getInvestmentStrategy();

                    notifications?.warning?.(
                        error?.message ||
                        "The investment strategy could not be changed.",
                        {
                            title:
                                "Investment Bank",

                            group:
                                "finance",
                        }
                    );
                }
            }
        );

        wrapper.append(
            label,
            select
        );

        return wrapper;
    }

    function createRecommendationPanel(
        bank
    ) {
        const recommendation =
            bank.analysis
                ?.recommendation
                ?.recommendation;

        const activeInvestment =
            bank.activeInvestment;

        const activeEstimate =
            bank.analysis
                ?.activeEstimate;

        const recommendationMatchesActiveTerm =
            activeInvestment
                ?.active ===
                true &&
            recommendation
                ?.option
                ?.id &&
            recommendation
                .option
                .id ===
                activeInvestment
                    ?.selectedTerm
                    ?.id;

        /*
         * While displaying the same term as the active
         * investment, keep the principal, profit, and payout
         * internally consistent with Torn's verified payout.
         *
         * The live rate remains available elsewhere in the
         * recommendation data, but it is not used to reconstruct
         * the active investment payout.
         */
        const displayedPrincipal =
            recommendationMatchesActiveTerm &&
            Number.isFinite(
                activeEstimate
                    ?.principal
                    ?.value
            )
                ? activeEstimate
                      .principal
                      .value
                : recommendation
                      ?.principal
                      ?.value;

        const displayedProfit =
            recommendationMatchesActiveTerm &&
            Number.isFinite(
                activeEstimate
                    ?.profit
                    ?.value
            )
                ? activeEstimate
                      .profit
                      .value
                : recommendation
                      ?.profit
                      ?.value;

        const displayedPayout =
            recommendationMatchesActiveTerm &&
            Number.isFinite(
                activeInvestment
                    ?.payout
                    ?.value
            )
                ? activeInvestment
                      .payout
                      .value
                : recommendation
                      ?.payout
                      ?.value;

        const panel =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "9px",

                        padding:
                            "12px",

                        border:
                            "1px solid rgba(75,145,230,.26)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(75,145,230,.07)",
                    },
                }
            );

        if (!recommendation) {
            panel.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "A recommendation is not currently available. TACTIC needs a usable principal and at least one verified investment option.",

                        styles: {
                            color:
                                "#aaa",

                            fontSize:
                                "11px",

                            lineHeight:
                                "1.45",
                        },
                    }
                )
            );

            return panel;
        }

        const heading =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        justifyContent:
                            "space-between",

                        alignItems:
                            "center",

                        gap:
                            "8px",
                    },
                }
            );

        heading.append(
            createElement(
                "div",
                {
                    text:
                        `Recommended: ${recommendation.option.label}`,

                    styles: {
                        color:
                            "#e3f2fd",

                        fontSize:
                            "14px",

                        fontWeight:
                            "800",
                    },
                }
            ),

            createBadge(
                formatStrategyName(
                    bank.strategy
                ),
                {
                    background:
                        "rgba(75,145,230,.10)",

                    border:
                        "rgba(75,145,230,.28)",

                    color:
                        "#90caf9",
                }
            )
        );

        const principal =
            recommendation
                .principal;

        const summaryGrid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0,1fr))",

                        gap:
                            "7px",
                    },
                }
            );

        summaryGrid.append(
            createCard(
                recommendationMatchesActiveTerm
                    ? "Estimated Principal"
                    : "Comparison Principal",
                formatMoney(
                    displayedPrincipal
                ),
                {
                    badge: {
                        text:
                            principal
                                ?.estimated
                                ? "Estimated"
                                : "Verified",

                        background:
                            principal
                                ?.estimated
                                ? "rgba(245,166,35,.08)"
                                : "rgba(76,175,80,.10)",

                        border:
                            principal
                                ?.estimated
                                ? "rgba(245,166,35,.25)"
                                : "rgba(76,175,80,.25)",

                        color:
                            principal
                                ?.estimated
                                ? "#ffcc80"
                                : "#a5d6a7",
                    },
                }
            ),

            createCard(
                recommendationMatchesActiveTerm
                    ? "Estimated Active Profit"
                    : "Projected Profit",
                formatMoney(
                    displayedProfit
                ),
                {
                    color:
                        "#a5d6a7",
                }
            ),

            createCard(
                recommendationMatchesActiveTerm
                    ? "Verified Active Payout"
                    : "Projected Payout",
                formatMoney(
                    displayedPayout
                ),
                recommendationMatchesActiveTerm
                    ? {
                          badge: {
                              text:
                                  "Verified",

                              background:
                                  "rgba(76,175,80,.10)",

                              border:
                                  "rgba(76,175,80,.25)",

                              color:
                                  "#a5d6a7",
                          },
                      }
                    : {}
            ),

            createCard(
                "Displayed APR",
                formatPercent(
                    recommendation
                        .annualized
                        ?.displayedAprPercent
                )
            ),

            createCard(
                "Term Profit",
                formatPercent(
                    recommendation
                        .profit
                        ?.percent
                )
            ),

            createCard(
                "Funds Locked",
                `${recommendation
                    .timing
                    ?.days || 0} days`
            )
        );

        const reason =
            createElement(
                "div",
                {
                    text:
                        recommendation.reason,

                    styles: {
                        color:
                            "#c7d7e8",

                        fontSize:
                            "11px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        panel.append(
            heading,
            summaryGrid,
            reason
        );

        return panel;
    }

    function createOptionsTable(
        bank
    ) {
        const comparisonOptions =
            bank.analysis
                ?.comparison
                ?.options ||
            [];

        const recommendationId =
            bank.analysis
                ?.recommendation
                ?.recommendation
                ?.option
                ?.id ||
            null;

        const wrapper =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",
                    },
                }
            );

        const heading =
            createElement(
                "div",
                {
                    text:
                        "Live Investment Options",

                    styles: {
                        color:
                            "#ddd",

                        fontSize:
                            "12px",

                        fontWeight:
                            "700",
                    },
                }
            );

        wrapper.appendChild(
            heading
        );

        if (
            comparisonOptions.length ===
            0
        ) {
            wrapper.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "No investment options are currently available.",

                        styles: {
                            padding:
                                "10px",

                            border:
                                "1px solid rgba(255,255,255,.10)",

                            borderRadius:
                                "6px",

                            color:
                                "#999",

                            fontSize:
                                "11px",
                        },
                    }
                )
            );

            return wrapper;
        }

        for (
            const option of
            comparisonOptions
        ) {
            const recommended =
                option.option.id ===
                recommendationId;

            const row =
                createElement(
                    "div",
                    {
                        styles: {
                            display:
                                "grid",

                            gridTemplateColumns:
                                "minmax(0,1.4fr) repeat(3,minmax(0,1fr))",

                            gap:
                                "6px",

                            alignItems:
                                "center",

                            padding:
                                "9px",

                            border:
                                `1px solid ${
                                    recommended
                                        ? "rgba(75,145,230,.30)"
                                        : "rgba(255,255,255,.10)"
                                }`,

                            borderRadius:
                                "6px",

                            background:
                                recommended
                                    ? "rgba(75,145,230,.08)"
                                    : "rgba(255,255,255,.025)",
                        },
                    }
                );

            const optionCell =
                createElement(
                    "div",
                    {
                        styles: {
                            minWidth:
                                "0",
                        },
                    }
                );

            const optionName =
                createElement(
                    "div",
                    {
                        text:
                            option.option
                                .label,

                        styles: {
                            color:
                                recommended
                                    ? "#d8ecff"
                                    : "#eee",

                            fontSize:
                                "11px",

                            fontWeight:
                                "700",
                        },
                    }
                );

            optionCell.appendChild(
                optionName
            );

            if (recommended) {
                const badgeRow =
                    createElement(
                        "div",
                        {
                            styles: {
                                marginTop:
                                    "4px",
                            },
                        }
                    );

                badgeRow.appendChild(
                    createBadge(
                        "Recommended",
                        {
                            background:
                                "rgba(75,145,230,.10)",

                            border:
                                "rgba(75,145,230,.28)",

                            color:
                                "#90caf9",
                        }
                    )
                );

                optionCell.appendChild(
                    badgeRow
                );
            }

            const profitCell =
                createElement(
                    "div",
                    {
                        text:
                            formatMoney(
                                option.profit
                                    .value
                            ),

                        styles: {
                            color:
                                "#a5d6a7",

                            fontSize:
                                "10px",

                            fontWeight:
                                "700",

                            textAlign:
                                "right",
                        },
                    }
                );

            const termCell =
                createElement(
                    "div",
                    {
                        text:
                            formatPercent(
                                option.profit
                                    .percent
                            ),

                        styles: {
                            color:
                                "#ddd",

                            fontSize:
                                "10px",

                            fontWeight:
                                "700",

                            textAlign:
                                "right",
                        },
                    }
                );

            const aprCell =
                createElement(
                    "div",
                    {
                        text:
                            formatPercent(
                                option
                                    .annualized
                                    .displayedAprPercent
                            ),

                        styles: {
                            color:
                                "#ddd",

                            fontSize:
                                "10px",

                            fontWeight:
                                "700",

                            textAlign:
                                "right",
                        },
                    }
                );

            row.append(
                optionCell,
                profitCell,
                termCell,
                aprCell
            );

            wrapper.appendChild(
                row
            );
        }

        const legend =
            createElement(
                "div",
                {
                    text:
                        "Columns: term, projected profit, term profit percentage, and displayed APR.",

                    styles: {
                        color:
                            "#777",

                        fontSize:
                            "9px",

                        lineHeight:
                            "1.4",
                    },
                }
            );

        wrapper.appendChild(
            legend
        );

        return wrapper;
    }

    async function refreshFinance(
        reason
    ) {
        metrics.refreshRequests +=
            1;

        metrics.lastRefreshRequestedAt =
            Date.now();

        if (
            typeof TACTIC.finance
                ?.refresh !==
            "function"
        ) {
            metrics.refreshesSkipped +=
                1;

            return false;
        }

        const result =
            await TACTIC.finance.refresh(
                reason
            );

        if (
            result?.refreshed ===
            true
        ) {
            metrics.refreshesCompleted +=
                1;

            metrics.lastRefreshCompletedAt =
                Date.now();

            return true;
        }

        metrics.refreshesSkipped +=
            1;

        return false;
    }

    function scheduleRefresh(
        reason =
            "investment-bank-change"
    ) {
        if (refreshScheduled) {
            return false;
        }

        refreshScheduled =
            true;

        refreshTimerId =
            globalThis.setTimeout(
                async () => {
                    refreshScheduled =
                        false;

                    refreshTimerId =
                        null;

                    try {
                        await refreshFinance(
                            reason
                        );
                    } catch (error) {
                        metrics.lastError =
                            createErrorSnapshot(
                                error
                            );

                        logger?.error(
                            "Finance Bank scheduled refresh failed",
                            {
                                reason,
                                error,
                            }
                        );
                    }
                },
                50
            );

        return true;
    }

    async function render(
        container
    ) {
        metrics.renders +=
            1;

        metrics.lastRenderedAt =
            Date.now();

        latestBank =
            financeRepository
                .getInvestmentBank();

        const bank =
            latestBank;

        const wrapper =
            createElement(
                "div",
                {
                    className:
                        "tactic-finance-bank-content",

                    styles: {
                        display:
                            "grid",

                        gap:
                            "11px",

                        padding:
                            "1px 0",
                    },
                }
            );

        const sectionHeader =
            createSectionHeader(
                "Investment Bank",
                bank?.available
                    ? `${bank.options.length} live investment options detected`
                    : "Investment Bank data is currently unavailable"
            );

        const bankStatus =
            bank?.live ===
            true
                ? {
                      label:
                          "Live",

                      background:
                          "rgba(76,175,80,.10)",

                      border:
                          "rgba(76,175,80,.25)",

                      color:
                          "#a5d6a7",
                  }
                : bank?.cached ===
                  true
                    ? {
                          label:
                              "Cached",

                          background:
                              "rgba(245,166,35,.08)",

                          border:
                              "rgba(245,166,35,.25)",

                          color:
                              "#ffcc80",
                      }
                    : {
                          label:
                              "Unavailable",

                          background:
                              "rgba(220,70,70,.08)",

                          border:
                              "rgba(220,70,70,.25)",

                          color:
                              "#ff9d9d",
                      };

        sectionHeader.header.appendChild(
            createBadge(
                bankStatus.label,
                bankStatus
            )
        );
                    ? {
                          background:
                              "rgba(76,175,80,.10)",

                          border:
                              "rgba(76,175,80,.25)",

                          color:
                              "#a5d6a7",
                      }
                    : {
                          background:
                              "rgba(220,70,70,.08)",

                          border:
                              "rgba(220,70,70,.25)",

                          color:
                              "#ff9d9d",
                      }
            )
        );

        wrapper.appendChild(
            sectionHeader.header
        );

        if (
            bank?.cached ===
            true
        ) {
            wrapper.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "Showing the most recent Investment Bank data collected by TACTIC. Open Torn's Investment Bank page to refresh current rates and verify the live countdown.",

                        styles: {
                            padding:
                                "9px 10px",

                            border:
                                "1px solid rgba(245,166,35,.22)",

                            borderRadius:
                                "6px",

                            background:
                                "rgba(245,166,35,.06)",

                            color:
                                "#d7c5a0",

                            fontSize:
                                "10px",

                            lineHeight:
                                "1.45",
                        },
                    }
                )
            );
        }

        if (
            !bank ||
            !bank.available
        ) {
            const unavailable =
                createElement(
                    "div",
                    {
                        styles: {
                            display:
                                "grid",

                            gap:
                                "9px",

                            padding:
                                "12px",

                            border:
                                "1px solid rgba(255,255,255,.12)",

                            borderRadius:
                                "7px",

                            background:
                                "rgba(255,255,255,.035)",
                        },
                    }
                );

            unavailable.append(
                createElement(
                    "div",
                    {
                        text:
                            "Open Torn's Investment Bank page to load current rates, active-investment details, and recommendations.",

                        styles: {
                            color:
                                "#aaa",

                            fontSize:
                                "11px",

                            lineHeight:
                                "1.45",
                        },
                    }
                ),

                createButton(
                    "Refresh Investment Bank",
                    async () => {
                        financeRepository
                            .refreshInvestmentBank(
                                "finance-bank-manual-refresh",
                                {
                                    forceNotify:
                                        true,
                                }
                            );

                        await refreshFinance(
                            "finance-bank-manual-refresh"
                        );
                    }
                )
            );

            wrapper.appendChild(
                unavailable
            );

            container.replaceChildren(
                wrapper
            );

            return;
        }

        wrapper.appendChild(
            bank.activeInvestment
                ?.active
                ? createActiveInvestmentPanel(
                      bank
                  )
                : createInactivePanel(
                      bank
                  )
        );

        wrapper.appendChild(
            createStrategySelector(
                bank
            )
        );

        wrapper.appendChild(
            createRecommendationPanel(
                bank
            )
        );

        wrapper.appendChild(
            createOptionsTable(
                bank
            )
        );

        wrapper.appendChild(
            createButton(
                "Refresh Investment Bank",
                async () => {
                    latestBank =
                        financeRepository
                            .refreshInvestmentBank(
                                "finance-bank-manual-refresh",
                                {
                                    forceNotify:
                                        true,
                                }
                            );

                    await refreshFinance(
                        "finance-bank-manual-refresh"
                    );
                }
            )
        );

        container.replaceChildren(
            wrapper
        );
    }

    function inspect() {
        return {
            section:
                SECTION_ID,

            name:
                SECTION_NAME,

            order:
                SECTION_ORDER,

            destroyedAt,

            refreshScheduled,

            bank:
                cloneValue(
                    latestBank
                ),

            strategy:
                financeRepository
                    .getInvestmentStrategy(),

            dependencies: {
                financeApplication:
                    Boolean(
                        TACTIC.finance
                    ),

                financeRepository:
                    Boolean(
                        financeRepository
                    ),

                financeEngine:
                    Boolean(
                        financeEngine
                    ),
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

    TACTIC.finance.registerSection({
        id:
            SECTION_ID,

        name:
            SECTION_NAME,

        icon:
            "🏦",

        order:
            SECTION_ORDER,

        enabled:
            true,

        metadata: {
            application:
                "finance",

            dataSource:
                "repository:finance",

            stateKey:
                financeRepository
                    .stateKeys
                    ?.INVESTMENT_BANK ||
                "finance.investmentBank",

            readOnly:
                true,

            strategySelection:
                true,

            recommendations:
                true,
        },

        render,

        destroy() {
            if (
                refreshTimerId !==
                null
            ) {
                globalThis.clearTimeout(
                    refreshTimerId
                );

                refreshTimerId =
                    null;
            }

            refreshScheduled =
                false;

            if (
                typeof unsubscribeBank ===
                "function"
            ) {
                unsubscribeBank();

                unsubscribeBank =
                    null;
            }

            destroyedAt =
                Date.now();

            logger?.info(
                "Finance Bank section destroyed"
            );
        },
    });

    unsubscribeBank =
        financeRepository.subscribe(
            financeRepository
                .keys
                .INVESTMENT_BANK,
            ({
                value,
            }) => {
                latestBank =
                    value;

                metrics.bankUpdates +=
                    1;

                metrics.lastBankUpdateAt =
                    Date.now();

                scheduleRefresh(
                    "finance-investment-bank-changed"
                );
            },
            {
                emitInitial:
                    true,
            }
        );

    TACTIC.finance.bankSection =
        Object.freeze({
            inspect,

            refresh(
                reason =
                    "finance-bank-section-api"
            ) {
                financeRepository
                    .refreshInvestmentBank(
                        reason,
                        {
                            forceNotify:
                                true,
                        }
                    );

                return refreshFinance(
                    reason
                );
            },

            getBank() {
                return financeRepository
                    .getInvestmentBank();
            },

            getStrategy() {
                return financeRepository
                    .getInvestmentStrategy();
            },

            setStrategy(
                strategy
            ) {
                return financeRepository
                    .setInvestmentStrategy(
                        strategy,
                        {
                            source:
                                "finance-bank-section-api",
                        }
                    );
            },
        });

    logger?.info(
        "Finance Bank section loaded",
        {
            sectionId:
                SECTION_ID,

            order:
                SECTION_ORDER,

            stateKey:
                financeRepository
                    .stateKeys
                    ?.INVESTMENT_BANK ||
                "finance.investmentBank",
        }
    );
})();