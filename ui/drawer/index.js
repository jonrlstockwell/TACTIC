(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Drawer] Namespace is unavailable."
        );

        return;
    }

    const storage =
        TACTIC.services.storage;

    const events =
        TACTIC.services.events;

    const logger =
        TACTIC.services.logger;

    const components =
        TACTIC.services.components;

    const DRAWER_OPEN_KEY =
        "ui:drawer-open";

    const ACTIVE_MODULE_KEY =
        "ui:active-module";

    let edgeTab = null;
    let drawer = null;
    let navigation = null;
    let content = null;
    let statusIcon = null;

    function injectStyles() {
        if (
            document.getElementById(
                "tactic-modular-styles"
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                "style"
            );

        style.id =
            "tactic-modular-styles";

        style.textContent = `
            #tactic-modular-tab,
            #tactic-modular-drawer,
            #tactic-modular-drawer * {
                box-sizing: border-box;
                font-family: Arial, sans-serif;
            }

            #tactic-modular-tab {
                position: fixed;
                right: 0;
                top: 45%;
                z-index: 1000001;

                display: flex;
                align-items: center;
                gap: 6px;

                padding: 10px 8px;

                border: 1px solid #666;
                border-right: none;
                border-radius: 8px 0 0 8px;

                background: rgba(25, 25, 25, .97);
                color: #fff;

                font-size: 12px;
                font-weight: 700;

                cursor: pointer;

                writing-mode: vertical-rl;
                text-orientation: mixed;

                box-shadow:
                    -3px 3px 12px
                    rgba(0, 0, 0, .4);

                transition:
                    right .25s ease,
                    background .15s ease;
            }

            #tactic-modular-tab:hover {
                background:
                    rgba(45, 45, 45, .98);
            }

            #tactic-modular-drawer {
                position: fixed;
                top: 0;
                right: 0;
                z-index: 1000000;

                width: 420px;
                max-width: 92vw;
                height: 100vh;

                color: #fff;
                background:
                    rgba(20, 20, 20, .99);

                border-left:
                    1px solid #555;

                box-shadow:
                    -8px 0 28px
                    rgba(0, 0, 0, .5);

                transform:
                    translateX(100%);

                transition:
                    transform .25s ease;

                overflow: hidden;
            }

            #tactic-modular-header {
                height: 64px;

                display: flex;
                align-items: center;
                justify-content:
                    space-between;

                padding: 12px 14px;

                border-bottom:
                    1px solid
                    rgba(255, 255, 255, .14);

                background:
                    rgba(32, 32, 32, .99);
            }

            .tactic-modular-title {
                font-size: 19px;
                font-weight: 800;
                letter-spacing: .6px;
            }

            .tactic-modular-subtitle {
                margin-top: 2px;

                color: #aaa;
                font-size: 11px;
            }

            .tactic-modular-close {
                width: 32px;
                height: 32px;
                padding: 0;

                border:
                    1px solid #666;

                border-radius: 5px;

                background: #292929;
                color: #fff;

                cursor: pointer;
                font-size: 15px;
            }

            #tactic-modular-body {
                display: grid;

                grid-template-columns:
                    145px minmax(0, 1fr);

                height:
                    calc(100vh - 64px);
            }

            #tactic-modular-navigation {
                padding: 10px 8px;

                border-right:
                    1px solid
                    rgba(255, 255, 255, .12);

                background:
                    rgba(27, 27, 27, .99);

                overflow-y: auto;
            }

            .tactic-nav-button {
                display: flex;
                align-items: center;
                gap: 8px;

                width: 100%;
                margin: 0 0 5px;
                padding: 9px 8px;

                border:
                    1px solid transparent;

                border-radius: 5px;

                background: transparent;
                color: #bbb;

                text-align: left;
                cursor: pointer;

                font-size: 12px;
            }

            .tactic-nav-button:hover {
                background:
                    rgba(255, 255, 255, .06);

                color: #fff;
            }

            .tactic-nav-button.active {
                background:
                    rgba(255, 255, 255, .10);

                border-color:
                    rgba(255, 255, 255, .18);

                color: #fff;
            }

            .tactic-nav-button.error {
                color: #ff8f8f;
            }

            #tactic-modular-content {
                min-width: 0;
                padding: 16px;

                overflow-y: auto;
            }

            .tactic-page-heading {
                margin: 0 0 14px;

                font-size: 18px;
                color: #fff;
            }

            .tactic-info-card {
                padding: 11px 12px;

                border:
                    1px solid
                    rgba(255, 255, 255, .14);

                border-radius: 7px;

                background:
                    rgba(255, 255, 255, .04);
            }

            .tactic-info-card-label {
                color: #aaa;

                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: .4px;
            }

            .tactic-info-card-value {
                margin-top: 4px;

                font-size: 16px;
                font-weight: 700;
            }

            .tactic-empty-state {
                padding: 16px;

                border:
                    1px solid
                    rgba(255, 255, 255, .14);

                border-radius: 7px;

                background:
                    rgba(255, 255, 255, .035);
            }

            .tactic-empty-state-title {
                font-weight: 700;
                color: #fff;
            }

            .tactic-empty-state-description {
                margin-top: 6px;

                color: #aaa;
                line-height: 1.5;
            }

            .tactic-primary-button {
                width: 100%;
                margin-top: 8px;
                padding: 10px;

                border: 1px solid #666;
                border-radius: 5px;

                background: #303030;
                color: #fff;

                cursor: pointer;
            }

            .tactic-primary-button:hover {
                background: #3a3a3a;
            }

            /* ============================================================
               Tools
               ============================================================ */

            .tactic-tools-content {
                display: flex;
                flex-direction: column;
                gap: 14px;
                min-width: 0;
            }

            .tactic-tools-section {
                min-width: 0;
            }

            /* ------------------------------------------------------------
               Tool Card
               ------------------------------------------------------------ */

            .tactic-tool-card {
                display: flex;
                flex-direction: column;
                gap: 12px;

                min-width: 0;
                padding: 14px;

                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 10px;

                background:
                    linear-gradient(
                        180deg,
                        rgba(255, 255, 255, 0.025),
                        rgba(255, 255, 255, 0.01)
                    );

                box-sizing: border-box;
            }

            .tactic-tool-title {
                font-size: 14px;
                font-weight: 700;
                line-height: 1.25;
                color: #f5f5f5;
            }

            .tactic-tool-description {
                font-size: 11px;
                line-height: 1.45;
                color: rgba(255, 255, 255, 0.68);
            }

            /* ------------------------------------------------------------
               Settings
               ------------------------------------------------------------ */

            .tactic-tool-setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;

                padding-top: 2px;
            }

            .tactic-tool-setting-label {
                min-width: 0;
                max-width: 130px;

                font-size: 11px;
                font-weight: 700;
                line-height: 1.15;

                color: rgba(255, 255, 255, 0.92);
            }

            .tactic-tool-number-wrap {
                display: flex;
                align-items: center;
                gap: 6px;

                flex: 0 0 auto;

                font-size: 12px;
                font-weight: 700;

                color: rgba(255, 255, 255, 0.9);
            }

            .tactic-tool-number-input {
                width: 64px;
                height: 28px;

                padding: 3px 7px;

                border: 1px solid rgba(255, 255, 255, 0.32);
                border-radius: 4px;

                background: #f4f4f4;
                color: #111;

                font-size: 12px;
                font-weight: 600;

                box-sizing: border-box;
            }

            /* ------------------------------------------------------------
               Detection Status
               ------------------------------------------------------------ */

            .tactic-tool-status {
                display: flex;
                flex-direction: column;
                gap: 5px;

                padding: 10px 11px;

                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 7px;

                background: rgba(255, 255, 255, 0.045);

                font-size: 10px;
                line-height: 1.35;

                color: rgba(255, 255, 255, 0.82);
            }

            .tactic-tool-status > div {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .tactic-tool-status > div:first-child::before {
                content: "◇";

                color: #70b7ff;

                font-size: 12px;
                font-weight: 700;
            }

            .tactic-tool-status > div:last-child::before {
                content: "✓";

                display: inline-flex;
                align-items: center;
                justify-content: center;

                width: 13px;
                height: 13px;

                border-radius: 50%;

                background: rgba(90, 200, 125, 0.18);
                color: #74db98;

                font-size: 9px;
                font-weight: 800;
            }

            /* ------------------------------------------------------------
               Primary Action
               ------------------------------------------------------------ */

            .tactic-tool-primary-button {
                width: 100%;
                min-width: 0;
                min-height: 38px;

                padding: 9px 12px;

                border: 1px solid #6db9ff;
                border-radius: 7px;

                background:
                    linear-gradient(
                        180deg,
                        #3d8cff 0%,
                        #256bd6 100%
                    );

                color: #ffffff;

                font-size: 11px;
                font-weight: 800;
                line-height: 1.2;
                text-align: center;

                box-shadow:
                    0 0 0 1px rgba(80, 160, 255, 0.18),
                    0 3px 10px rgba(0, 90, 210, 0.22);

                cursor: pointer;

                box-sizing: border-box;

                transition:
                    background 120ms ease,
                    border-color 120ms ease,
                    box-shadow 120ms ease,
                    transform 80ms ease;
            }

            .tactic-tool-primary-button::before {
                content: "↻";

                display: inline-block;

                margin-right: 6px;

                font-size: 14px;
                font-weight: 800;
                line-height: 1;
                vertical-align: -1px;
            }

            .tactic-tool-primary-button:hover:not(:disabled) {
                border-color: #9ad0ff;

                background:
                    linear-gradient(
                        180deg,
                        #559cff 0%,
                        #3178e5 100%
                    );

                box-shadow:
                    0 0 0 1px rgba(100, 180, 255, 0.28),
                    0 4px 13px rgba(0, 100, 225, 0.32);
            }

            .tactic-tool-primary-button:active:not(:disabled) {
                transform: translateY(1px);

                background:
                    linear-gradient(
                        180deg,
                        #2878e8 0%,
                        #1e5fc2 100%
                    );

                box-shadow:
                    0 1px 5px rgba(0, 70, 180, 0.3);
            }

            .tactic-tool-primary-button:focus-visible {
                outline: 2px solid rgba(125, 195, 255, 0.85);
                outline-offset: 2px;
            }

            .tactic-tool-primary-button:disabled {
                border-color: rgba(100, 160, 220, 0.25);

                background: rgba(55, 95, 135, 0.22);

                color: rgba(150, 190, 225, 0.42);

                box-shadow: none;

                cursor: default;
            }

            /* ------------------------------------------------------------
               Last Result
               ------------------------------------------------------------ */

            .tactic-tool-result {
                padding-top: 1px;

                font-size: 10px;
                font-weight: 600;
                line-height: 1.3;

                text-align: center;

                color: #79baff;
            }

            .tactic-tool-result::before {
                content: "✓";

                display: inline-flex;
                align-items: center;
                justify-content: center;

                width: 13px;
                height: 13px;

                margin-right: 5px;

                border: 1px solid rgba(100, 220, 145, 0.65);
                border-radius: 50%;

                color: #76dd9c;

                font-size: 8px;
                font-weight: 800;
            }

            /* ============================================================
               City Map Item Finder Marker
               ============================================================ */

            .tactic-city-item-map-marker {
                width: 72px !important;
                height: 72px !important;

                border: none !important;
                background: transparent !important;

                cursor: pointer !important;
            }

            .tactic-city-item-map-marker-inner {
                position: relative;

                display: flex;
                align-items: center;
                justify-content: center;

                width: 72px;
                height: 72px;

                border: 4px solid #ffffff;
                border-radius: 50%;

                background:
                    radial-gradient(
                        circle,
                        rgba(25, 25, 25, 0.92) 0%,
                        rgba(10, 10, 10, 0.9) 68%,
                        rgba(0, 0, 0, 0.96) 100%
                    );

                box-shadow:
                    0 0 0 3px
                    rgba(0, 0, 0, 0.8),

                    0 0 12px
                    rgba(80, 185, 255, 0.95),

                    0 0 24px
                    rgba(55, 145, 255, 0.55);

                box-sizing: border-box;

                animation:
                    tactic-city-item-pulse
                    1.5s
                    ease-in-out
                    infinite;
            }

            .tactic-city-item-map-marker-inner img {
                width: 48px;
                height: 48px;

                object-fit: contain;

                pointer-events: none;
            }

            .tactic-city-item-map-marker:hover
            .tactic-city-item-map-marker-inner {
                border-color: #9ed8ff;

                box-shadow:
                    0 0 0 3px
                    rgba(0, 0, 0, 0.8),

                    0 0 18px
                    rgba(115, 205, 255, 1),

                    0 0 34px
                    rgba(65, 160, 255, 0.75);

                transform:
                    scale(1.08);
            }

            @keyframes tactic-city-item-pulse {
                0%,
                100% {
                    box-shadow:
                        0 0 0 3px
                        rgba(0, 0, 0, 0.8),

                        0 0 10px
                        rgba(80, 185, 255, 0.75),

                        0 0 18px
                        rgba(55, 145, 255, 0.4);
                }

                50% {
                    box-shadow:
                        0 0 0 3px
                        rgba(0, 0, 0, 0.8),

                        0 0 18px
                        rgba(115, 205, 255, 1),

                        0 0 30px
                        rgba(65, 160, 255, 0.65);
                }
            }
        `;

        document.head.appendChild(
            style
        );
    }

    function isOpen() {
        return storage.get(
            DRAWER_OPEN_KEY,
            false
        );
    }

    function setOpen(open) {
        const normalized =
            Boolean(open);

        storage.set(
            DRAWER_OPEN_KEY,
            normalized
        );

        updatePosition();

        events.emit(
            normalized
                ? "ui:drawer-opened"
                : "ui:drawer-closed"
        );
    }

    function toggle() {
        setOpen(!isOpen());
    }

    function getActiveModuleId() {
        return storage.get(
            ACTIVE_MODULE_KEY,
            null
        );
    }

    function chooseDefaultModule() {
        const modules =
            TACTIC.getModules();

        if (modules.length === 0) {
            return null;
        }

        const current =
            getActiveModuleId();

        if (
            current &&
            TACTIC.hasModule(current)
        ) {
            return current;
        }

        const firstModule =
            modules[0];

        storage.set(
            ACTIVE_MODULE_KEY,
            firstModule.id
        );

        return firstModule.id;
    }

    async function setActiveModule(
        moduleId
    ) {
        if (
            !TACTIC.hasModule(
                moduleId
            )
        ) {
            logger.warn(
                `Cannot activate unknown module: ${moduleId}`
            );

            return false;
        }

        storage.set(
            ACTIVE_MODULE_KEY,
            moduleId
        );

        await renderNavigation();
        await renderActiveModule();

        events.emit(
            "ui:active-module-changed",
            {
                moduleId,
            }
        );

        return true;
    }

    function updatePosition() {
        if (!drawer || !edgeTab) {
            return;
        }

        const open = isOpen();

        drawer.style.transform =
            open
                ? "translateX(0)"
                : "translateX(100%)";

        edgeTab.style.right =
            open
                ? `${
                      TACTIC.config.ui
                          .drawerWidthPx
                  }px`
                : "0";

        edgeTab.setAttribute(
            "aria-expanded",
            String(open)
        );
    }

    function updateStatus(
        icon = "🟢",
        label = "TACTIC ready"
    ) {
        if (statusIcon) {
            statusIcon.textContent =
                icon;
        }

        if (edgeTab) {
            edgeTab.title =
                `TACTIC — ${label}`;
        }
    }

    async function renderNavigation() {
        if (!navigation) {
            return;
        }

        navigation.replaceChildren();

        const modules =
            TACTIC.getModules();

        const activeModuleId =
            chooseDefaultModule();

        if (modules.length === 0) {
            navigation.appendChild(
                components.createElement(
                    "div",
                    {
                        text:
                            "No modules registered.",

                        styles: {
                            color: "#888",
                            padding: "10px 8px",
                            fontSize: "11px",
                            lineHeight: "1.4",
                        },
                    }
                )
            );

            return;
        }

        for (
            const module of modules
        ) {
            const button =
                components.createButton(
                    "",
                    {
                        className:
                            "tactic-nav-button",

                        attributes: {
                            title:
                                module.name,
                        },

                        onClick: () => {
                            setActiveModule(
                                module.id
                            );
                        },
                    }
                );

            if (
                module.id ===
                activeModuleId
            ) {
                button.classList.add(
                    "active"
                );
            }

            if (module.error) {
                button.classList.add(
                    "error"
                );
            }

            button.append(
                components.createElement(
                    "span",
                    {
                        text:
                            module.icon,
                    }
                ),

                components.createElement(
                    "span",
                    {
                        text:
                            module.name,
                    }
                )
            );

            navigation.appendChild(
                button
            );
        }
    }

    async function renderActiveModule() {
        if (!content) {
            return;
        }

        content.replaceChildren();

        const moduleId =
            chooseDefaultModule();

        if (!moduleId) {
            content.appendChild(
                components.createEmptyState(
                    "No modules available",
                    "TACTIC is running, but no feature modules have been registered."
                )
            );

            return;
        }

        const module =
            TACTIC.getModule(
                moduleId
            );

        if (!module) {
            content.appendChild(
                components.createEmptyState(
                    "Module unavailable",
                    `The module "${moduleId}" is no longer registered.`
                )
            );

            return;
        }

        try {
            if (!module.initialized) {
                await TACTIC.initializeModule(
                    module.id
                );
            }

            await module.render(
                content,
                {
                    TACTIC,
                    module,
                    services:
                        TACTIC.services,
                    events,
                    logger,
                    components,
                }
            );

            events.emit(
                "ui:module-rendered",
                {
                    moduleId:
                        module.id,
                }
            );
        } catch (error) {
            logger.error(
                `Module render failed: ${module.id}`,
                {
                    message:
                        error.message,

                    stack:
                        error.stack,
                }
            );

            content.replaceChildren(
                components.createEmptyState(
                    "Module error",
                    error.message
                )
            );

            updateStatus(
                "🔴",
                "Module error"
            );
        }

        await renderNavigation();
    }

    function createInterface() {
        injectStyles();

        document
            .getElementById(
                "tactic-modular-tab"
            )
            ?.remove();

        document
            .getElementById(
                "tactic-modular-drawer"
            )
            ?.remove();

        edgeTab =
            components.createButton(
                "",
                {
                    id:
                        "tactic-modular-tab",

                    attributes: {
                        "aria-label":
                            "Open TACTIC",

                        "aria-expanded":
                            "false",
                    },

                    onClick:
                        toggle,
                }
            );

        statusIcon =
            components.createElement(
                "span",
                {
                    text: "🟢",
                }
            );

        edgeTab.append(
            statusIcon,

            components.createElement(
                "span",
                {
                    text: "TACTIC",
                }
            )
        );

        drawer =
            components.createElement(
                "aside",
                {
                    id:
                        "tactic-modular-drawer",
                }
            );

        const header =
            components.createElement(
                "header",
                {
                    id:
                        "tactic-modular-header",
                }
            );

        const titleWrapper =
            components.createElement(
                "div"
            );

        titleWrapper.append(
            components.createElement(
                "div",
                {
                    className:
                        "tactic-modular-title",

                    text: "TACTIC",
                }
            ),

            components.createElement(
                "div",
                {
                    className:
                        "tactic-modular-subtitle",

                    text:
                        "Torn Assistant & Companion Toolkit",
                }
            )
        );

        const closeButton =
            components.createButton(
                "✕",
                {
                    className:
                        "tactic-modular-close",

                    attributes: {
                        "aria-label":
                            "Close TACTIC",
                    },

                    onClick: () => {
                        setOpen(false);
                    },
                }
            );

        header.append(
            titleWrapper,
            closeButton
        );

        const body =
            components.createElement(
                "div",
                {
                    id:
                        "tactic-modular-body",
                }
            );

        navigation =
            components.createElement(
                "nav",
                {
                    id:
                        "tactic-modular-navigation",
                }
            );

        content =
            components.createElement(
                "main",
                {
                    id:
                        "tactic-modular-content",
                }
            );

        body.append(
            navigation,
            content
        );

        drawer.append(
            header,
            body
        );

        document.body.append(
            drawer,
            edgeTab
        );

        updatePosition();
        updateStatus();

        logger.info(
            "TACTIC drawer created"
        );
    }

    async function refresh() {
        await renderNavigation();
        await renderActiveModule();
        updatePosition();
    }

    async function initialize() {
        createInterface();

        await renderNavigation();
        await renderActiveModule();

        events.on(
            "module:registered",
            refresh
        );

        events.on(
            "module:unregistered",
            refresh
        );

        events.on(
            "module:initialized",
            renderNavigation
        );

        events.on(
            "module:error",
            async () => {
                updateStatus(
                    "🔴",
                    "Module error"
                );

                await refresh();
            }
        );

        events.on(
            "app:ready",
            () => {
                updateStatus(
                    "🟢",
                    "Ready"
                );
            }
        );
    }

    TACTIC.services.drawer = {
        initialize,
        refresh,
        isOpen,
        setOpen,
        toggle,
        getActiveModuleId,
        setActiveModule,
        updateStatus,
        renderNavigation,
        renderActiveModule,
    };

    logger.info(
        "Drawer service loaded"
    );
})();