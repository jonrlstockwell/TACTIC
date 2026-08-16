(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Bazaar Listing] Namespace is unavailable."
        );

        return;
    }

    const components =
        TACTIC.services
            ?.components;

    const logger =
        TACTIC.services
            ?.logger;

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

    const MODULE_ID =
        "bazaar";

    const SECTION_ID =
        "listing";

    const DEFAULT_DISCOUNT_PERCENT =
        5;

    const state = {
        discountPercent:
            DEFAULT_DISCOUNT_PERCENT,

        items:
            [],

        selected:
            new Map(),

        lastRefreshAt:
            null,
    };

    function formatMoney(
        value
    ) {
        const numeric =
            Number(value);

        if (
            !Number.isFinite(
                numeric
            )
        ) {
            return "$0";
        }

        return (
            "$" +
            Math.floor(
                numeric
            ).toLocaleString()
        );
    }

    function calculatePrice(
        marketValue,
        discountPercent =
            state.discountPercent
    ) {
        const value =
            Number(
                marketValue
            );

        const discount =
            Number(
                discountPercent
            );

        if (
            !Number.isFinite(
                value
            ) ||
            value <= 0
        ) {
            return null;
        }

        if (
            !Number.isFinite(
                discount
            )
        ) {
            return null;
        }

        const boundedDiscount =
            Math.min(
                100,
                Math.max(
                    0,
                    discount
                )
            );

        return Math.floor(
            value *
                (
                    1 -
                    boundedDiscount /
                        100
                )
        );
    }

    function getSnapshot() {
        const bazaarPage =
            getBazaarPage();

        if (
            typeof bazaarPage
                ?.getListingSnapshot !==
            "function"
        ) {
            return [];
        }

        try {
            return (
                bazaarPage
                    .getListingSnapshot() ||
                []
            );
        } catch (error) {
            logger?.error(
                "Could not read Bazaar listing snapshot",
                {
                    error,
                }
            );

            return [];
        }
    }

    function normalizeItem(
        item,
        index
    ) {
        const name =
            String(
                item?.name ||
                `Item ${index + 1}`
            );

        const ownedQuantity =
            Math.max(
                0,
                Number(
                    item
                        ?.ownedQuantity ??
                    item
                        ?.owned ??
                    0
                ) ||
                    0
            );

        const marketValue =
            Number(
                item
                    ?.marketValue
                    ?.value ??
                item
                    ?.marketValue ??
                0
            );

        const verified =
            item
                ?.marketValue
                ?.verified ??
            item
                ?.verified ??
            false;

        const priceable =
            Boolean(
                item
                    ?.priceable
            );

        return {
            index,

            name,

            ownedQuantity,

            marketValue:
                Number.isFinite(
                    marketValue
                )
                    ? marketValue
                    : 0,

            verified:
                Boolean(
                    verified
                ),

            priceable,

            source:
                item,
        };
    }

    function refreshItems() {
        state.items =
            getSnapshot()
                .map(
                    normalizeItem
                )
                .filter(
                    item =>
                        item
                            .ownedQuantity >
                            0
                );

        state.lastRefreshAt =
            Date.now();

        for (
            const [
                index,
                selection,
            ] of state.selected
        ) {
            const item =
                state.items[
                    index
                ];

            if (!item) {
                state.selected
                    .delete(
                        index
                    );

                continue;
            }

            selection.quantity =
                Math.min(
                    item
                        .ownedQuantity,
                    Math.max(
                        1,
                        Number(
                            selection
                                .quantity
                        ) ||
                            1
                    )
                );
        }

        return state.items;
    }

    function getSelectedEntries() {
        const entries =
            [];

        for (
            const [
                index,
                selection,
            ] of state.selected
        ) {
            const item =
                state.items[
                    index
                ];

            if (
                !item ||
                !selection
                    ?.selected
            ) {
                continue;
            }

            const quantity =
                Math.min(
                    item
                        .ownedQuantity,
                    Math.max(
                        1,
                        Number(
                            selection
                                .quantity
                        ) ||
                            1
                    )
                );

            const listingPrice =
                calculatePrice(
                    item
                        .marketValue
                );

            entries.push({
                index,

                item,

                quantity,

                listingPrice,
            });
        }

        return entries;
    }

    function createSummary() {
        const selected =
            getSelectedEntries();

        let quantity =
            0;

        let marketValue =
            0;

        let listingValue =
            0;

        for (
            const entry of
            selected
        ) {
            quantity +=
                entry.quantity;

            marketValue +=
                entry.item
                    .marketValue *
                entry.quantity;

            listingValue +=
                (
                    entry.listingPrice ||
                    0
                ) *
                entry.quantity;
        }

        return {
            itemCount:
                selected.length,

            quantity,

            marketValue,

            listingValue,

            discountValue:
                Math.max(
                    0,
                    marketValue -
                        listingValue
                ),
        };
    }

    function setSelected(
        index,
        selected
    ) {
        const item =
            state.items[
                index
            ];

        if (!item) {
            return;
        }

        if (!selected) {
            state.selected
                .delete(
                    index
                );

            return;
        }

        const existing =
            state.selected
                .get(
                    index
                );

        state.selected.set(
            index,
            {
                selected:
                    true,

                quantity:
                    Math.min(
                        item
                            .ownedQuantity,
                        Math.max(
                            1,
                            existing
                                ?.quantity ??
                                item
                                    .ownedQuantity
                        )
                    ),
            }
        );
    }

    function setQuantity(
        index,
        quantity
    ) {
        const item =
            state.items[
                index
            ];

        if (!item) {
            return;
        }

        const normalized =
            Math.min(
                item
                    .ownedQuantity,
                Math.max(
                    1,
                    Number(
                        quantity
                    ) ||
                        1
                )
            );

        const existing =
            state.selected
                .get(
                    index
                ) || {
                    selected:
                        true,
                };

        state.selected.set(
            index,
            {
                ...existing,

                selected:
                    true,

                quantity:
                    normalized,
            }
        );
    }

    function selectAll() {
        state.items
            .forEach(
                (
                    item,
                    index
                ) => {
                    if (
                        !item
                            .priceable ||
                        !item
                            .verified
                    ) {
                        return;
                    }

                    setSelected(
                        index,
                        true
                    );
                }
            );
    }

    function clearSelection() {
        state.selected
            .clear();
    }

    function applySelected() {
        const bazaarPage =
            getBazaarPage();

        if (
            !bazaarPage ||
            typeof bazaarPage
                .setQuantity !==
                "function" ||
            typeof bazaarPage
                .applyDiscountToRow !==
                "function"
        ) {
            logger?.error(
                "Bazaar listing DOM helper is unavailable."
            );

            return [];
        }
        const selected =
            getSelectedEntries();

        const results =
            [];

        for (
            const entry of
            selected
        ) {
            const item =
                entry.item;

            if (
                !item
                    .priceable ||
                !item
                    .verified
            ) {
                results.push({
                    name:
                        item.name,

                    applied:
                        false,

                    reason:
                        "item-not-priceable",
                });

                continue;
            }

            try {
                const quantityWritten =
                    bazaarPage.setQuantity(
                        item.source.row,
                        entry.quantity
                    );

                const priceResult =
                    bazaarPage.applyDiscountToRow(
                        item.source.row,
                        state.discountPercent
                    );

                const result = {
                    applied:
                        quantityWritten ===
                            true &&
                        priceResult
                            ?.applied ===
                            true,

                    quantityWritten,

                    priceResult,
                };

                results.push({
                    name:
                        item.name,

                    quantity:
                        entry.quantity,

                    price:
                        entry
                            .listingPrice,

                    result,
                });
            } catch (error) {
                logger?.error(
                    "Could not prepare Bazaar listing",
                    {
                        item:
                            item.name,

                        error,
                    }
                );

                results.push({
                    name:
                        item.name,

                    applied:
                        false,

                    reason:
                        error
                            ?.message ||
                        "unknown-error",
                });
            }
        }

        return results;
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

        refreshItems();

        components
            .clearElement(
                container
            );

        const root =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-listing",
                    }
                );

        const header =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-section-header",
                    }
                );

        header.append(
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-section-title",

                        text:
                            "Bazaar Listing Helper",
                    }
                ),

            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-section-description",

                        text:
                            "Prepare Bazaar quantities and prices using current market value.",
                    }
                )
        );

        root.appendChild(
            header
        );

        const controls =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-controls",
                    }
                );

        const discountLabel =
            components
                .createElement(
                    "label",
                    {
                        text:
                            "Discount from Market Value",
                    }
                );

        const discountInput =
            components
                .createElement(
                    "input",
                    {
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
                                state
                                    .discountPercent,
                        },
                    }
                );

        discountInput
            .addEventListener(
                "change",
                () => {
                    const value =
                        Number(
                            discountInput
                                .value
                        );

                    state.discountPercent =
                        Math.min(
                            100,
                            Math.max(
                                0,
                                Number.isFinite(
                                    value
                                )
                                    ? value
                                    : DEFAULT_DISCOUNT_PERCENT
                            )
                        );

                    render(
                        container
                    );
                }
            );

        discountLabel.append(
            discountInput,
            document.createTextNode(
                "%"
            )
        );

        controls.append(
            discountLabel,

            components
                .createButton(
                    "Select All",
                    {
                        onClick() {
                            selectAll();

                            render(
                                container
                            );
                        },
                    }
                ),

            components
                .createButton(
                    "Clear Selection",
                    {
                        onClick() {
                            clearSelection();

                            render(
                                container
                            );
                        },
                    }
                ),

            components
                .createButton(
                    "Refresh",
                    {
                        onClick() {
                            render(
                                container
                            );
                        },
                    }
                )
        );

        root.appendChild(
            controls
        );

        if (
            state.items.length ===
            0
        ) {
            root.appendChild(
                components
                    .createEmptyState(
                        "No Bazaar items detected",
                        "Open your Bazaar listing page and refresh the helper."
                    )
            );

            container.appendChild(
                root
            );

            return;
        }

        const list =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-item-list",
                    }
                );

        state.items
            .forEach(
                (
                    item,
                    index
                ) => {
                    const selection =
                        state.selected
                            .get(
                                index
                            );

                    const selected =
                        Boolean(
                            selection
                                ?.selected
                        );

                    const listingPrice =
                        calculatePrice(
                            item
                                .marketValue
                        );

                    const row =
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-item",
                                }
                            );

                    const checkbox =
                        components
                            .createElement(
                                "input",
                                {
                                    attributes: {
                                        type:
                                            "checkbox",
                                    },
                                }
                            );

                    checkbox.checked =
                        selected;

                    checkbox.disabled =
                        !item
                            .priceable ||
                        !item
                            .verified;

                    checkbox
                        .addEventListener(
                            "change",
                            () => {
                                setSelected(
                                    index,
                                    checkbox
                                        .checked
                                );

                                render(
                                    container
                                );
                            }
                        );

                    const details =
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-item-details",
                                }
                            );

                    details.append(
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-item-name",

                                    text:
                                        item
                                            .name,
                                }
                            ),

                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-item-values",

                                    text:
                                        `Owned: ${item.ownedQuantity} · Market: ${formatMoney(item.marketValue)} · List: ${formatMoney(listingPrice)}`,
                                }
                            )
                    );

                    const quantityInput =
                        components
                            .createElement(
                                "input",
                                {
                                    attributes: {
                                        type:
                                            "number",

                                        min:
                                            "1",

                                        max:
                                            String(
                                                item
                                                    .ownedQuantity
                                            ),

                                        value:
                                            String(
                                                selection
                                                    ?.quantity ??
                                                item
                                                    .ownedQuantity
                                            ),
                                    },
                                }
                            );

                    quantityInput.disabled =
                        !selected;

                    quantityInput
                        .addEventListener(
                            "change",
                            () => {
                                setQuantity(
                                    index,
                                    quantityInput
                                        .value
                                );

                                render(
                                    container
                                );
                            }
                        );

                    row.append(
                        checkbox,
                        details,
                        quantityInput
                    );

                    list.appendChild(
                        row
                    );
                }
            );

        root.appendChild(
            list
        );

        const summary =
            createSummary();

        const summaryWrapper =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-summary",
                    }
                );

        summaryWrapper.append(
            components
                .createInfoCard(
                    "Selected Items",
                    summary
                        .itemCount
                ),

            components
                .createInfoCard(
                    "Total Quantity",
                    summary
                        .quantity
                ),

            components
                .createInfoCard(
                    "Market Value",
                    formatMoney(
                        summary
                            .marketValue
                    )
                ),

            components
                .createInfoCard(
                    "Listing Value",
                    formatMoney(
                        summary
                            .listingValue
                    )
                )
        );

        root.appendChild(
            summaryWrapper
        );

        const prepareButton =
            components
                .createButton(
                    "Prepare Selected Listings",
                    {
                        onClick() {
                            const results =
                                applySelected();

                            logger?.info(
                                "Bazaar listings prepared",
                                {
                                    discountPercent:
                                        state
                                            .discountPercent,

                                    results,
                                }
                            );

                            render(
                                container
                            );
                        },
                    }
                );

        prepareButton.disabled =
            summary.itemCount ===
            0;

        root.appendChild(
            prepareButton
        );

        container.appendChild(
            root
        );
    }

    const listingSection = {
        id:
            SECTION_ID,

        moduleId:
            MODULE_ID,

        name:
            "Listing Helper",

        icon:
            "🏷️",

        enabled:
            true,

        order:
            10,

        render,

        refresh:
            refreshItems,

        calculatePrice,

        selectAll,

        clearSelection,

        applySelected,

        inspect() {
            return {
                moduleId:
                    MODULE_ID,

                sectionId:
                    SECTION_ID,

                discountPercent:
                    state
                        .discountPercent,

                itemCount:
                    state
                        .items
                        .length,

                selectedCount:
                    getSelectedEntries()
                        .length,

                summary:
                    createSummary(),

                lastRefreshAt:
                    state
                        .lastRefreshAt,

                bazaarHelperAvailable:
                    Boolean(
                        getBazaarPage()
                    ),
            };
        },
    };

    TACTIC.bazaar.registerSection(
        listingSection
    );

    TACTIC.modules =
        TACTIC.modules ||
        {};

    TACTIC.modules.bazaar =
        TACTIC.modules.bazaar ||
        {};

    TACTIC.modules
        .bazaar
        .listing =
        listingSection;

    logger?.info(
        "Bazaar Listing Helper loaded",
        {
            moduleId:
                MODULE_ID,

            sectionId:
                SECTION_ID,
        }
    );
})();