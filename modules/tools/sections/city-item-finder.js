(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC City Item Finder] Namespace is unavailable."
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
        "city-item-finder";

    const MARKER_SIZE =
        72;

    const POLL_INTERVAL_MS =
        1000;
    
    const STORAGE_KEY_ENABLED =
        "tactic:tools:city-item-finder:enabled";
    
    function readEnabledSetting() {
        try {
            const stored =
                globalThis.localStorage
                    ?.getItem(
                        STORAGE_KEY_ENABLED
                    );

            if (stored === null) {
                return true;
            }

            return stored ===
                "true";
        } catch {
            return true;
        }
    }

    function writeEnabledSetting(
        enabled
    ) {
        try {
            globalThis.localStorage
                ?.setItem(
                    STORAGE_KEY_ENABLED,
                    enabled
                        ? "true"
                        : "false"
                );
        } catch {
            // Ignore persistence errors.
        }
    }

    const state = {
        enabled:
            readEnabledSetting(),

        timerId:
            null,

        markers:
            new Map(),

        detectedCount:
            0,

        lastRefreshAt:
            null,

        statusEnabledElement:
            null,

        statusCountElement:
            null,
    };

    function getPageWindow() {
        return (
            document
                ?.defaultView ||
            globalThis
        );
    }

    function getTorn() {
        return (
            getPageWindow()
                ?.torn ||
            globalThis
                ?.torn ||
            null
        );
    }

    function getLeaflet() {
        return (
            getPageWindow()
                ?.L ||
            globalThis
                ?.L ||
            null
        );
    }

    function getRuntimeStatus() {
        const torn =
            getTorn();

        const leaflet =
            getLeaflet();

        return {
            torn:
                Boolean(
                    torn
                ),

            leaflet:
                Boolean(
                    leaflet
                ),

            model:
                Boolean(
                    torn
                        ?.model
                ),

            modelGet:
                typeof torn
                    ?.model
                    ?.get ===
                "function",

            map:
                Boolean(
                    torn
                        ?.map
                ),

            leafletMap:
                Boolean(
                    torn
                        ?.map
                        ?.lmap
                ),

            getLPoint:
                typeof torn
                    ?.map
                    ?.getLPoint ===
                "function",

            crs:
                Boolean(
                    leaflet
                        ?.CRS
                        ?.EPSG3857
                ),

            pointToLatLng:
                typeof leaflet
                    ?.CRS
                    ?.EPSG3857
                    ?.pointToLatLng ===
                "function",

            divIcon:
                typeof leaflet
                    ?.divIcon ===
                "function",

            marker:
                typeof leaflet
                    ?.marker ===
                "function",
        };
    }

    function runtimeReady() {
        const status =
            getRuntimeStatus();

        return Object.values(
            status
        ).every(
            value =>
                value ===
                true
        );
    }

    function firstDefined(
        object,
        keys
    ) {
        for (
            const key of
            keys
        ) {
            if (
                object &&
                object[key] !==
                    undefined &&
                object[key] !==
                    null
            ) {
                return object[key];
            }
        }

        return undefined;
    }

    function toNumber(
        value,
        base = 10
    ) {
        if (
            typeof value ===
                "number" &&
            Number.isFinite(
                value
            )
        ) {
            return value;
        }

        const text =
            String(
                value ??
                ""
            )
                .trim();

        if (!text) {
            return null;
        }

        const numeric =
            base === 10 &&
            /^-?\d+(?:\.\d+)?$/
                .test(
                    text
                )
                ? Number(
                      text
                  )
                : parseInt(
                      text,
                      base
                  );

        return Number.isFinite(
            numeric
        )
            ? numeric
            : null;
    }

    function toBase36(
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
            return "";
        }

        return Math.floor(
            numeric
        ).toString(
            36
        );
    }

    function buildPickupToken(
        item
    ) {
        const raw =
            item?.raw ||
            item;

        const coordinates =
            raw?.coordinates;

        const x =
            Array.isArray(
                coordinates
            )
                ? Number(
                    coordinates[0]
                )
                : Number(
                    item?.x
                );

        const y =
            Array.isArray(
                coordinates
            )
                ? Number(
                    coordinates[1]
                )
                : Number(
                    item?.y
                );

        const rowId =
            Number(
                raw?.row_id ??
                item?.rowId
            );

        const timestamp =
            Number(
                raw?.timestamp
            );

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(rowId) ||
            !Number.isFinite(timestamp)
        ) {
            return null;
        }

        const payload =
            [
                toBase36(x),
                toBase36(y),
                toBase36(rowId),
                toBase36(timestamp),
            ].join(
                "O"
            );

        try {
            return globalThis.btoa(
                payload
            );
        } catch {
            return null;
        }
    }

    function parseItem(
        raw
    ) {
        if (
            !raw ||
            typeof raw !==
                "object"
        ) {
            return null;
        }

        let x =
            null;

        let y =
            null;

        if (
            Array.isArray(
                raw.coordinates
            )
        ) {
            x =
                raw.coordinates[0];

            y =
                raw.coordinates[1];
        } else if (
            raw.c &&
            typeof raw.c ===
                "object"
        ) {
            x =
                raw.c.x;

            y =
                raw.c.y;
        } else {
            x =
                raw.x;

            y =
                raw.y;
        }

        const parsedX =
            toNumber(
                x,
                36
            );

        const parsedY =
            toNumber(
                y,
                36
            );

        if (
            !Number.isFinite(
                parsedX
            ) ||
            !Number.isFinite(
                parsedY
            )
        ) {
            return null;
        }

        const itemIdRaw =
            firstDefined(
                raw,
                [
                    "item_id",
                    "itemID",
                    "itemId",
                    "item",
                    "ID",
                ]
            );

        const itemId =
            toNumber(
                itemIdRaw,
                10
            ) ||
            toNumber(
                raw.d,
                36
            );

        const rowRaw =
            firstDefined(
                raw,
                [
                    "row_id",
                    "rowID",
                    "rowId",
                    "id",
                ]
            );

        const rowId =
            rowRaw ===
            undefined
                ? ""
                : String(
                      rowRaw
                  );

        const title =
            String(
                raw.title ||
                raw.name ||
                (
                    itemId
                        ? `Item #${itemId}`
                        : "City item"
                )
            );

        return {
            key:
                [
                    rowId ||
                        "row",
                    itemId ||
                        title,
                    Math.round(
                        parsedX
                    ),
                    Math.round(
                        parsedY
                    ),
                ].join(
                    "|"
                ),

            rowId,

            itemId,

            title,

            x:
                parsedX,

            y:
                parsedY,

            raw,
        };
    }

    function getItems() {
        if (
            !runtimeReady()
        ) {
            return [];
        }

        let rawItems =
            [];

        try {
            rawItems =
                getTorn()
                    .model
                    .get(
                        "territoryUserItems"
                    ) ||
                [];
        } catch {
            rawItems =
                [];
        }

        if (
            typeof rawItems ===
                "string"
        ) {
            try {
                rawItems =
                    JSON.parse(
                        rawItems
                    );
            } catch {
                rawItems =
                    [];
            }
        }

        if (
            !Array.isArray(
                rawItems
            ) &&
            rawItems &&
            typeof rawItems ===
                "object"
        ) {
            rawItems =
                Object.values(
                    rawItems
                );
        }

        return (
            Array.isArray(
                rawItems
            )
                ? rawItems
                : []
        )
            .map(
                parseItem
            )
            .filter(
                Boolean
            );
    }

    function getLatLng(
        item
    ) {
        if (
            !runtimeReady() ||
            !item
        ) {
            return null;
        }

        const torn =
            getTorn();

        const leaflet =
            getLeaflet();

        try {
            const point = [
                item.x / 2,
                item.y / 2,
            ];

            const leafletPoint =
                torn.map
                    .getLPoint(
                        point
                    );

            const latLng =
                leaflet.CRS
                    .EPSG3857
                    .pointToLatLng(
                        leafletPoint,
                        torn.map
                            .minZoom
                    );

            if (
                !latLng ||
                !Number.isFinite(
                    latLng.lat
                ) ||
                !Number.isFinite(
                    latLng.lng
                )
            ) {
                return null;
            }

            return latLng;
        } catch (
            error
        ) {
            logger?.debug(
                "City Item Finder could not resolve item position",
                {
                    item:
                        item.title,

                    error,
                }
            );

            return null;
        }
    }

    function getItemImageUrl(
        itemId
    ) {
        if (!itemId) {
            return "";
        }

        return (
            "https://www.torn.com/images/items/" +
            `${itemId}/small.png`
        );
    }

    function removeMarker(
        key
    ) {
        const marker =
            state.markers
                .get(
                    key
                );

        if (!marker) {
            return;
        }

        try {
            marker.remove?.();
        } catch {
            try {
                getTorn()
                    ?.map
                    ?.lmap
                    ?.removeLayer?.(
                        marker
                    );
            } catch {
                // Ignore cleanup errors.
            }
        }

        state.markers.delete(
            key
        );
    }

    function clearMarkers() {
        for (
            const key of
            [
                ...state
                    .markers
                    .keys(),
            ]
        ) {
            removeMarker(
                key
            );
        }

        state.detectedCount =
            0;

        updateStatusDisplay();
    }

    function createMarker(
        item,
        latLng
    ) {
        const torn =
            getTorn();

        const leaflet =
            getLeaflet();

        if (
            !torn ||
            !leaflet
        ) {
            return null;
        }

        const imageUrl =
            getItemImageUrl(
                item.itemId
            );

        const icon =
            leaflet.divIcon({
                className:
                    "tactic-city-item-map-marker",

                html:
                    `
                    <div class="tactic-city-item-map-marker-inner">
                        ${
                            imageUrl
                                ? `<img src="${imageUrl}" alt="">`
                                : ""
                        }
                    </div>
                    `,

                iconSize: [
                    MARKER_SIZE,
                    MARKER_SIZE,
                ],

                iconAnchor: [
                    MARKER_SIZE /
                        2,
                    MARKER_SIZE /
                        2,
                ],
            });

        const marker =
            leaflet.marker(
                latLng,
                {
                    icon,

                    interactive:
                        true,

                    keyboard:
                        false,

                    zIndexOffset:
                        30000,
                }
            );

        marker.addTo(
            torn.map.lmap
        );

        const element =
            marker
                .getElement?.();

        if (element) {
            /*
             * Torn's City item handling recognizes this class/data
             * shape. We are only making the existing target larger.
             */
            element.classList.add(
                "city-item"
            );

            if (
                item.itemId
            ) {
                element.dataset.id =
                    String(
                        item.itemId
                    );

                element.dataset.itemId =
                    String(
                        item.itemId
                    );
            }

            if (
                item.rowId
            ) {
                element.dataset.entryId =
                    toBase36(
                        item.rowId
                    );
            }

            const pickupToken =
                buildPickupToken(
                    item
                );

            if (
                pickupToken
            ) {
                element.dataset.td =
                    pickupToken;
            }

            element.title =
                item.title;
        }

        return marker;
    }

    function updateStatusDisplay() {
        const enabledElement =
            state.statusEnabledElement;

        const countElement =
            state.statusCountElement;

        if (
            enabledElement &&
            enabledElement.isConnected
        ) {
            enabledElement.textContent =
                state.enabled
                    ? "Finder enabled"
                    : "Finder disabled";
        }

        if (
            countElement &&
            countElement.isConnected
        ) {
            countElement.textContent =
                state.enabled
                    ? `${state.detectedCount} collectible${
                        state.detectedCount ===
                        1
                            ? ""
                            : "s"
                    } highlighted`
                    : "No map modifications active";
        }
    }

    function syncMarkers() {
        state.lastRefreshAt =
            Date.now();

        if (
            !state.enabled ||
            !runtimeReady()
        ) {
            clearMarkers();

            return [];
        }

        const items =
            getItems();

        const activeKeys =
            new Set(
                items.map(
                    item =>
                        item.key
                )
            );

        for (
            const key of
            [
                ...state
                    .markers
                    .keys(),
            ]
        ) {
            if (
                !activeKeys.has(
                    key
                )
            ) {
                removeMarker(
                    key
                );
            }
        }

        for (
            const item of
            items
        ) {
            const latLng =
                getLatLng(
                    item
                );

            if (!latLng) {
                continue;
            }

            const existing =
                state.markers
                    .get(
                        item.key
                    );

            if (existing) {
                existing
                    .setLatLng?.(
                        latLng
                    );

                continue;
            }

            const marker =
                createMarker(
                    item,
                    latLng
                );

            if (
                marker
            ) {
                state.markers.set(
                    item.key,
                    marker
                );
            }
        }

        state.detectedCount =
            state.markers
                .size;

        updateStatusDisplay();

        return items;
    }

    function stopWatcher() {
        if (
            state.timerId !==
            null
        ) {
            globalThis.clearInterval(
                state.timerId
            );

            state.timerId =
                null;
        }

        clearMarkers();
    }

    function startWatcher() {
        if (
            state.timerId !==
            null
        ) {
            return;
        }

        syncMarkers();

        state.timerId =
            globalThis.setInterval(
                syncMarkers,
                POLL_INTERVAL_MS
            );
    }

    function setEnabled(
        enabled
    ) {
        state.enabled =
            enabled ===
            true;
        
        writeEnabledSetting(
            state.enabled
        );

        if (
            state.enabled
        ) {
            startWatcher();
        } else {
            stopWatcher();
        }

        logger?.info(
            "City Item Finder toggled",
            {
                enabled:
                    state.enabled,

                detectedCount:
                    state
                        .detectedCount,
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

        if (
            state.enabled
        ) {
            syncMarkers();
        }

        components.clearElement(
            container
        );

        const root =
            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-card",
                }
            );

        root.append(
            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-title",

                    text:
                        "🗺️ City Map Item Finder",
                }
            ),

            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-description",

                    text:
                        "Enlarge collectibles on the city map.",
                }
            )
        );

        const toggleRow =
            components.createElement(
                "div",
                {
                    className:
                        "tactic-city-item-toggle-row",
                }
            );

        toggleRow.appendChild(
            components.createElement(
                "div",
                {
                    className:
                        "tactic-city-item-toggle-label",

                    text:
                        "Item Finder",
                }
            )
        );

        const toggle =
            components.createButton(
                state.enabled
                    ? "ON"
                    : "OFF",
                {
                    className:
                        [
                            "tactic-tool-toggle",
                            state.enabled
                                ? "is-on"
                                : "is-off",
                        ].join(
                            " "
                        ),

                    attributes: {
                        "aria-pressed":
                            state.enabled
                                ? "true"
                                : "false",

                        title:
                            state.enabled
                                ? "Turn Item Finder off"
                                : "Turn Item Finder on",
                    },

                    onClick() {
                        setEnabled(
                            !state.enabled
                        );

                        render(
                            container
                        );
                    },
                }
            );

        toggleRow.appendChild(
            toggle
        );

        root.appendChild(
            toggleRow
        );

        const status =
            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-status",
                }
            );

        const statusEnabledElement =
            components.createElement(
                "div",
                {
                    text:
                        state.enabled
                            ? "Finder enabled"
                            : "Finder disabled",
                }
            );

        const statusCountElement =
            components.createElement(
                "div",
                {
                    text:
                        state.enabled
                            ? `${state.detectedCount} collectible${
                                state.detectedCount ===
                                1
                                    ? ""
                                    : "s"
                            } highlighted`
                            : "No map modifications active",
                }
            );

        state.statusEnabledElement =
            statusEnabledElement;

        state.statusCountElement =
            statusCountElement;

        status.append(
            statusEnabledElement,
            statusCountElement
        );

        root.appendChild(
            status
        );

        container.appendChild(
            root
        );
    }

    if (
        state.enabled
    ) {
        startWatcher();
    }

    const section = {
        id:
            SECTION_ID,

        moduleId:
            MODULE_ID,

        name:
            "City Map Item Finder",

        icon:
            "🗺️",

        enabled:
            true,

        order:
            20,

        render,

        setEnabled,

        refresh:
            syncMarkers,

        inspect() {
            return {
                moduleId:
                    MODULE_ID,

                sectionId:
                    SECTION_ID,

                enabled:
                    state.enabled,

                watcherActive:
                    state.timerId !==
                    null,

                runtimeReady:
                    runtimeReady(),

                runtimeStatus:
                    getRuntimeStatus(),

                detectedCount:
                    state.detectedCount,

                modelItemCount:
                    getItems()
                        .length,

                lastRefreshAt:
                    state.lastRefreshAt,

                markerCount:
                    state.markers
                        .size,
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
            "[TACTIC City Item Finder] Tools application is unavailable."
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
        .cityItemFinder =
        section;

    logger?.info(
        "City Map Item Finder loaded"
    );
})();