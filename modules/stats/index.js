/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/stats/index.js
 *
 * Purpose:
 * Battle Stats overview and training-goal interface.
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (
        !TACTIC ||
        typeof TACTIC.registerModule !==
            "function"
    ) {
        console.error(
            "[TACTIC Stats] Module framework unavailable."
        );

        return;
    }

    const MODULE_ID =
        "stats";

    const MODULE_VERSION =
        "0.1.0";

    const MODULE_ORDER =
        300;

    const AUTO_REFRESH_MS =
        15 * 1000;

    const AUTO_REFRESH_STALE_MS =
        30 * 1000;

    const LIVE_BAR_TICK_MS =
        1000;

    let autoRefreshTimer =
        null;

    let liveBarTimer =
        null;

    let autoRefreshInFlight =
        false;

    let autoRefreshContainer =
        null;

    const repository =
        TACTIC.repositories?.stats;

    const logger =
        TACTIC.services?.logger;

    const training =
        TACTIC.services?.training;

    if (
        !repository ||
        !training
    ) {
        console.error(
            "[TACTIC Stats] Stats Repository or Training service unavailable."
        );

        return;
    }

    function formatNumber(
        value
    ) {
        if (
            !Number.isFinite(
                Number(value)
            )
        ) {
            return "—";
        }

        return Math.round(
            Number(value)
        ).toLocaleString(
            "en-US"
        );
    }

    function formatActiveGym(
        activeGym
    ) {
        if (
            activeGym === null ||
            activeGym === undefined
        ) {
            return "Unknown";
        }

        if (
            typeof activeGym ===
            "string" ||
            typeof activeGym ===
            "number"
        ) {
            return String(
                activeGym
            );
        }

        if (
            typeof activeGym ===
            "object"
        ) {
            return (
                activeGym.name ||
                activeGym.title ||
                activeGym.gym_name ||
                activeGym.id ||
                "Unknown"
            );
        }

        return "Unknown";
    }

    function formatCompactNumber(
        value
    ) {
        const number =
            Number(
                value
            );

        if (
            !Number.isFinite(
                number
            )
        ) {
            return "—";
        }

        return new Intl
            .NumberFormat(
                "en-US",
                {
                    notation:
                        "compact",

                    maximumFractionDigits:
                        2,
                }
            )
            .format(
                number
            );
    }

    function createElement(
        tag,
        options = {}
    ) {
        const element =
            document.createElement(
                tag
            );

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                options.text;
        }

        if (
            options.className
        ) {
            element.className =
                options.className;
        }

        if (
            options.styles
        ) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        return element;
    }

    function createButton(
        text
    ) {
        return createElement(
            "button",
            {
                text,

                styles: {
                    cursor:
                        "pointer",

                    padding:
                        "7px 10px",

                    borderRadius:
                        "5px",

                    border:
                        "1px solid rgba(255,255,255,.18)",

                    background:
                        "rgba(255,255,255,.08)",

                    color:
                        "inherit",

                    width:
                        "100%",
                },
            }
        );
    }

    function createStatCard(
        key,
        label,
        data,
        goals
    ) {
        const stat =
            data?.battlestats
                ?.[key] ||
            null;

        const current =
            Number(
                stat?.value
            ) || 0;

        const goal =
            Number(
                goals?.[key]
            ) || 0;

        const progress =
            goal > 0
                ? Math.min(
                      100,
                      (
                          current /
                          goal
                      ) * 100
                  )
                : 0;

        const happiness =
            Number(
                data?.bars?.happy?.current
            ) || 0;

        const trainingModifiers =
            training.getTrainingModifiers({
                stat:
                    key,

                factionUpgrades:
                    data?.factionUpgrades,

                userPerks:
                    data?.userPerks,
            });

        const plan =
            goal > current
                ? training.planGoal({
                    stat:
                        key,

                    currentStat:
                        current,

                    targetStat:
                        goal,

                    happiness,

                    gyms:
                        data?.gyms || [],

                    activeGym:
                        data?.activeGym,

                    trainingMultiplier:
                        trainingModifiers
                            .multiplier,
                })
                : null;

        const card =
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

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "7px",

                        minWidth:
                            "0",
                    },
                }
            );

        const title =
            createElement(
                "div",
                {
                    text:
                        label,

                    styles: {
                        fontWeight:
                            "700",

                        fontSize:
                            "16px",

                        textAlign:
                            "center",
                    },
                }
            );

        const currentRow =
            createElement(
                "div",
                {
                    text:
                        formatNumber(
                            current
                        ),

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "700",

                        lineHeight:
                            "1.1",

                        whiteSpace:
                            "nowrap",

                        letterSpacing:
                            "-0.02em",

                        textAlign:
                            "center",
                    },
                }
            );

        const modifierRow =
            createElement(
                "div",
                {
                    text:
                        `Combat bonus: +${stat?.modifier ?? 0}%`,

                    styles: {
                        opacity:
                            ".7",

                        fontSize:
                            "12px",

                        textAlign:
                            "center",
                    },
                }
            );

        const goalInput =
            document.createElement(
                "input"
            );

        goalInput.type =
            "number";

        goalInput.min =
            "0";

        goalInput.step =
            "1";

        goalInput.value =
            goal > 0
                ? String(goal)
                : "";

        goalInput.placeholder =
            "Target";

        goalInput.dataset.statGoal =
            key;

        Object.assign(
            goalInput.style,
            {
                width:
                    "100%",

                boxSizing:
                    "border-box",

                padding:
                    "7px 8px",

                borderRadius:
                    "5px",

                border:
                    "1px solid rgba(255,255,255,.15)",

                background:
                    "rgba(0,0,0,.2)",

                color:
                    "inherit",

                fontSize:
                    "12px",

                textAlign:
                    "center",
            }
        );

        const progressText =
            createElement(
                "div",
                {
                    text:
                        goal > 0
                            ? `${progress.toFixed(1)}% of goal`
                            : "No goal set",

                    styles: {
                        fontSize:
                            "12px",

                        opacity:
                            ".75",

                        textAlign:
                            "center",

                        width:
                            "100%",
                    },
                }
            );

        const progressTrack =
            createElement(
                "div",
                {
                    styles: {
                        width:
                            "100%",

                        height:
                            "4px",

                        borderRadius:
                            "999px",

                        overflow:
                            "hidden",

                        background:
                            "rgba(255,255,255,.08)",
                    },
                }
            );

        const progressFill =
            createElement(
                "div",
                {
                    styles: {
                        height:
                            "100%",

                        width:
                            `${progress}%`,

                        background:
                            "currentColor",

                        opacity:
                            ".65",
                    },
                }
            );

        progressTrack.appendChild(
            progressFill
        );

        let plannerBlock =
            null;

        if (
            plan?.recommendation
        ) {
            const recommendation =
                plan.recommendation;

            plannerBlock =
                createElement(
                    "div",
                    {
                        styles: {
                            width:
                                "100%",

                            marginTop:
                                "4px",

                            paddingTop:
                                "7px",

                            borderTop:
                                "1px solid rgba(255,255,255,.08)",

                            display:
                                "grid",

                            gap:
                                "3px",

                            textAlign:
                                "center",
                        },
                    }
                );

            plannerBlock.append(
                createElement(
                    "div",
                    {
                        text:
                            "TRAINING PLAN",

                        styles: {
                            fontSize:
                                "10px",

                            fontWeight:
                                "700",

                            opacity:
                                ".55",

                            letterSpacing:
                                ".07em",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            recommendation
                                .gymName,

                        styles: {
                            fontSize:
                                "13px",

                            fontWeight:
                                "700",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            trainingModifiers
                                .totalPercent >
                            0
                                ? `Training bonus: +${trainingModifiers.totalPercent}%`
                                : "Training bonus: none",

                        styles: {
                            fontSize:
                                "10px",

                            opacity:
                                ".65",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `~${formatCompactNumber(recommendation.gainPerTrain)} / train`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".8",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `${formatNumber(plan.estimatedTrains)} trains • ${formatNumber(plan.estimatedEnergy)} E`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".8",
                        },
                    }
                )
            );
        }

        card.append(
            title,
            currentRow,
            modifierRow,
            goalInput,
            progressText,
            progressTrack
        );

        if (plannerBlock) {
            card.appendChild(
                plannerBlock
            );
        }

        return card;
    }

    function captureGoalDrafts(
        container
    ) {
        const drafts = {};

        if (!container) {
            return drafts;
        }

        for (
            const input of
            container.querySelectorAll(
                "[data-stat-goal]"
            )
        ) {
            drafts[
                input.dataset
                    .statGoal
            ] =
                input.value;
        }

        return drafts;
    }

    function restoreGoalDrafts(
        container,
        drafts
    ) {
        if (
            !container ||
            !drafts
        ) {
            return;
        }

        for (
            const input of
            container.querySelectorAll(
                "[data-stat-goal]"
            )
        ) {
            const key =
                input.dataset
                    .statGoal;

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        drafts,
                        key
                    )
            ) {
                input.value =
                    drafts[
                        key
                    ];
            }
        }
    }

    function projectBarValue(
        bar,
        loadedAt
    ) {
        const current =
            Number(
                bar?.current
            );

        const maximum =
            Number(
                bar?.maximum
            );

        const increment =
            Number(
                bar?.increment
            );

        const intervalSeconds =
            Number(
                bar?.interval
            );

        const tickSeconds =
            Number(
                bar?.tick_time
            );

        if (
            !Number.isFinite(current) ||
            !Number.isFinite(maximum) ||
            !Number.isFinite(increment) ||
            !Number.isFinite(intervalSeconds) ||
            !Number.isFinite(tickSeconds) ||
            !Number.isFinite(loadedAt)
        ) {
            return current;
        }

        if (
            current >= maximum
        ) {
            return maximum;
        }

        const elapsedSeconds =
            Math.max(
                0,
                (
                    Date.now() -
                    loadedAt
                ) / 1000
            );

        let ticks =
            0;

        if (
            elapsedSeconds >=
            tickSeconds
        ) {
            ticks =
                1 +
                Math.floor(
                    (
                        elapsedSeconds -
                        tickSeconds
                    ) /
                    intervalSeconds
                );
        }

        return Math.min(
            maximum,
            current +
                (
                    ticks *
                    increment
                )
        );
    }

    function stopAutoRefresh() {
        if (
            autoRefreshTimer !==
            null
        ) {
            globalThis.clearInterval(
                autoRefreshTimer
            );

            autoRefreshTimer =
                null;
        }

        if (
            liveBarTimer !==
            null
        ) {
            globalThis.clearInterval(
                liveBarTimer
            );

            liveBarTimer =
                null;
        }

        autoRefreshContainer =
            null;
    }

    function updateLiveBars(
        container
    ) {
        if (
            !container ||
            !container.isConnected
        ) {
            return;
        }

        const data =
            repository.inspect();

        const energy =
            data?.bars?.energy;

        const happiness =
            data?.bars?.happy;

        const energyValue =
            container.querySelector(
                ".tactic-stats-energy-value"
            );

        const happinessValue =
            container.querySelector(
                ".tactic-stats-happiness-value"
            );

        if (
            energyValue &&
            energy
        ) {
            const projectedEnergy =
                projectBarValue(
                    energy,
                    data.loadedAt
                );

            energyValue.textContent =
                `${formatNumber(projectedEnergy)} / ${formatNumber(energy.maximum)}`;
        }

        if (
            happinessValue &&
            happiness
        ) {
            const projectedHappiness =
                projectBarValue(
                    happiness,
                    data.loadedAt
                );

            happinessValue.textContent =
                `${formatNumber(projectedHappiness)} / ${formatNumber(happiness.maximum)}`;
        }
    }

    function startLiveBars(
        container
    ) {
        if (
            liveBarTimer !==
            null
        ) {
            globalThis.clearInterval(
                liveBarTimer
            );
        }

        updateLiveBars(
            container
        );

        liveBarTimer =
            globalThis.setInterval(
                () => {
                    if (
                        !container ||
                        !container.isConnected
                    ) {
                        if (
                            liveBarTimer !==
                            null
                        ) {
                            globalThis.clearInterval(
                                liveBarTimer
                            );

                            liveBarTimer =
                                null;
                        }

                        return;
                    }

                    updateLiveBars(
                        container
                    );
                },
                LIVE_BAR_TICK_MS
            );
    }

    async function runAutoRefresh(
        container
    ) {
        if (
            autoRefreshInFlight ||
            !container ||
            !container.isConnected
        ) {
            return;
        }

        const data =
            repository.inspect();

        if (
            !data
                .apiKeyConfigured
        ) {
            return;
        }

        autoRefreshInFlight =
            true;

        const drafts =
            captureGoalDrafts(
                container
            );

        try {
            await repository
                .refresh();

            if (
                container.isConnected
            ) {
                await render(
                    container
                );

                restoreGoalDrafts(
                    container,
                    drafts
                );
            }
        } catch (error) {
            /*
             * Automatic refresh failures should not destroy the
             * currently displayed Stats page.
             *
             * The manual Refresh Data button remains available
             * for explicit retries.
             */
            logger?.warn(
                "Stats automatic refresh failed",
                {
                    message:
                        error?.message ||
                        String(error),
                }
            );
        } finally {
            autoRefreshInFlight =
                false;
        }
    }

    function startAutoRefresh(
        container
    ) {
        stopAutoRefresh();

        autoRefreshContainer =
            container;

        autoRefreshTimer =
            globalThis.setInterval(
                () => {
                    if (
                        !autoRefreshContainer ||
                        !autoRefreshContainer
                            .isConnected
                    ) {
                        stopAutoRefresh();

                        return;
                    }

                    void runAutoRefresh(
                        autoRefreshContainer
                    );
                },
                AUTO_REFRESH_MS
            );
    }

    async function render(
        container
    ) {
        container.replaceChildren();

        const data =
            repository.inspect();

        const root =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "12px",

                        padding:
                            "4px 0",
                    },
                }
            );

        const header =
            createElement(
                "div"
            );

        const titleRow =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        alignItems:
                            "center",

                        gap:
                            "8px",
                    },
                }
            );

        const titleIcon =
            createElement(
                "span",
                {
                    text:
                        "🏋️",

                    styles: {
                        fontSize:
                            "18px",

                        lineHeight:
                            "1",
                    },
                }
            );

        const titleText =
            createElement(
                "div",
                {
                    text:
                        "Stats & Training",

                    styles: {
                        fontSize:
                            "20px",

                        fontWeight:
                            "700",
                    },
                }
            );

        titleRow.append(
            titleIcon,
            titleText
        );

        header.append(
            titleRow,

            createElement(
                "div",
                {
                    text:
                        "Battle stat goals and gym training planner",

                    styles: {
                        opacity:
                            ".7",

                        marginTop:
                            "3px",
                    },
                }
            )
        );

        root.appendChild(
            header
        );

        if (
            !data
                .apiKeyConfigured
        ) {
            const setup =
                createElement(
                    "div",
                    {
                        styles: {
                            display:
                                "grid",

                            gap:
                                "8px",

                            padding:
                                "12px",

                            border:
                                "1px solid rgba(255,255,255,.12)",

                            borderRadius:
                                "7px",
                        },
                    }
                );

            setup.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "Torn API Key",

                        styles: {
                            fontWeight:
                                "700",
                        },
                    }
                )
            );

            setup.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "TACTIC needs a Torn API key to read your battle stats and gym data. The key is stored locally in Violentmonkey storage.",

                        styles: {
                            opacity:
                                ".75",

                            fontSize:
                                "12px",
                        },
                    }
                )
            );

            const keyInput =
                document.createElement(
                    "input"
                );

            keyInput.type =
                "password";

            keyInput.placeholder =
                "Paste Torn API key";

            Object.assign(
                keyInput.style,
                {
                    padding:
                        "8px",

                    borderRadius:
                        "5px",

                    border:
                        "1px solid rgba(255,255,255,.15)",

                    background:
                        "rgba(0,0,0,.2)",

                    color:
                        "inherit",
                }
            );

            const save =
                createButton(
                    "Save API Key"
                );

            save.addEventListener(
                "click",
                async () => {
                    if (
                        !repository
                            .setApiKey(
                                keyInput
                                    .value
                            )
                    ) {
                        return;
                    }

                    save.textContent =
                        "Loading...";

                    try {
                        await repository
                            .refresh();

                        await render(
                            container
                        );
                    } catch (
                        error
                    ) {
                        save.textContent =
                            error?.message ||
                            "API Error";
                    }
                }
            );

            setup.append(
                keyInput,
                save
            );

            root.appendChild(
                setup
            );

            container.appendChild(
                root
            );

            return;
        }

        const controls =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        const refresh =
            createButton(
                data.loading
                    ? "Refreshing..."
                    : "Refresh Data"
            );

        refresh.disabled =
            data.loading;

        refresh.addEventListener(
            "click",
            async () => {
                refresh.disabled =
                    true;

                refresh.textContent =
                    "Refreshing...";

                try {
                    await repository
                        .refresh();

                    await render(
                        container
                    );
                } catch (
                    error
                ) {
                    refresh.disabled =
                        false;

                    refresh.textContent =
                        error?.message ||
                        "Refresh Failed";
                }
            }
        );

        const clearKey =
            createButton(
                "Change API Key"
            );

        clearKey.addEventListener(
            "click",
            async () => {
                repository
                    .clearApiKey();

                await render(
                    container
                );
            }
        );

        controls.append(
            refresh,
            clearKey
        );

        root.appendChild(
            controls
        );

        const bars =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        const energy =
            data.bars
                ?.energy;

        const happy =
            data.bars
                ?.happy;

        const energyCard =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "10px 8px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "4px",
                    },
                }
            );

        energyCard.append(
            createElement(
                "div",
                {
                    text:
                        "Energy:",

                    styles: {
                        fontSize:
                            "13px",

                        fontWeight:
                            "500",

                        textAlign:
                            "center",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `${formatNumber(energy?.current)} / ${formatNumber(energy?.maximum)}`,

                    className:
                        "tactic-stats-energy-value",

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "600",

                        textAlign:
                            "center",
                    },
                }
            )

        const happinessCard =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "10px 8px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "4px",
                    },
                }
            );

        happinessCard.append(
            createElement(
                "div",
                {
                    text:
                        "Happiness:",

                    styles: {
                        fontSize:
                            "13px",

                        fontWeight:
                            "500",

                        textAlign:
                            "center",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `${formatNumber(happy?.current)} / ${formatNumber(happy?.maximum)}`,

                    className:
                        "tactic-stats-happiness-value",

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "600",

                        textAlign:
                            "center",
                    },
                }
            )

        bars.append(
            energyCard,
            happinessCard
        );

        root.appendChild(
            bars
        );

        const gymCard =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "4px",

                        padding:
                            "12px 10px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(255,255,255,.025)",
                    },
                }
            );

        gymCard.append(
            createElement(
                "div",
                {
                    text:
                        "ACTIVE GYM",

                    styles: {
                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        opacity:
                            ".65",

                        letterSpacing:
                            ".08em",

                        textAlign:
                            "center",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        formatActiveGym(
                            data.activeGym
                        ),

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "700",

                        textAlign:
                            "center",
                    },
                }
            )
        );

        root.appendChild(
            gymCard
        );

        const goals =
            data.goals;

        const grid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "10px",
                    },
                }
            );

        grid.append(
            createStatCard(
                "strength",
                "Strength",
                data,
                goals
            ),

            createStatCard(
                "defense",
                "Defense",
                data,
                goals
            ),

            createStatCard(
                "speed",
                "Speed",
                data,
                goals
            ),

            createStatCard(
                "dexterity",
                "Dexterity",
                data,
                goals
            )
        );

        root.appendChild(
            grid
        );

        const saveGoals =
            createButton(
                "Save Goals"
            );

        saveGoals.addEventListener(
            "click",
            async () => {
                const values = {};

                for (
                    const input of
                    root.querySelectorAll(
                        "[data-stat-goal]"
                    )
                ) {
                    values[
                        input.dataset
                            .statGoal
                    ] =
                        Number(
                            input.value
                        ) || 0;
                }

                repository.setGoals(
                    values
                );

                saveGoals.textContent =
                    "Goals Saved";

                globalThis.setTimeout(
                    () => {
                        saveGoals.textContent =
                            "Save Goals";
                    },
                    1200
                );

                await render(
                    container
                );
            }
        );

        root.appendChild(
            saveGoals
        );

        if (
            data.lastError
        ) {
            root.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            data
                                .lastError
                                .message,

                        styles: {
                            color:
                                "#ffb4b4",

                            fontSize:
                                "12px",
                        },
                    }
                )
            );
        }

        container.appendChild(
            root
        );
    }

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Stats",

        icon:
            "🏋️",

        version:
            MODULE_VERSION,

        order:
            MODULE_ORDER,

        async init() {
            logger?.info(
                "Stats module initialized"
            );

            return {
                success:
                    true,
            };
        },

        async render(
            container
        ) {
            const result =
                await render(
                    container
                );

            startAutoRefresh(
                container
            );

            startLiveBars(
                container
            );

            const data =
                repository.inspect();

            const age =
                data.loadedAt
                    ? Date.now() -
                    data.loadedAt
                    : Infinity;

            /*
             * When Stats is opened, refresh immediately if the
             * repository data is missing or already stale.
             *
             * Otherwise the normal 60-second cycle takes over.
             */
            if (
                data.apiKeyConfigured &&
                age >
                    AUTO_REFRESH_STALE_MS
            ) {
                globalThis.setTimeout(
                    () => {
                        void runAutoRefresh(
                            container
                        );
                    },
                    0
                );
            }

            return result;
        },

        destroy() {
            stopAutoRefresh();

            logger?.info(
                "Stats module destroyed"
            );
        },
    });

    logger?.info(
        "Stats module loaded"
    );
})();