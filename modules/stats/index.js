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

    const storage =
        TACTIC.services?.storage;

    const PLANNER_SETTINGS_STORAGE_KEY =
        "stats:training-planner-settings";

    const DEFAULT_PLANNER_SETTINGS =
        Object.freeze({
            dailyRefill:
                true,

            xanaxEnabled:
                false,

            xanaxPerDay:
                3,

            energyDrinksEnabled:
                false,

            energyDrinksPerDay:
                0,

            energyPerDrink:
                30,

            fhcEnabled:
                false,

            fhcPerDay:
                0,
        });

    if (
        !repository ||
        !training ||
        !storage
    ) {
        console.error(
            "[TACTIC Stats] Stats Repository, Training service, or Storage service unavailable."
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

    function formatDuration(
        seconds
    ) {
        const totalSeconds =
            Math.max(
                0,
                Math.round(
                    Number(seconds) || 0
                )
            );

        const days =
            Math.floor(
                totalSeconds /
                    86400
            );

        const hours =
            Math.floor(
                (
                    totalSeconds %
                    86400
                ) /
                    3600
            );

        const minutes =
            Math.floor(
                (
                    totalSeconds %
                    3600
                ) /
                    60
            );

        if (days > 0) {
            return `${days}d ${hours}h`;
        }

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        return `${minutes}m`;
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

    function normalizePlannerSettings(
        value
    ) {
        const source =
            value &&
            typeof value ===
                "object"
                ? value
                : {};

        return {
            dailyRefill:
                source.dailyRefill !==
                    undefined
                    ? Boolean(
                        source.dailyRefill
                    )
                    : DEFAULT_PLANNER_SETTINGS
                        .dailyRefill,

            xanaxEnabled:
                Boolean(
                    source.xanaxEnabled
                ),

            xanaxPerDay:
                Math.min(
                    3,
                    Math.max(
                        1,
                        Math.round(
                            Number(
                                source.xanaxPerDay
                            ) ||
                            DEFAULT_PLANNER_SETTINGS
                                .xanaxPerDay
                        )
                    )
                ),

            energyDrinksEnabled:
                Boolean(
                    source
                        .energyDrinksEnabled
                ),

            energyDrinksPerDay:
                Math.min(
                    12,
                    Math.max(
                        0,
                        Math.round(
                            Number(
                                source
                                    .energyDrinksPerDay
                            ) || 0
                        )
                    )
                ),

            energyPerDrink:
                Math.max(
                    0,
                    Math.round(
                        Number(
                            source
                                .energyPerDrink
                        ) ||
                        DEFAULT_PLANNER_SETTINGS
                            .energyPerDrink
                    )
                ),

            fhcEnabled:
                Boolean(
                    source.fhcEnabled
                ),

            fhcPerDay:
                Math.min(
                    4,
                    Math.max(
                        0,
                        Math.round(
                            Number(
                                source.fhcPerDay
                            ) || 0
                        )
                    )
                ),
        };
    }

    function getPlannerSettings() {
        return normalizePlannerSettings(
            storage.get(
                PLANNER_SETTINGS_STORAGE_KEY,
                DEFAULT_PLANNER_SETTINGS
            )
        );
    }

    function savePlannerSettings(
        settings
    ) {
        const normalized =
            normalizePlannerSettings(
                settings
            );

        storage.set(
            PLANNER_SETTINGS_STORAGE_KEY,
            normalized
        );

        return normalized;
    }

    function stylePlannerField(
        element
    ) {
        Object.assign(
            element.style,
            {
                width:
                    "100%",

                boxSizing:
                    "border-box",

                padding:
                    "6px 8px",

                borderRadius:
                    "5px",

                border:
                    "1px solid rgba(255,255,255,.15)",

                background:
                    "rgba(0,0,0,.2)",

                color:
                    "#fff",

                fontSize:
                    "12px",

                textAlign:
                    "center",
            }
        );

        return element;
    }

    function createPlannerToggleRow(
        labelText,
        checked
    ) {
        const row =
            createElement(
                "label",
                {
                    styles: {
                        display:
                            "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "space-between",

                        gap:
                            "10px",

                        cursor:
                            "pointer",

                        fontSize:
                            "12px",
                    },
                }
            );

        const label =
            createElement(
                "span",
                {
                    text:
                        labelText,
                }
            );

        const checkbox =
            document.createElement(
                "input"
            );

        checkbox.type =
            "checkbox";

        checkbox.checked =
            checked;

        checkbox.style.width =
            "16px";

        checkbox.style.height =
            "16px";

        row.append(
            label,
            checkbox
        );

        return {
            row,
            checkbox,
        };
    }

    function createPlannerSettingsPanel() {
        let settings =
            getPlannerSettings();

        const panel =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "12px",

                        padding:
                            "12px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.025)",
                    },
                }
            );

        const heading =
            createElement(
                "div",
                {
                    text:
                        "TRAINING PLANNER SETTINGS",

                    styles: {
                        textAlign:
                            "center",

                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".07em",

                        opacity:
                            ".7",
                    },
                }
            );

        panel.appendChild(
            heading
        );

        /*
         * DAILY REFILL
         */

        const dailyRefill =
            createPlannerToggleRow(
                "Include daily energy refill",
                settings.dailyRefill
            );

        dailyRefill.checkbox.addEventListener(
            "change",
            () => {
                settings.dailyRefill =
                    dailyRefill.checkbox.checked;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        panel.appendChild(
            dailyRefill.row
        );

        /*
         * XANAX
         */

        const xanaxSection =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",

                        paddingTop:
                            "10px",

                        borderTop:
                            "1px solid rgba(255,255,255,.08)",
                    },
                }
            );

        const xanaxToggle =
            createPlannerToggleRow(
                "Include Xanax",
                settings.xanaxEnabled
            );

        const xanaxControl =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "1fr 90px",

                        gap:
                            "8px",

                        alignItems:
                            "center",
                    },
                }
            );

        xanaxControl.appendChild(
            createElement(
                "div",
                {
                    text:
                        "Xanax per day",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            )
        );

        const xanaxSelect =
            stylePlannerField(
                document.createElement(
                    "select"
                )
            );

        xanaxSelect.style.backgroundColor =
            "#1b1b1b";

        xanaxSelect.style.color =
            "#fff";

        for (
            const amount of
            [1, 2, 3]
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                String(amount);

            option.textContent =
                String(amount);

            option.style.backgroundColor =
                "#1b1b1b";

            option.style.color =
                "#fff";

            xanaxSelect.appendChild(
                option
            );
        }

        xanaxSelect.value =
            String(
                settings.xanaxPerDay
            );

        xanaxSelect.disabled =
            !settings.xanaxEnabled;

        xanaxToggle.checkbox.addEventListener(
            "change",
            () => {
                settings.xanaxEnabled =
                    xanaxToggle.checkbox.checked;

                xanaxSelect.disabled =
                    !settings.xanaxEnabled;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        xanaxSelect.addEventListener(
            "change",
            () => {
                settings.xanaxPerDay =
                    Number(
                        xanaxSelect.value
                    );

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        xanaxControl.appendChild(
            xanaxSelect
        );

        xanaxSection.append(
            xanaxToggle.row,
            xanaxControl
        );

        panel.appendChild(
            xanaxSection
        );

        /*
         * ENERGY DRINKS
         */

        const drinksSection =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",

                        paddingTop:
                            "10px",

                        borderTop:
                            "1px solid rgba(255,255,255,.08)",
                    },
                }
            );

        const drinksToggle =
            createPlannerToggleRow(
                "Include energy drinks",
                settings.energyDrinksEnabled
            );

        const drinksGrid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "1fr 90px",

                        gap:
                            "8px",

                        alignItems:
                            "center",
                    },
                }
            );

        const drinksQty =
            stylePlannerField(
                document.createElement(
                    "input"
                )
            );

        drinksQty.type =
            "number";

        drinksQty.min =
            "0";

        drinksQty.max =
            "12";

        drinksQty.step =
            "1";

        drinksQty.value =
            String(
                settings.energyDrinksPerDay
            );

        const drinkEnergy =
            stylePlannerField(
                document.createElement(
                    "input"
                )
            );

        drinkEnergy.type =
            "number";

        drinkEnergy.min =
            "0";

        drinkEnergy.step =
            "1";

        drinkEnergy.value =
            String(
                settings.energyPerDrink
            );

        drinksQty.disabled =
            !settings.energyDrinksEnabled;

        drinkEnergy.disabled =
            !settings.energyDrinksEnabled;

        drinksGrid.append(
            createElement(
                "div",
                {
                    text:
                        "Max drinks / day",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            ),
            drinksQty,

            createElement(
                "div",
                {
                    text:
                        "Energy per drink",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            ),
            drinkEnergy
        );

        drinksToggle.checkbox.addEventListener(
            "change",
            () => {
                settings.energyDrinksEnabled =
                    drinksToggle.checkbox.checked;

                drinksQty.disabled =
                    !settings.energyDrinksEnabled;

                drinkEnergy.disabled =
                    !settings.energyDrinksEnabled;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        drinksQty.addEventListener(
            "input",
            () => {
                const value =
                    Math.min(
                        12,
                        Math.max(
                            0,
                            Math.round(
                                Number(
                                    drinksQty.value
                                ) || 0
                            )
                        )
                    );

                drinksQty.value =
                    String(value);

                settings.energyDrinksPerDay =
                    value;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        drinkEnergy.addEventListener(
            "input",
            () => {
                settings.energyPerDrink =
                    Number(
                        drinkEnergy.value
                    ) || 0;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        drinksSection.append(
            drinksToggle.row,
            drinksGrid
        );

        panel.appendChild(
            drinksSection
        );

        /*
         * FHC
         */

        const fhcSection =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",

                        paddingTop:
                            "10px",

                        borderTop:
                            "1px solid rgba(255,255,255,.08)",
                    },
                }
            );

        const fhcToggle =
            createPlannerToggleRow(
                "Include FHC",
                settings.fhcEnabled
            );

        const fhcControl =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "1fr 90px",

                        gap:
                            "8px",

                        alignItems:
                            "center",
                    },
                }
            );

        fhcControl.appendChild(
            createElement(
                "div",
                {
                    text:
                        "Max FHC / day",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            )
        );

        const fhcQty =
            stylePlannerField(
                document.createElement(
                    "input"
                )
            );

        fhcQty.type =
            "number";

        fhcQty.min =
            "0";

        fhcQty.max =
            "4";

        fhcQty.step =
            "1";

        fhcQty.value =
            String(
                settings.fhcPerDay
            );

        fhcQty.disabled =
            !settings.fhcEnabled;

        fhcToggle.checkbox.addEventListener(
            "change",
            () => {
                settings.fhcEnabled =
                    fhcToggle.checkbox.checked;

                fhcQty.disabled =
                    !settings.fhcEnabled;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        fhcQty.addEventListener(
            "input",
            () => {
                const value =
                    Math.min(
                        4,
                        Math.max(
                            0,
                            Math.round(
                                Number(
                                    fhcQty.value
                                ) || 0
                            )
                        )
                    );

                fhcQty.value =
                    String(value);

                settings.fhcPerDay =
                    value;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        fhcControl.appendChild(
            fhcQty
        );

        fhcSection.append(
            fhcToggle.row,
            fhcControl
        );

        panel.appendChild(
            fhcSection
        );

        return panel;
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

        const energyBar =
            data?.bars?.energy;

        const naturalEnergyPlan =
            plan?.estimatedEnergy > 0
                ? training.estimateNaturalEnergyTime({
                    energyRequired:
                        plan.estimatedEnergy,

                    currentEnergy:
                        energyBar?.current,

                    energyIncrement:
                        energyBar?.increment,

                    energyInterval:
                        energyBar?.interval,
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
                            `${formatCompactNumber(recommendation.gainPerTrain)} / train`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".85",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `${formatNumber(plan.estimatedTrains)} trains`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".85",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `${formatNumber(plan.estimatedEnergy)} E`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".85",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "Natural Energy:",

                        styles: {
                            marginTop:
                                "3px",

                            fontSize:
                                "10px",

                            opacity:
                                ".6",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            naturalEnergyPlan
                                ? formatDuration(
                                    naturalEnergyPlan.seconds
                                )
                                : "—",

                        styles: {
                            fontSize:
                                "11px",

                            fontWeight:
                                "600",

                            textAlign:
                                "center",
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
        );

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
        );

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

        const plannerSettingsPanel =
            createPlannerSettingsPanel();

        root.appendChild(
            plannerSettingsPanel
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
             * Otherwise the normal automatic refresh cycle takes over.
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