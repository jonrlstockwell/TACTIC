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

    const SCAN_INTERVAL_MS =
        750;

    const OVERLAY_CLASS =
        "tactic-city-item-marker";

    const state = {
        enabled:
            false,

        scanTimerId:
            null,

        scanCount:
            0,

        detectedCount:
            0,

        lastScanAt:
            null,

        lastDetectionAt:
            null,

        candidates:
            [],
    };

    function getMapElement() {
        return document.querySelector(
            "#map"
        );
    }

    function getCanvas() {
        return document.querySelector(
            "#map .leaflet-overlay-pane canvas"
        );
    }

    function removeOverlays() {
        document
            .querySelectorAll(
                `.${OVERLAY_CLASS}`
            )
            .forEach(
                element => {
                    element.remove();
                }
            );
    }

    function isCollectibleCandidate(
        candidate
    ) {
        if (!candidate) {
            return false;
        }

        const {
            pixels,
            width,
            height,
            aspectRatio,
        } =
            candidate;

        return (
            pixels >= 70 &&
            width >= 20 &&
            width <= 60 &&
            height >= 20 &&
            height <= 60 &&
            aspectRatio >= 0.75 &&
            aspectRatio <= 1.33
        );
    }

    function findBrightComponents(
        canvas
    ) {
        const context =
            canvas.getContext(
                "2d",
                {
                    willReadFrequently:
                        true,
                }
            );

        if (!context) {
            return [];
        }

        let imageData;

        try {
            imageData =
                context.getImageData(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
        } catch (error) {
            logger?.debug(
                "City Item Finder could not read map canvas",
                {
                    error,
                }
            );

            return [];
        }

        const {
            data,
            width,
            height,
        } =
            imageData;

        const matching =
            new Uint8Array(
                width *
                height
            );

        /*
         * Identify bright, low-saturation pixels.
         *
         * The collectible marker uses a light outer ring.
         * The item image inside can be any color, so we do not
         * attempt to match the item sprite itself.
         */
        for (
            let y = 0;
            y < height;
            y += 1
        ) {
            for (
                let x = 0;
                x < width;
                x += 1
            ) {
                const pixelIndex =
                    y * width +
                    x;

                const dataIndex =
                    pixelIndex * 4;

                const red =
                    data[
                        dataIndex
                    ];

                const green =
                    data[
                        dataIndex + 1
                    ];

                const blue =
                    data[
                        dataIndex + 2
                    ];

                const alpha =
                    data[
                        dataIndex + 3
                    ];

                const brightest =
                    Math.max(
                        red,
                        green,
                        blue
                    );

                const darkest =
                    Math.min(
                        red,
                        green,
                        blue
                    );

                const spread =
                    brightest -
                    darkest;

                if (
                    alpha >= 150 &&
                    red >= 175 &&
                    green >= 175 &&
                    blue >= 175 &&
                    spread <= 45
                ) {
                    matching[
                        pixelIndex
                    ] = 1;
                }
            }
        }

        const visited =
            new Uint8Array(
                width *
                height
            );

        const found =
            [];

        const directions = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
        ];

        for (
            let y = 0;
            y < height;
            y += 1
        ) {
            for (
                let x = 0;
                x < width;
                x += 1
            ) {
                const startIndex =
                    y * width +
                    x;

                if (
                    !matching[
                        startIndex
                    ] ||
                    visited[
                        startIndex
                    ]
                ) {
                    continue;
                }

                const queue = [
                    [x, y],
                ];

                visited[
                    startIndex
                ] = 1;

                let minX =
                    x;

                let maxX =
                    x;

                let minY =
                    y;

                let maxY =
                    y;

                let pixels =
                    0;

                while (
                    queue.length >
                    0
                ) {
                    const [
                        currentX,
                        currentY,
                    ] =
                        queue.pop();

                    pixels +=
                        1;

                    minX =
                        Math.min(
                            minX,
                            currentX
                        );

                    maxX =
                        Math.max(
                            maxX,
                            currentX
                        );

                    minY =
                        Math.min(
                            minY,
                            currentY
                        );

                    maxY =
                        Math.max(
                            maxY,
                            currentY
                        );

                    for (
                        const [
                            offsetX,
                            offsetY,
                        ] of directions
                    ) {
                        const nextX =
                            currentX +
                            offsetX;

                        const nextY =
                            currentY +
                            offsetY;

                        if (
                            nextX < 0 ||
                            nextY < 0 ||
                            nextX >=
                                width ||
                            nextY >=
                                height
                        ) {
                            continue;
                        }

                        const nextIndex =
                            nextY *
                                width +
                            nextX;

                        if (
                            !matching[
                                nextIndex
                            ] ||
                            visited[
                                nextIndex
                            ]
                        ) {
                            continue;
                        }

                        visited[
                            nextIndex
                        ] = 1;

                        queue.push(
                            [
                                nextX,
                                nextY,
                            ]
                        );
                    }
                }

                const componentWidth =
                    maxX -
                    minX +
                    1;

                const componentHeight =
                    maxY -
                    minY +
                    1;

                if (
                    componentWidth <
                        3 ||
                    componentHeight <
                        3 ||
                    componentWidth >
                        60 ||
                    componentHeight >
                        60
                ) {
                    continue;
                }

                found.push({
                    pixels,

                    x:
                        minX,

                    y:
                        minY,

                    width:
                        componentWidth,

                    height:
                        componentHeight,

                    centerX:
                        (
                            minX +
                            maxX
                        ) /
                        2,

                    centerY:
                        (
                            minY +
                            maxY
                        ) /
                        2,

                    aspectRatio:
                        componentWidth /
                        componentHeight,
                });
            }
        }

        return found.filter(
            isCollectibleCandidate
        );
    }

    function forwardMapClick(
        clientX,
        clientY
    ) {
        const map =
            getMapElement();

        if (!map) {
            return;
        }

        /*
         * Leaflet calculates the map coordinate from clientX/clientY.
         * Sending the click to Torn's real map keeps collection under
         * Torn's own event handling.
         */
        const mouseOptions = {
            bubbles:
                true,

            cancelable:
                true,

            view:
                globalThis,

            clientX,

            clientY,

            button:
                0,

            buttons:
                1,
        };

        map.dispatchEvent(
            new MouseEvent(
                "mousedown",
                mouseOptions
            )
        );

        map.dispatchEvent(
            new MouseEvent(
                "mouseup",
                {
                    ...mouseOptions,

                    buttons:
                        0,
                }
            )
        );

        map.dispatchEvent(
            new MouseEvent(
                "click",
                {
                    ...mouseOptions,

                    buttons:
                        0,
                }
            )
        );
    }

    function createOverlay(
        candidate,
        canvas,
        map
    ) {
        const canvasRect =
            canvas.getBoundingClientRect();

        const mapRect =
            map.getBoundingClientRect();

        const scaleX =
            canvasRect.width /
            canvas.width;

        const scaleY =
            canvasRect.height /
            canvas.height;

        const clientX =
            canvasRect.left +
            candidate.centerX *
                scaleX;

        const clientY =
            canvasRect.top +
            candidate.centerY *
                scaleY;

        const mapX =
            clientX -
            mapRect.left;

        const mapY =
            clientY -
            mapRect.top;

        const overlay =
            document.createElement(
                "button"
            );

        overlay.type =
            "button";

        overlay.className =
            OVERLAY_CLASS;

        overlay.setAttribute(
            "aria-label",
            "City collectible item"
        );

        overlay.setAttribute(
            "title",
            "Collectible item"
        );

        overlay.style.left =
            `${mapX}px`;

        overlay.style.top =
            `${mapY}px`;

        overlay.addEventListener(
            "click",
            event => {
                event.preventDefault();

                event.stopPropagation();

                forwardMapClick(
                    clientX,
                    clientY
                );
            }
        );

        map.appendChild(
            overlay
        );
    }

    function scanMap() {
        state.scanCount +=
            1;

        state.lastScanAt =
            Date.now();

        removeOverlays();

        if (!state.enabled) {
            state.detectedCount =
                0;

            state.candidates =
                [];

            return [];
        }

        const map =
            getMapElement();

        const canvas =
            getCanvas();

        if (
            !map ||
            !canvas
        ) {
            state.detectedCount =
                0;

            state.candidates =
                [];

            return [];
        }

        const candidates =
            findBrightComponents(
                canvas
            );

        state.candidates =
            candidates;

        state.detectedCount =
            candidates.length;

        if (
            candidates.length >
            0
        ) {
            state.lastDetectionAt =
                Date.now();
        }

        for (
            const candidate of
            candidates
        ) {
            createOverlay(
                candidate,
                canvas,
                map
            );
        }

        return candidates;
    }

    function stopScanner() {
        if (
            state.scanTimerId !==
            null
        ) {
            globalThis.clearInterval(
                state.scanTimerId
            );

            state.scanTimerId =
                null;
        }

        removeOverlays();
    }

    function startScanner() {
        if (
            state.scanTimerId !==
            null
        ) {
            return;
        }

        scanMap();

        state.scanTimerId =
            globalThis.setInterval(
                scanMap,
                SCAN_INTERVAL_MS
            );
    }

    function setEnabled(
        enabled
    ) {
        state.enabled =
            enabled ===
            true;

        if (
            state.enabled
        ) {
            startScanner();
        } else {
            stopScanner();

            state.detectedCount =
                0;

            state.candidates =
                [];
        }

        logger?.info(
            "City Item Finder toggled",
            {
                enabled:
                    state.enabled,
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
                        "Make collectible City map items larger and easier to see and click.",
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
            components.createElement(
                "label",
                {
                    className:
                        "tactic-city-item-switch",
                }
            );

        const checkbox =
            components.createElement(
                "input",
                {
                    attributes: {
                        type:
                            "checkbox",
                    },
                }
            );

        checkbox.checked =
            state.enabled;

        const slider =
            components.createElement(
                "span",
                {
                    className:
                        "tactic-city-item-switch-slider",
                }
            );

        checkbox.addEventListener(
            "change",
            () => {
                setEnabled(
                    checkbox.checked
                );

                render(
                    container
                );
            }
        );

        toggle.append(
            checkbox,
            slider
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

        status.append(
            components.createElement(
                "div",
                {
                    text:
                        state.enabled
                            ? "Finder enabled"
                            : "Finder disabled",
                }
            ),

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
            )
        );

        root.appendChild(
            status
        );

        container.appendChild(
            root
        );
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

        scan:
            scanMap,

        inspect() {
            return {
                moduleId:
                    MODULE_ID,

                sectionId:
                    SECTION_ID,

                enabled:
                    state.enabled,

                scannerActive:
                    state.scanTimerId !==
                    null,

                scanCount:
                    state.scanCount,

                detectedCount:
                    state.detectedCount,

                lastScanAt:
                    state.lastScanAt,

                lastDetectionAt:
                    state.lastDetectionAt,

                candidates:
                    state.candidates
                        .map(
                            candidate => ({
                                ...candidate,
                            })
                        ),

                mapPresent:
                    Boolean(
                        getMapElement()
                    ),

                canvasPresent:
                    Boolean(
                        getCanvas()
                    ),
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