(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Bazaar Tool] Namespace is unavailable."
        );

        return;
    }

    const components =
        TACTIC.services
            ?.components;

    const logger =
        TACTIC.services
            ?.logger;

    const MODULE_ID =
        "tools";

    const SECTION_ID =
        "bazaar-listing";

    const DEFAULT_DISCOUNT_PERCENT =
        5;

    const state = {
        discountPercent:
            DEFAULT_DISCOUNT_PERCENT,

        detectedCount:
            0,

        eligibleCount:
            0,

        appliedCount:
            0,

        failedCount:
            0,

        lastRefreshAt:
            null,

        autoApplied:
            false,

        liveRefreshTimerId:
            null,

        mountedContainer:
            null,

        lastPageSignature:
            null,
    };

    function getBazaarPage() {
        return (
            TACTIC.services
                ?.dom
                ?.pages
                ?.getHelper?.(
                    "bazaar-listing"
                ) ||
            null
        );
    }

    function getSnapshot() {
        const helper =
            getBazaarPage();

        if (
            typeof helper
                ?.getListingSnapshot !==
            "function"
        ) {
            return [];
        }

        try {
            return (
                helper
                    .getListingSnapshot() ||
                []
            );
        } catch (error) {
            logger?.error(
                "Bazaar Tool could not read listings",
                {
                    error,
                }
            );

            return [];
        }
    }

    function getPageSignature() {
        const snapshot =
            getSnapshot();

        const detectedCount =
            snapshot.length;

        const eligibleCount =
            snapshot.filter(
                item =>
                    item
                        ?.priceable ===
                        true &&
                    (
                        item
                            ?.marketValue
                            ?.verified ===
                            true ||
                        item
                            ?.verified ===
                            true
                    )
            ).length;

        return {
            detectedCount,

            eligibleCount,

            signature:
                `${detectedCount}:${eligibleCount}`,
        };
    }

    function stopLiveRefresh() {
        if (
            state.liveRefreshTimerId !==
            null
        ) {
            globalThis.clearInterval(
                state.liveRefreshTimerId
            );

            state.liveRefreshTimerId =
                null;
        }

        state.mountedContainer =
            null;
    }

    function startLiveRefresh(
        container
    ) {
        state.mountedContainer =
            container;

        if (
            state.liveRefreshTimerId !==
            null
        ) {
            return;
        }

        state.liveRefreshTimerId =
            globalThis.setInterval(
                () => {
                    const mountedContainer =
                        state
                            .mountedContainer;

                    if (
                        !mountedContainer ||
                        !mountedContainer
                            .isConnected
                    ) {
                        stopLiveRefresh();

                        return;
                    }

                    const pageState =
                        getPageSignature();

                    /*
                     * Leaving the Bazaar resets automatic preparation.
                     * When Bazaar appears again, it can prepare the newly
                     * mounted Torn inputs once.
                     */
                    if (
                        pageState
                            .detectedCount ===
                        0
                    ) {
                        state.autoApplied =
                            false;
                    }

                    if (
                        pageState
                            .signature ===
                        state
                            .lastPageSignature
                    ) {
                        return;
                    }

                    state.lastPageSignature =
                        pageState
                            .signature;

                    render(
                        mountedContainer
                    );
                },
                1000
            );
    }

    function normalizeDiscount(
        value
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
            return DEFAULT_DISCOUNT_PERCENT;
        }

        return Math.min(
            100,
            Math.max(
                0,
                numeric
            )
        );
    }

    function applyListingPrices() {
        const helper =
            getBazaarPage();

        const snapshot =
            getSnapshot();

        state.detectedCount =
            snapshot.length;

        state.eligibleCount =
            0;

        state.appliedCount =
            0;

        state.failedCount =
            0;

        const results =
            [];

        if (
            !helper ||
            typeof helper
                .applyDiscountToRow !==
            "function"
        ) {
            state.lastRefreshAt =
                Date.now();

            return {
                detected:
                    snapshot.length,

                eligible:
                    0,

                applied:
                    0,

                failed:
                    snapshot.length,

                results,
            };
        }

        for (
            const item of
            snapshot
        ) {
            const verified =
                item
                    ?.marketValue
                    ?.verified ===
                    true ||
                item
                    ?.verified ===
                    true;

            const priceable =
                item
                    ?.priceable ===
                true;

            const row =
                item
                    ?.row ||
                null;

            if (
                !verified ||
                !priceable ||
                !row
            ) {
                continue;
            }

            state.eligibleCount +=
                1;

            try {
                const result =
                    helper
                        .applyDiscountToRow(
                            row,
                            state
                                .discountPercent
                        );

                if (
                    result
                        ?.applied ===
                    true
                ) {
                    state.appliedCount +=
                        1;
                } else {
                    state.failedCount +=
                        1;
                }

                results.push({
                    name:
                        item
                            ?.name ||
                        "Unknown item",

                    ...result,
                });
            } catch (error) {
                state.failedCount +=
                    1;

                results.push({
                    name:
                        item
                            ?.name ||
                        "Unknown item",

                    applied:
                        false,

                    reason:
                        error
                            ?.message ||
                        "unknown-error",
                });

                logger?.error(
                    "Bazaar Tool could not apply listing price",
                    {
                        item:
                            item
                                ?.name ||
                            null,

                        error,
                    }
                );
            }
        }

        state.lastRefreshAt =
            Date.now();

        logger?.info(
            "Bazaar listing prices refreshed",
            {
                discountPercent:
                    state
                        .discountPercent,

                detected:
                    state
                        .detectedCount,

                eligible:
                    state
                        .eligibleCount,

                applied:
                    state
                        .appliedCount,

                failed:
                    state
                        .failedCount,
            }
        );

        return {
            detected:
                state.detectedCount,

            eligible:
                state.eligibleCount,

            applied:
                state.appliedCount,

            failed:
                state.failedCount,

            results,
        };
    }

    function render(
        container
    ) {
        if (
            !container ||
            !components
        ) {
            return;
        }

        startLiveRefresh(
            container
        );

        components
            .clearElement(
                container
            );

        const snapshot =
            getSnapshot();

        state.detectedCount =
            snapshot.length;

        state.eligibleCount =
            snapshot.filter(
                item =>
                    item
                        ?.priceable ===
                        true &&
                    (
                        item
                            ?.marketValue
                            ?.verified ===
                            true ||
                        item
                            ?.verified ===
                            true
                    )
            ).length;

        state.lastPageSignature =
            `${state.detectedCount}:${state.eligibleCount}`;

        if (
            state.detectedCount ===
            0
        ) {
            state.autoApplied =
                false;
        }

        const root =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-tool-card",
                    }
                );

        root.append(
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-tool-title",

                        text:
                            "🏷️ Bazaar Listing Helper",
                    }
                ),

            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-tool-description",

                        text:
                            "Automatically fill Bazaar sale prices using a percentage below current market value.",
                    }
                )
        );

        const discountRow =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-tool-setting-row",
                    }
                );

        const label =
            components
                .createElement(
                    "label",
                    {
                        className:
                            "tactic-tool-setting-label",

                        text:
                            "Discount from Market Value",
                    }
                );

        const inputWrapper =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-tool-number-wrap",
                    }
                );

        const discountInput =
            components
                .createElement(
                    "input",
                    {
                        className:
                            "tactic-tool-number-input",

                        attributes: {
                            type:
                                "number",

                            min:
                                "0",

                            max:
                                "100",

                            step:
                                "0.1",

                            value:
                                String(
                                    state
                                        .discountPercent
                                ),
                        },
                    }
                );

        discountInput
            .addEventListener(
                "change",
                () => {
                    state.discountPercent =
                        normalizeDiscount(
                            discountInput
                                .value
                        );

                    discountInput.value =
                        String(
                            state
                                .discountPercent
                        );
                }
            );

        inputWrapper.append(
            discountInput,

            components
                .createElement(
                    "span",
                    {
                        text:
                            "%",
                    }
                )
        );

        discountRow.append(
            label,
            inputWrapper
        );

        root.appendChild(
            discountRow
        );

        const status =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-tool-status",
                    }
                );

        status.append(
            components
                .createElement(
                    "div",
                    {
                        text:
                            `${state.detectedCount} Bazaar items detected`,
                    }
                ),

            components
                .createElement(
                    "div",
                    {
                        text:
                            `${state.eligibleCount} prices available`,
                    }
                )
        );

        root.appendChild(
            status
        );

        const refreshButton =
            components
                .createButton(
                    "Refresh Listing Prices",
                    {
                        className:
                            "tactic-tool-primary-button",

                        onClick() {
                            applyListingPrices();

                            render(
                                container
                            );
                        },
                    }
                );

        refreshButton.disabled =
            state.eligibleCount ===
            0;

        root.appendChild(
            refreshButton
        );

        if (
            state.lastRefreshAt
        ) {
            root.appendChild(
                components
                    .createElement(
                        "div",
                        {
                            className:
                                "tactic-tool-result",

                            text:
                                `Last update: ${state.appliedCount} prices updated${
                                    state.failedCount > 0
                                        ? ` · ${state.failedCount} failed`
                                        : ""
                                }`,
                        }
                    )
            );
        }

        container.appendChild(
            root
        );

        /*
         * Automatically prepare prices once when the tool first
         * becomes available on a populated Bazaar listing page.
         */
        if (
            !state.autoApplied &&
            state.eligibleCount >
                0
        ) {
            state.autoApplied =
                true;

            globalThis.setTimeout(
                () => {
                    applyListingPrices();

                    render(
                        container
                    );
                },
                0
            );
        }
    }

    const section = {
        id:
            SECTION_ID,

        moduleId:
            MODULE_ID,

        name:
            "Bazaar Listing Helper",

        icon:
            "🏷️",

        enabled:
            true,

        order:
            10,

        render,

        refresh:
            applyListingPrices,

        applyListingPrices,

        inspect() {
            return {
                moduleId:
                    MODULE_ID,

                sectionId:
                    SECTION_ID,

                discountPercent:
                    state
                        .discountPercent,

                detectedCount:
                    state
                        .detectedCount,

                eligibleCount:
                    state
                        .eligibleCount,

                appliedCount:
                    state
                        .appliedCount,

                failedCount:
                    state
                        .failedCount,

                lastRefreshAt:
                    state
                        .lastRefreshAt,

                helperAvailable:
                    Boolean(
                        getBazaarPage()
                    ),
                
                liveRefreshActive:
                    state.liveRefreshTimerId !==
                    null,

                lastPageSignature:
                    state.lastPageSignature,
            };
        },
    };

    if (
        !TACTIC.tools ||
        typeof TACTIC.tools
            .registerSection !==
            "function"
    ) {
        console.error(
            "[TACTIC Bazaar Tool] Tools application is unavailable."
        );

        return;
    }

    TACTIC.tools.registerSection(
        section
    );

    TACTIC.modules =
        TACTIC.modules ||
        {};

    TACTIC.modules.tools =
        TACTIC.modules.tools ||
        {};

    TACTIC.modules
        .tools
        .bazaarListing =
        section;

    logger?.info(
        "Bazaar Listing Tool loaded"
    );
})();