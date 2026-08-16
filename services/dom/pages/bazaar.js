/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/bazaar.js
 *
 * Purpose:
 * Provides safe DOM access for Torn's Bazaar item-listing page.
 *
 * Responsibilities:
 * - Detect Bazaar listing rows
 * - Read item names
 * - Read owned quantities
 * - Read current Torn market values
 * - Locate quantity inputs
 * - Locate visible listing-price inputs
 * - Safely prepare quantity and price fields
 * - Expose listing-row diagnostics
 *
 * Does NOT:
 * - Submit Bazaar listings
 * - Click ADD TO BAZAAR
 * - Derive prices from previous sale prices
 * - Treat the existing price field as market value
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Bazaar DOM] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (
        !dom ||
        !dom.pages ||
        typeof dom.pages.registerHelper !==
            "function"
    ) {
        console.error(
            "[TACTIC Bazaar DOM] DOM page-helper subsystem is unavailable."
        );

        return;
    }

    const HELPER_ID =
        "bazaar-listing";

    /*
     * Verified from Torn's Bazaar listing page.
     */
    const SELECTORS =
        Object.freeze({
            ROW:
                'li[data-group="child"]',

            ITEM_NAME:
                ".name-wrap .t-overflow",

            OWNED_QUANTITY:
                ".item-amount.qty",

            MARKET_VALUE:
                '.info-wrap[title="Market value"]',

            QUANTITY_INPUT:
                'input[name="amount"][placeholder="Qty"]',

            PRICE_INPUT:
                'input.input-money[data-input-money-visible="true"]',

            HIDDEN_PRICE_INPUT:
                'input[type="hidden"][name="price"]',

            SUBMIT_BUTTON:
                'input[type="submit"][value="ADD TO BAZAAR"]',
        });

    const metrics = {
        loadedAt:
            Date.now(),

        rowReads:
            0,

        snapshotReads:
            0,

        quantityWrites:
            0,

        priceWrites:
            0,

        writeFailures:
            0,

        lastWriteAt:
            null,

        lastError:
            null,
    };

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

    function parseInteger(
        value
    ) {
        const normalized =
            normalizeText(
                value
            );

        if (!normalized) {
            return null;
        }

        const numeric =
            Number(
                normalized.replace(
                    /[^0-9-]/g,
                    ""
                )
            );

        return Number.isSafeInteger(
            numeric
        )
            ? numeric
            : null;
    }

    function parseMoney(
        value
    ) {
        const parsed =
            parseInteger(
                value
            );

        return (
            Number.isSafeInteger(
                parsed
            ) &&
            parsed >= 0
        )
            ? parsed
            : null;
    }

    function getRows() {
        metrics.rowReads +=
            1;

        return Array.from(
            document.querySelectorAll(
                SELECTORS.ROW
            )
        );
    }

    function getItemName(
        row
    ) {
        return normalizeText(
            row?.querySelector?.(
                SELECTORS.ITEM_NAME
            )?.textContent
        ) || null;
    }

    function getOwnedQuantity(
        row
    ) {
        return parseInteger(
            row?.querySelector?.(
                SELECTORS.OWNED_QUANTITY
            )?.textContent
        );
    }

    function getMarketValue(
        row
    ) {
        const element =
            row?.querySelector?.(
                SELECTORS.MARKET_VALUE
            );

        const raw =
            normalizeText(
                element?.textContent
            );

        const value =
            parseMoney(
                raw
            );

        return {
            available:
                Number.isSafeInteger(
                    value
                ),

            verified:
                Number.isSafeInteger(
                    value
                ),

            value:
                Number.isSafeInteger(
                    value
                )
                    ? value
                    : null,

            raw,

            source:
                "torn-market-value",
        };
    }

    function getQuantityInput(
        row
    ) {
        return (
            row?.querySelector?.(
                SELECTORS.QUANTITY_INPUT
            ) ||
            null
        );
    }

    function getPriceInput(
        row
    ) {
        return (
            row?.querySelector?.(
                SELECTORS.PRICE_INPUT
            ) ||
            null
        );
    }

    function getHiddenPriceInput(
        row
    ) {
        return (
            row?.querySelector?.(
                SELECTORS.HIDDEN_PRICE_INPUT
            ) ||
            null
        );
    }

    function getSubmitButton() {
        return (
            document.querySelector(
                SELECTORS.SUBMIT_BUTTON
            ) ||
            null
        );
    }

    /*
     * Use the native HTMLInputElement value setter so React/
     * framework-controlled fields receive the same kind of value
     * update they expect from normal input interaction.
     */
    function setInputValue(
        input,
        value
    ) {
        if (
            !input ||
            input.tagName !==
                "INPUT"
        ) {
            return false;
        }

        const descriptor =
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            );

        if (
            !descriptor ||
            typeof descriptor.set !==
                "function"
        ) {
            return false;
        }

        descriptor.set.call(
            input,
            String(value)
        );

        input.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles:
                        true,
                }
            )
        );

        input.dispatchEvent(
            new Event(
                "change",
                {
                    bubbles:
                        true,
                }
            )
        );

        return true;
    }

    function setQuantity(
        row,
        quantity
    ) {
        const normalized =
            Number(
                quantity
            );

        if (
            !Number.isSafeInteger(
                normalized
            ) ||
            normalized < 0
        ) {
            throw new RangeError(
                "Bazaar quantity must be a non-negative whole number."
            );
        }

        const owned =
            getOwnedQuantity(
                row
            );

        if (
            Number.isSafeInteger(
                owned
            ) &&
            normalized > owned
        ) {
            throw new RangeError(
                `Bazaar quantity ${normalized} exceeds owned quantity ${owned}.`
            );
        }

        const input =
            getQuantityInput(
                row
            );

        const success =
            setInputValue(
                input,
                normalized === 0
                    ? ""
                    : normalized
            );

        if (!success) {
            metrics.writeFailures +=
                1;

            return false;
        }

        metrics.quantityWrites +=
            1;

        metrics.lastWriteAt =
            Date.now();

        return true;
    }

    function setPrice(
        row,
        price
    ) {
        const normalized =
            Math.floor(
                Number(
                    price
                )
            );

        if (
            !Number.isSafeInteger(
                normalized
            ) ||
            normalized < 1
        ) {
            throw new RangeError(
                "Bazaar price must be a positive whole-dollar amount."
            );
        }

        const input =
            getPriceInput(
                row
            );

        const success =
            setInputValue(
                input,
                normalized
            );

        if (!success) {
            metrics.writeFailures +=
                1;

            return false;
        }

        metrics.priceWrites +=
            1;

        metrics.lastWriteAt =
            Date.now();

        return true;
    }

    function calculateDiscountPrice(
        marketValue,
        discountPercent
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
            value < 0
        ) {
            throw new RangeError(
                "Market value must be a non-negative number."
            );
        }

        if (
            !Number.isFinite(
                discount
            ) ||
            discount < 0 ||
            discount > 100
        ) {
            throw new RangeError(
                "Discount percent must be between 0 and 100."
            );
        }

        /*
         * Always round DOWN.
         *
         * A requested percentage below market should never round
         * upward and accidentally become less discounted than
         * requested.
         */
        return Math.floor(
            value *
            (
                1 -
                discount /
                    100
            )
        );
    }

    function getRowSnapshot(
        row,
        index =
            null
    ) {
        metrics.snapshotReads +=
            1;

        const marketValue =
            getMarketValue(
                row
            );

        const quantityInput =
            getQuantityInput(
                row
            );

        const priceInput =
            getPriceInput(
                row
            );

        const hiddenPriceInput =
            getHiddenPriceInput(
                row
            );

        return {
            index,

            name:
                getItemName(
                    row
                ),

            ownedQuantity:
                getOwnedQuantity(
                    row
                ),

            marketValue,

            quantity: {
                available:
                    Boolean(
                        quantityInput
                    ),

                value:
                    parseInteger(
                        quantityInput
                            ?.value
                    ),

                raw:
                    quantityInput
                        ?.value ??
                    "",
            },

            price: {
                available:
                    Boolean(
                        priceInput
                    ),

                /*
                 * This is the existing Torn listing/previous-sale
                 * value only. It is NEVER used as TACTIC's pricing
                 * basis.
                 */
                existingValue:
                    parseMoney(
                        priceInput
                            ?.value
                    ),

                existingRaw:
                    priceInput
                        ?.value ??
                    "",

                hiddenValue:
                    hiddenPriceInput
                        ?.value ??
                    "",
            },

            priceable:
                marketValue.available &&
                Boolean(
                    priceInput
                ),

            selectable:
                Boolean(
                    quantityInput
                ),

            row,
        };
    }

    function getListingSnapshot() {
        return getRows()
            .map(
                (
                    row,
                    index
                ) =>
                    getRowSnapshot(
                        row,
                        index
                    )
            );
    }

    function applyDiscountToRow(
        row,
        discountPercent
    ) {
        const snapshot =
            getRowSnapshot(
                row
            );

        if (
            !snapshot.priceable ||
            !snapshot.marketValue
                .verified
        ) {
            return {
                applied:
                    false,

                reason:
                    "market-value-unavailable",

                snapshot,
            };
        }

        const calculatedPrice =
            calculateDiscountPrice(
                snapshot
                    .marketValue
                    .value,
                discountPercent
            );

        if (
            calculatedPrice <
            1
        ) {
            return {
                applied:
                    false,

                reason:
                    "calculated-price-invalid",

                snapshot,
            };
        }

        const written =
            setPrice(
                row,
                calculatedPrice
            );

        return {
            applied:
                written,

            reason:
                written
                    ? "price-prepared"
                    : "price-write-failed",

            discountPercent:
                Number(
                    discountPercent
                ),

            marketValue:
                snapshot
                    .marketValue
                    .value,

            price:
                calculatedPrice,

            name:
                snapshot.name,
        };
    }

    function isReady() {
        const rows =
            getRows();

        const priceableRows =
            rows.filter(
                row => {
                    const snapshot =
                        getRowSnapshot(
                            row
                        );

                    return (
                        snapshot.priceable &&
                        snapshot.marketValue
                            .verified
                    );
                }
            );

        return {
            ready:
                rows.length >
                    0 &&
                priceableRows.length >
                    0,

            rowCount:
                rows.length,

            priceableRowCount:
                priceableRows.length,

            submitButtonFound:
                Boolean(
                    getSubmitButton()
                ),
        };
    }

    function isCurrent() {
        return (
            Boolean(
                getSubmitButton()
            ) &&
            getRows().length >
                0
        );
    }

    function inspect() {
        const snapshot =
            getListingSnapshot();

        return {
            helperId:
                HELPER_ID,

            current:
                isCurrent(),

            readiness:
                isReady(),

            selectors: {
                ...SELECTORS,
            },

            rows: {
                total:
                    snapshot.length,

                withVerifiedMarketValue:
                    snapshot.filter(
                        item =>
                            item
                                .marketValue
                                .verified
                    ).length,

                priceable:
                    snapshot.filter(
                        item =>
                            item.priceable
                    ).length,

                selectable:
                    snapshot.filter(
                        item =>
                            item.selectable
                    ).length,
            },

            sample:
                snapshot
                    .slice(
                        0,
                        5
                    )
                    .map(
                        item => ({
                            index:
                                item.index,

                            name:
                                item.name,

                            ownedQuantity:
                                item.ownedQuantity,

                            marketValue:
                                item.marketValue,

                            quantity:
                                item.quantity,

                            price:
                                item.price,

                            priceable:
                                item.priceable,
                        })
                    ),

            metrics: {
                ...metrics,
            },
        };
    }

    const bazaar =
        Object.freeze({
            id:
                HELPER_ID,

            name:
                "Bazaar Listing",

            description:
                "Reads and safely prepares Torn Bazaar item-listing fields.",

            /*
             * These are custom capabilities. The page framework
             * supports explicit capability -> method mappings.
             */
            capabilities: {
                "page.ready":
                    "isReady",

                "page.inspect":
                    "inspect",

                "bazaar.listing.rows.read":
                    "getListingSnapshot",

                "bazaar.listing.row.read":
                    "getRowSnapshot",

                "bazaar.listing.market-value.read":
                    "getMarketValue",

                "bazaar.listing.quantity.set":
                    "setQuantity",

                "bazaar.listing.price.set":
                    "setPrice",

                "bazaar.listing.discount.calculate":
                    "calculateDiscountPrice",

                "bazaar.listing.discount.apply-row":
                    "applyDiscountToRow",
            },

            metadata: {
                category:
                    "bazaar",

                listingHelper:
                    true,

                pricingBasis:
                    "torn-market-value",

                submissionRestricted:
                    true,

                selectorsVerified:
                    true,
            },

            isCurrent,
            isReady,

            getRows,

            getItemName,
            getOwnedQuantity,
            getMarketValue,

            getQuantityInput,
            getPriceInput,
            getHiddenPriceInput,
            getSubmitButton,

            getRowSnapshot,
            getListingSnapshot,

            calculateDiscountPrice,

            setQuantity,
            setPrice,

            applyDiscountToRow,

            inspect,
        });

    dom.pages.registerHelper(
        HELPER_ID,
        bazaar,
        {
            replace:
                true,
        }
    );

    logger?.info(
        "Bazaar listing DOM helper loaded",
        {
            helperId:
                HELPER_ID,

            pricingBasis:
                "torn-market-value",

            submissionRestricted:
                true,
        }
    );
})();