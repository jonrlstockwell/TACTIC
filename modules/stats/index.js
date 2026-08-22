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

    const repository =
        TACTIC.repositories?.stats;

    const logger =
        TACTIC.services?.logger;

    if (!repository) {
        console.error(
            "[TACTIC Stats] Stats Repository unavailable."
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
                        "8px 12px",

                    borderRadius:
                        "5px",

                    border:
                        "1px solid rgba(255,255,255,.18)",

                    background:
                        "rgba(255,255,255,.08)",

                    color:
                        "inherit",
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

        const card =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "14px 16px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.035)",

                        display:
                            "grid",

                        gap:
                            "9px",

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
                            "14px",
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
                            "22px",

                        fontWeight:
                            "700",

                        lineHeight:
                            "1.1",
                    },
                }
            );

        const modifierRow =
            createElement(
                "div",
                {
                    text:
                        `Training modifier: ${stat?.modifier ?? "—"}`,

                    styles: {
                        opacity:
                            ".7",

                        fontSize:
                            "11px",
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
            "Enter target stat";

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
                    "9px 10px",

                borderRadius:
                    "5px",

                border:
                    "1px solid rgba(255,255,255,.15)",

                background:
                    "rgba(0,0,0,.2)",

                color:
                    "inherit",

                fontSize:
                    "14px",
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
                            "11px",

                        opacity:
                            ".75",
                    },
                }
            );

        const progressTrack =
            createElement(
                "div",
                {
                    styles: {
                        height:
                            "5px",

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

        card.append(
            title,
            currentRow,
            modifierRow,
            goalInput,
            progressText,
            progressTrack
        );

        return card;
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

        header.append(
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
            ),

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
                            "flex",

                        gap:
                            "8px",

                        flexWrap:
                            "wrap",
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

        bars.append(
            createElement(
                "div",
                {
                    text:
                        `Energy: ${formatNumber(energy?.current)} / ${formatNumber(energy?.maximum)}`,

                    styles: {
                        padding:
                            "9px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `Happiness: ${formatNumber(happy?.current)} / ${formatNumber(happy?.maximum)}`,

                    styles: {
                        padding:
                            "9px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",
                    },
                }
            )
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
                            "grid",

                        gap:
                            "3px",

                        padding:
                            "10px 12px",

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
                            "10px",

                        fontWeight:
                            "700",

                        opacity:
                            ".55",

                        letterSpacing:
                            ".08em",
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
                            "15px",

                        fontWeight:
                            "600",
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
                            "1fr",

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
            return render(
                container
            );
        },

        destroy() {
            logger?.info(
                "Stats module destroyed"
            );
        },
    });

    logger?.info(
        "Stats module loaded"
    );
})();