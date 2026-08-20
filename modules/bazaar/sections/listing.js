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

        useMaxQuantity:
            false,

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
            Number(
                value
            );

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

    function clampQuantity(
        item,
        quantity
    ) {
        if (!item) {
            return 1;
        }

        return Math.min(
            item.ownedQuantity,
            Math.max(
                1,
                Math.floor(
                    Number(
                        quantity
                    ) ||
                    1
                )
            )
        );
    }

    function getDefaultQuantity(
        item
    ) {
        if (!item) {
            return 1;
        }

        return state.useMaxQuantity
            ? item.ownedQuantity
            : 1;
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
                state.useMaxQuantity
                    ? item.ownedQuantity
                    : clampQuantity(
                          item,
                          selection.quantity
                      );
        }

        return state.items;
    }

    function getSelection(
        index
    ) {
        return (
            state.selected
                .get(
                    index
                ) ||
            null
        );
    }

    function isSelected(
        index
    ) {
        return Boolean(
            getSelection(
                index
            )
                ?.selected
        );
    }

    function getDisplayedQuantity(
        item,
        index
    ) {
        const selection =
            getSelection(
                index
            );

        if (
            selection
                ?.selected
        ) {
            return clampQuantity(
                item,
                selection.quantity
            );
        }

        return getDefaultQuantity(
            item
        );
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

        const quantity =
            state.useMaxQuantity
                ? item
                    .ownedQuantity
                : clampQuantity(
                      item,
                      existing
                          ?.quantity ??
                      1
                  );

        state.selected.set(
            index,
            {
                selected:
                    true,

                quantity,
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
            clampQuantity(
                item,
                quantity
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

    function setUseMaxQuantity(
        enabled
    ) {
        state.useMaxQuantity =
            enabled ===
            true;

        if (
            !state.useMaxQuantity
        ) {
            return;
        }

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

            selection.quantity =
                item
                    .ownedQuantity;
        }
    }

    function setSelectedToMax() {
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

            selection.quantity =
                item
                    .ownedQuantity;
        }
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
                clampQuantity(
                    item,
                    selection.quantity
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
                    bazaarPage
                        .setQuantity(
                            item
                                .source
                                .row,
                            entry
                                .quantity
                        );

                const priceResult =
                    bazaarPage
                        .applyDiscountToRow(
                            item
                                .source
                                .row,
                            state
                                .discountPercent
                        );

                results.push({
                    name:
                        item.name,

                    quantity:
                        entry.quantity,

                    price:
                        entry
                            .listingPrice,

                    applied:
                        quantityWritten ===
                            true &&
                        priceResult
                            ?.applied ===
                            true,

                    quantityWritten,

                    priceResult,
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

    function createMetric(
        label,
        value
    ) {
        const metric =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-metric",
                    }
                );

        metric.append(
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-metric-label",

                        text:
                            label,
                    }
                ),

            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-metric-value",

                        text:
                            value,
                    }
                )
        );

        return metric;
    }

    function createToolbarButton(
        text,
        onClick
    ) {
        return components
            .createButton(
                text,
                {
                    className:
                        "tactic-bazaar-toolbar-button",

                    onClick,
                }
            );
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
                            "tactic-bazaar-header",
                    }
                );

        header.append(
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-title",

                        text:
                            "Bazaar Listing Helper",
                    }
                ),

            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-description",

                        text:
                            "Prepare quantities and listing prices from current market value.",
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

        const discountRow =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-control-row",
                    }
                );

        const discountLabel =
            components
                .createElement(
                    "label",
                    {
                        className:
                            "tactic-bazaar-control-label",

                        text:
                            "Discount from Market Value",
                    }
                );

        const discountInputWrap =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-discount-input-wrap",
                    }
                );

        const discountInput =
            components
                .createElement(
                    "input",
                    {
                        className:
                            "tactic-bazaar-discount-input",

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

        discountInputWrap.append(
            discountInput,

            components
                .createElement(
                    "span",
                    {
                        className:
                            "tactic-bazaar-percent-symbol",

                        text:
                            "%",
                    }
                )
        );

        discountRow.append(
            discountLabel,
            discountInputWrap
        );

        controls.appendChild(
            discountRow
        );

        const maxToggleLabel =
            components
                .createElement(
                    "label",
                    {
                        className:
                            "tactic-bazaar-max-toggle",
                    }
                );

        const maxToggle =
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

        maxToggle.checked =
            state.useMaxQuantity;

        maxToggle
            .addEventListener(
                "change",
                () => {
                    setUseMaxQuantity(
                        maxToggle
                            .checked
                    );

                    render(
                        container
                    );
                }
            );

        maxToggleLabel.append(
            maxToggle,

            components
                .createElement(
                    "span",
                    {
                        text:
                            "Use max owned quantity",
                    }
                )
        );

        controls.appendChild(
            maxToggleLabel
        );

        const toolbar =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-toolbar",
                    }
                );

        toolbar.append(
            createToolbarButton(
                "Select All",
                () => {
                    selectAll();

                    render(
                        container
                    );
                }
            ),

            createToolbarButton(
                "Clear",
                () => {
                    clearSelection();

                    render(
                        container
                    );
                }
            ),

            createToolbarButton(
                "Set Selected to Max",
                () => {
                    setSelectedToMax();

                    render(
                        container
                    );
                }
            ),

            createToolbarButton(
                "Refresh",
                () => {
                    render(
                        container
                    );
                }
            )
        );

        controls.appendChild(
            toolbar
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

        const inventoryHeader =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-inventory-header",
                    }
                );

        inventoryHeader.append(
            components
                .createElement(
                    "span",
                    {
                        text:
                            "Items",
                    }
                ),

            components
                .createElement(
                    "span",
                    {
                        text:
                            String(
                                state.items
                                    .length
                            ),
                    }
                )
        );

        root.appendChild(
            inventoryHeader
        );

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
                    const selected =
                        isSelected(
                            index
                        );

                    const listingPrice =
                        calculatePrice(
                            item
                                .marketValue
                        );

                    const available =
                        item
                            .priceable &&
                        item
                            .verified;

                    const card =
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        [
                                            "tactic-bazaar-item",
                                            selected
                                                ? "is-selected"
                                                : "",
                                            !available
                                                ? "is-disabled"
                                                : "",
                                        ]
                                            .filter(
                                                Boolean
                                            )
                                            .join(
                                                " "
                                            ),
                                }
                            );

                    const itemHeader =
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-item-header",
                                }
                            );

                    const checkbox =
                        components
                            .createElement(
                                "input",
                                {
                                    className:
                                        "tactic-bazaar-item-checkbox",

                                    attributes: {
                                        type:
                                            "checkbox",
                                    },
                                }
                            );

                    checkbox.checked =
                        selected;

                    checkbox.disabled =
                        !available;

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

                    const itemName =
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
                            );

                    itemHeader.append(
                        checkbox,
                        itemName
                    );

                    card.appendChild(
                        itemHeader
                    );

                    const values =
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-item-values",
                                }
                            );

                    values.append(
                        createMetric(
                            "Owned",
                            item
                                .ownedQuantity
                        ),

                        createMetric(
                            "Market",
                            formatMoney(
                                item
                                    .marketValue
                            )
                        ),

                        createMetric(
                            "List",
                            formatMoney(
                                listingPrice
                            )
                        )
                    );

                    card.appendChild(
                        values
                    );

                    if (!available) {
                        const warning =
                            components
                                .createElement(
                                    "div",
                                    {
                                        className:
                                            "tactic-bazaar-item-warning",

                                        text:
                                            "Current market value is unavailable.",
                                    }
                                );

                        card.appendChild(
                            warning
                        );
                    }

                    const quantityRow =
                        components
                            .createElement(
                                "div",
                                {
                                    className:
                                        "tactic-bazaar-quantity-row",
                                }
                            );

                    const quantityLabel =
                        components
                            .createElement(
                                "label",
                                {
                                    className:
                                        "tactic-bazaar-quantity-label",

                                    text:
                                        "Quantity",
                                }
                            );

                    const quantityInput =
                        components
                            .createElement(
                                "input",
                                {
                                    className:
                                        "tactic-bazaar-quantity-input",

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
                                                getDisplayedQuantity(
                                                    item,
                                                    index
                                                )
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

                    quantityRow.append(
                        quantityLabel,
                        quantityInput
                    );

                    card.appendChild(
                        quantityRow
                    );

                    list.appendChild(
                        card
                    );
                }
            );

        root.appendChild(
            list
        );

        const summary =
            createSummary();

        const footer =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-footer",
                    }
                );

        const summaryGrid =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-summary-grid",
                    }
                );

        summaryGrid.append(
            createMetric(
                "Selected",
                summary
                    .itemCount
            ),

            createMetric(
                "Quantity",
                summary
                    .quantity
            ),

            createMetric(
                "Market",
                formatMoney(
                    summary
                        .marketValue
                )
            ),

            createMetric(
                "Listing",
                formatMoney(
                    summary
                        .listingValue
                )
            )
        );

        footer.appendChild(
            summaryGrid
        );

        const discountSummary =
            components
                .createElement(
                    "div",
                    {
                        className:
                            "tactic-bazaar-discount-summary",

                        text:
                            `${state.discountPercent}% below market · ${formatMoney(summary.discountValue)} discount`,
                    }
                );

        footer.appendChild(
            discountSummary
        );

        const prepareButton =
            components
                .createButton(
                    "Prepare Selected Listings",
                    {
                        className:
                            "tactic-bazaar-prepare-button",

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

        footer.appendChild(
            prepareButton
        );

        root.appendChild(
            footer
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

        setSelectedToMax,

        setUseMaxQuantity,

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

                useMaxQuantity:
                    state
                        .useMaxQuantity,

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