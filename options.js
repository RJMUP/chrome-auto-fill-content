let currentRules = [];
let editingRuleId = null;
let activePickerTargetInput = null; // 当前正在等待选择器回填的输入框
let pickerTabId = null;            // 选取模式所在标签页ID
let optionsTabId = null;           // 配置页自身的标签页ID
let pickerActive = false;          // 选取模式是否激活

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
    loadRules();
    bindEvents();
});

function loadRules() {
    chrome.storage.sync.get(["autoFillRules"], (result) => {
        currentRules = result.autoFillRules || [];
        renderRulesList();
    });
}

function saveRulesToStorage() {
    chrome.storage.sync.set({ autoFillRules: currentRules }, () => {
        renderRulesList();
    });
}

// ==================== 事件绑定 ====================
function bindEvents() {
    document.getElementById("btnAddField").addEventListener("click", addFieldRow);
    document.getElementById("btnSaveRule").addEventListener("click", saveRule);
    document.getElementById("btnCancelEdit").addEventListener("click", cancelEdit);
    document.getElementById("btnExport").addEventListener("click", exportConfig);
    document.getElementById("btnImport").addEventListener("click", () => {
        document.getElementById("importFile").click();
    });
    document.getElementById("btnReset").addEventListener("click", resetAllRules);
    document.getElementById("btnCancelPicker").addEventListener("click", cancelPicker);

    // 导入文件
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "importFile";
    fileInput.accept = ".json";
    fileInput.addEventListener("change", importConfig);
    document.body.appendChild(fileInput);

    // 初始添加一个空字段行
    addFieldRow();

    // 监听来自 content script 的消息（元素选择器回传）
    chrome.runtime.onMessage.addListener((message, sender) => {
        if (message.type === "ELEMENT_SELECTED" && pickerActive) {
            fillSelectorToInput(message.selector, message.value || "");
        }
    });
}

// ==================== 字段行操作 ====================
function addFieldRow() {
    const fieldsList = document.getElementById("fieldsList");
    const fieldItem = document.createElement("div");
    fieldItem.className = "field-item";
    fieldItem.innerHTML = `
        <div class="field-row">
            <div class="form-group flex-1">
                <label>字段名</label>
                <input type="text" class="field-name" placeholder="例如: 用户名">
            </div>
            <div class="form-group flex-2">
                <label>CSS选择器</label>
                <div class="selector-input-group">
                    <input type="text" class="field-selector" placeholder="例如: input[id='userName']">
                    <button type="button" class="btn-pick-selector" title="从页面中选取元素">🎯</button>
                </div>
            </div>
            <div class="form-group flex-2">
                <label>填充值</label>
                <input type="text" class="field-value" placeholder="例如: admin">
            </div>
            <button type="button" class="btn-remove-field" title="删除此字段">✕</button>
        </div>
    `;

    fieldItem.querySelector(".btn-remove-field").addEventListener("click", () => {
        fieldItem.remove();
    });

    // 绑定"从页面选取"按钮事件
    fieldItem.querySelector(".btn-pick-selector").addEventListener("click", function () {
        const selectorInput = fieldItem.querySelector(".field-selector");
        startElementPicker(selectorInput);
    });

    fieldsList.appendChild(fieldItem);
}

function getFieldsFromForm() {
    const fields = [];
    const fieldItems = document.querySelectorAll("#fieldsList .field-item");
    fieldItems.forEach((item) => {
        const name = item.querySelector(".field-name").value.trim();
        const selector = item.querySelector(".field-selector").value.trim();
        const value = item.querySelector(".field-value").value.trim();
        if (selector) {
            fields.push({ name: name || "未命名", selector, value });
        }
    });
    return fields;
}

function clearFieldsForm() {
    document.getElementById("fieldsList").innerHTML = "";
    addFieldRow();
}

function fillFieldsForm(fields) {
    const fieldsList = document.getElementById("fieldsList");
    fieldsList.innerHTML = "";
    if (fields.length === 0) {
        addFieldRow();
        return;
    }
    fields.forEach((field) => {
        const fieldItem = document.createElement("div");
        fieldItem.className = "field-item";
        fieldItem.innerHTML = `
            <div class="field-row">
                <div class="form-group flex-1">
                    <label>字段名</label>
                    <input type="text" class="field-name" value="${escapeHtml(field.name)}">
                </div>
                <div class="form-group flex-2">
                    <label>CSS选择器</label>
                    <div class="selector-input-group">
                        <input type="text" class="field-selector" value="${escapeHtml(field.selector)}">
                        <button type="button" class="btn-pick-selector" title="从页面中选取元素">🎯</button>
                    </div>
                </div>
                <div class="form-group flex-2">
                    <label>填充值</label>
                    <input type="text" class="field-value" value="${escapeHtml(field.value)}">
                </div>
                <button type="button" class="btn-remove-field" title="删除此字段">✕</button>
            </div>
        `;
        fieldItem.querySelector(".btn-remove-field").addEventListener("click", () => {
            fieldItem.remove();
        });
        // 绑定"从页面选取"按钮事件
        fieldItem.querySelector(".btn-pick-selector").addEventListener("click", function () {
            const selectorInput = fieldItem.querySelector(".field-selector");
            startElementPicker(selectorInput);
        });
        fieldsList.appendChild(fieldItem);
    });
}

// ==================== 规则保存/编辑 ====================
function saveRule() {
    const name = document.getElementById("ruleName").value.trim();
    const url = document.getElementById("ruleUrl").value.trim();
    const fields = getFieldsFromForm();

    if (!name) {
        showToast("请输入规则名称", "error");
        return;
    }

    if (fields.length === 0) {
        showToast("请至少添加一个填充字段", "error");
        return;
    }

    if (editingRuleId) {
        // 编辑模式
        const index = currentRules.findIndex((r) => r.id === editingRuleId);
        if (index !== -1) {
            currentRules[index] = { ...currentRules[index], name, url, fields };
        }
        editingRuleId = null;
        document.getElementById("btnCancelEdit").style.display = "none";
        document.getElementById("btnSaveRule").textContent = "保存规则";
        showToast("规则已更新", "success");
    } else {
        // 新增模式
        const rule = {
            id: "rule_" + Date.now(),
            name,
            url,
            fields,
        };
        currentRules.push(rule);
        showToast("规则已保存", "success");
    }

    saveRulesToStorage();
    clearForm();
}

function cancelEdit() {
    editingRuleId = null;
    document.getElementById("btnCancelEdit").style.display = "none";
    document.getElementById("btnSaveRule").textContent = "保存规则";
    clearForm();
}

function clearForm() {
    document.getElementById("ruleName").value = "";
    document.getElementById("ruleUrl").value = "";
    clearFieldsForm();
}

function editRule(ruleId) {
    const rule = currentRules.find((r) => r.id === ruleId);
    if (!rule) return;

    editingRuleId = ruleId;
    document.getElementById("ruleName").value = rule.name;
    document.getElementById("ruleUrl").value = rule.url;
    fillFieldsForm(rule.fields);

    document.getElementById("btnCancelEdit").style.display = "inline-flex";
    document.getElementById("btnSaveRule").textContent = "更新规则";

    // 滚动到表单
    document.querySelector(".add-rule-section").scrollIntoView({ behavior: "smooth" });
}

function deleteRule(ruleId) {
    if (!confirm("确定要删除这条规则吗？")) return;

    if (editingRuleId === ruleId) {
        cancelEdit();
    }

    currentRules = currentRules.filter((r) => r.id !== ruleId);
    saveRulesToStorage();
    showToast("规则已删除", "success");
}

// ==================== 规则列表渲染 ====================
function renderRulesList() {
    const rulesList = document.getElementById("rulesList");
    const ruleCount = document.getElementById("ruleCount");

    ruleCount.textContent = currentRules.length;

    if (currentRules.length === 0) {
        rulesList.innerHTML = '<div class="empty-state">暂无规则，请添加一条填充规则</div>';
        return;
    }

    rulesList.innerHTML = currentRules
        .map((rule) => {
            const urlDisplay = rule.url || "匹配所有页面";
            const fieldTags = rule.fields
                .map((f) => `<span class="field-tag">${escapeHtml(f.name)}: ${escapeHtml(f.selector)}</span>`)
                .join("");

            return `
            <div class="rule-card">
                <div class="rule-card-header">
                    <span class="rule-card-name">${escapeHtml(rule.name)}</span>
                    <div class="rule-card-actions">
                        <button class="btn-edit" data-id="${rule.id}">编辑</button>
                        <button class="btn-delete" data-id="${rule.id}">删除</button>
                    </div>
                </div>
                <div class="rule-card-url">${escapeHtml(urlDisplay)}</div>
                <div class="rule-fields-tags" style="margin-top:8px;">${fieldTags}</div>
            </div>
        `;
        })
        .join("");

    // 绑定编辑/删除事件
    rulesList.querySelectorAll(".btn-edit").forEach((btn) => {
        btn.addEventListener("click", () => editRule(btn.dataset.id));
    });
    rulesList.querySelectorAll(".btn-delete").forEach((btn) => {
        btn.addEventListener("click", () => deleteRule(btn.dataset.id));
    });
}

// ==================== 导入导出 ====================
function exportConfig() {
    const blob = new Blob([JSON.stringify(currentRules, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auto-fill-config-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("配置已导出", "success");
}

function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const rules = JSON.parse(e.target.result);
            if (!Array.isArray(rules)) {
                throw new Error("格式错误");
            }
            // 验证规则结构
            for (const rule of rules) {
                if (!rule.name || !Array.isArray(rule.fields)) {
                    throw new Error("规则格式不正确");
                }
                rule.id = rule.id || "rule_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            }
            currentRules = rules;
            saveRulesToStorage();
            showToast(`成功导入 ${rules.length} 条规则`, "success");
        } catch (err) {
            showToast("导入失败：文件格式不正确", "error");
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

function resetAllRules() {
    if (!confirm("确定要清除所有配置吗？此操作不可恢复。")) return;

    currentRules = [];
    saveRulesToStorage();
    cancelEdit();
    showToast("已清除所有配置", "success");
}

// ==================== 工具函数 ====================
function showToast(msg, type) {
    let toast = document.querySelector(".toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.className = "toast " + (type || "");
    toast.classList.add("show");

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2000);
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ==================== 元素选取器 ====================

/**
 * 启动元素选取模式 — 在目标页面注入选取脚本
 * @param {HTMLInputElement} targetInput 要回填选择器的输入框
 */
async function startElementPicker(targetInput) {
    // 先获取规则URL，作为默认的目标页面
    const ruleUrl = document.getElementById("ruleUrl").value.trim();

    if (!ruleUrl) {
        showToast("请先填写网页地址匹配，以便自动跳转到目标页面", "error");
        return;
    }

    // 记录当前配置页的 tab ID，选取完成后切换回来
    const [optionsTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    optionsTabId = optionsTab.id;

    // 查找是否已有匹配URL的标签页
    let tab = await findTabByUrl(ruleUrl);

    if (!tab) {
        // 没有匹配的标签页，创建新标签页
        try {
            tab = await chrome.tabs.create({ url: ruleUrl, active: true });
        } catch (e) {
            showToast("无法打开目标页面，请检查URL是否正确", "error");
            return;
        }
    } else {
        // 激活已有标签页
        await chrome.tabs.update(tab.id, { active: true });
    }

    pickerTabId = tab.id;
    activePickerTargetInput = targetInput;
    pickerActive = true;

    // 显示选取提示栏
    document.getElementById("pickerHint").style.display = "flex";

    // 等待页面加载完成后注入脚本（all_frames: true 注入所有 iframe）
    const injectPicker = async () => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: pickerTabId, allFrames: true },
                func: injectElementPicker,
            });
        } catch (e) {
            // 如果注入失败（如 chrome:// 页面），提示用户
            showToast("无法在此页面注入选取脚本（可能是系统页面）", "error");
            cancelPicker();
        }
    };

    // 检查页面是否已加载
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // 稍等一下确保页面开始加载
        setTimeout(injectPicker, 500);
    } catch (e) {
        showToast("注入脚本失败", "error");
        cancelPicker();
    }

    showToast("请在目标页面上点击要选取的元素", "success");

    // 监听标签页关闭事件，自动取消选取模式
    chrome.tabs.onRemoved.addListener(onPickerTabClosed);
}

/**
 * 标签页关闭时的处理
 */
function onPickerTabClosed(tabId) {
    if (tabId === pickerTabId && pickerActive) {
        cancelPicker();
    }
}

/**
 * 取消元素选取模式
 */
async function cancelPicker() {
    pickerActive = false;
    activePickerTargetInput = null;
    document.getElementById("pickerHint").style.display = "none";

    // 移除标签页关闭监听
    chrome.tabs.onRemoved.removeListener(onPickerTabClosed);

    // 尝试从目标页面移除选取脚本（如果标签页还存在）
    if (pickerTabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: pickerTabId, allFrames: true },
                func: removeElementPicker,
            });
        } catch (e) {
            // 标签页可能已关闭，忽略错误
        }
    }

    // 切换回配置页
    if (optionsTabId) {
        chrome.tabs.update(optionsTabId, { active: true });
    }

    pickerTabId = null;
    optionsTabId = null;
}

/**
 * 将选取的选择器和元素值回填到输入框，并自动切回配置页
 */
function fillSelectorToInput(selector, value) {
    if (activePickerTargetInput) {
        activePickerTargetInput.value = selector;
        // 同时回填填充值到同一行的 value 输入框
        const fieldItem = activePickerTargetInput.closest(".field-item");
        if (fieldItem && value) {
            const valueInput = fieldItem.querySelector(".field-value");
            if (valueInput) {
                valueInput.value = value;
            }
        }
        showToast("CSS 选择器已获取: " + selector, "success");
    }
    // 切换回配置页
    if (optionsTabId) {
        chrome.tabs.update(optionsTabId, { active: true });
    }
    cancelPicker();
}

/**
 * 根据URL前缀查找已打开的标签页
 */
async function findTabByUrl(url) {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url && tab.url.startsWith(url)) || null;
}

// ==================== 注入到目标页面的脚本 ====================

/**
 * 注入到目标页面的元素选取器脚本
 * 此函数在目标页面的上下文中执行（包括所有 iframe）
 *
 * 架构说明：
 * - 顶层页面（top window）：负责绘制高亮层、接收 iframe 的鼠标事件、统一处理元素选取
 * - iframe 页面：负责监听鼠标移动/点击，并将事件转发给顶层页面
 */
function injectElementPicker() {
    // 防止重复注入
    if (window.__autoFillPickerActive) return;
    window.__autoFillPickerActive = true;

    // 获取元素的当前值（兼容 input/textarea/select）
    function getElementValue(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") {
            return el.value || "";
        }
        if (tag === "select") {
            return el.value || "";
        }
        return "";
    }

    const isTopWindow = (window === window.top);

    // ==================== 顶层页面逻辑 ====================
    if (isTopWindow) {
        let overlay = null;
        let isActive = true;

        // 获取 iframe 路径（用于跨 frame 元素定位）
        function getFramePath(targetWindow) {
            if (targetWindow === window) return [];
            const path = [];
            let currentWin = targetWindow;
            while (currentWin !== window) {
                try {
                    const frameElement = currentWin.frameElement;
                    if (!frameElement) break;
                    const doc = frameElement.ownerDocument;
                    const iframes = doc.querySelectorAll(frameElement.tagName);
                    let index = -1;
                    for (let i = 0; i < iframes.length; i++) {
                        if (iframes[i] === frameElement) { index = i; break; }
                    }
                    // 生成 iframe 选择器
                    let selector = frameElement.tagName.toLowerCase();
                    if (frameElement.id) {
                        selector = "#" + CSS.escape(frameElement.id);
                    } else if (frameElement.className && typeof frameElement.className === "string") {
                        const cls = frameElement.className.trim().split(/\s+/).filter(Boolean);
                        if (cls.length > 0) {
                            selector += "." + cls.map(c => CSS.escape(c)).join(".");
                        }
                    }
                    if (index > 0) {
                        selector += ":nth-of-type(" + (index + 1) + ")";
                    }
                    path.unshift({ selector, doc });
                } catch (e) {
                    // 跨域 iframe 无法访问 frameElement，跳过
                    break;
                }
                currentWin = currentWin.parent;
            }
            return path;
        }

        // 创建高亮遮罩层（在顶层页面）
        function createOverlay() {
            overlay = document.createElement("div");
            overlay.id = "__autoFillPickerOverlay";
            overlay.style.cssText = `
                position: fixed;
                pointer-events: none;
                z-index: 2147483647;
                border: 2px solid #2274A5;
                background: rgba(34, 116, 165, 0.15);
                transition: all 0.08s ease-out;
                border-radius: 2px;
                display: none;
            `;
            document.body.appendChild(overlay);

            // 创建提示标签
            const label = document.createElement("div");
            label.id = "__autoFillPickerLabel";
            label.style.cssText = `
                position: fixed;
                z-index: 2147483647;
                background: #1a1a2e;
                color: #fff;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                padding: 6px 12px;
                border-radius: 6px;
                pointer-events: none;
                display: none;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                max-width: 400px;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            document.body.appendChild(label);
        }

        // 在指定文档中生成唯一的 CSS 选择器（相对于该文档）
        function generateSelectorInDoc(el, doc) {
            if (el.id) {
                return "#" + CSS.escape(el.id);
            }

            const path = [];
            let current = el;

            while (current && current !== doc.body && current !== doc.documentElement) {
                let segment = current.tagName.toLowerCase();

                if (current.id) {
                    path.unshift("#" + CSS.escape(current.id));
                    break;
                }

                // 添加有意义的 class
                const classes = Array.from(current.classList).filter(
                    (c) => c && !c.startsWith("__autoFill") && c.length > 0
                );
                if (classes.length > 0) {
                    segment += "." + classes.map((c) => CSS.escape(c)).join(".");
                }

                // 计算同类型兄弟元素的序号
                const parent = current.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children).filter(
                        (c) => c.tagName === current.tagName
                    );
                    if (siblings.length > 1) {
                        segment += ":nth-child(" + (siblings.indexOf(current) + 1) + ")";
                    }
                }

                path.unshift(segment);
                current = current.parentElement;

                if (path.length >= 4) break;
            }

            return path.join(" > ");
        }

        // 更新高亮位置
        function updateHighlight(rect) {
            if (!overlay || !isActive) return;
            overlay.style.display = "block";
            overlay.style.top = rect.top + "px";
            overlay.style.left = rect.left + "px";
            overlay.style.width = rect.width + "px";
            overlay.style.height = rect.height + "px";
        }

        // 隐藏高亮
        function hideHighlight() {
            if (overlay) overlay.style.display = "none";
            const label = document.getElementById("__autoFillPickerLabel");
            if (label) label.style.display = "none";
        }

        // 更新选择器标签
        function updateLabel(selectorText, rect) {
            const label = document.getElementById("__autoFillPickerLabel");
            if (label) {
                label.textContent = selectorText;
                label.style.display = "block";
                let top = rect.top - 30;
                if (top < 5) top = rect.bottom + 5;
                label.style.top = top + "px";
                label.style.left = Math.max(5, rect.left) + "px";
            }
        }

        // 处理来自 iframe 的鼠标移动事件
        function handleFrameMouseMove(data) {
            if (!isActive) return;
            updateHighlight(data.rect);
            updateLabel(data.selectorText, data.rect);
        }

        // 处理来自 iframe 的点击事件
        function handleFrameClick(data) {
            if (!isActive) return;

            // 构建完整的跨 frame 选择器
            let fullSelector = data.selector;
            // data.iframePath 是从顶层到目标 frame 的 iframe 选择器数组
            if (data.iframePath && data.iframePath.length > 0) {
                const framePart = data.iframePath.join(" ");
                fullSelector = framePart + " " + data.selector;
            }

            chrome.runtime.sendMessage({
                type: "ELEMENT_SELECTED",
                selector: fullSelector,
                value: data.value || "",
            });

            // 清理自身
            removeElementPicker();
        }

        // 顶层页面的鼠标移动处理
        function onMouseMove(e) {
            if (!isActive) return;
            if (e.target.id === "__autoFillPickerOverlay" || e.target.id === "__autoFillPickerLabel") return;

            const rect = e.target.getBoundingClientRect();
            updateHighlight(rect);
            const sel = generateSelectorInDoc(e.target, document);
            updateLabel(sel, rect);
        }

        // 顶层页面的点击处理
        function onClick(e) {
            if (!isActive) return;
            if (e.target.id === "__autoFillPickerOverlay" || e.target.id === "__autoFillPickerLabel") return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const selector = generateSelectorInDoc(e.target, document);
            const elementValue = getElementValue(e.target);

            chrome.runtime.sendMessage({
                type: "ELEMENT_SELECTED",
                selector: selector,
                value: elementValue,
            });

            removeElementPicker();
        }

        // 键盘处理 — ESC取消
        function onKeyDown(e) {
            if (e.key === "Escape" && isActive) {
                chrome.runtime.sendMessage({ type: "ELEMENT_SELECTED", selector: "" });
                removeElementPicker();
            }
        }

        // 监听来自 iframe 的 postMessage
        function onFrameMessage(e) {
            if (!isActive) return;
            const data = e.data;
            if (!data || data.type !== "__autoFillPickerEvent") return;

            switch (data.event) {
                case "mousemove":
                    handleFrameMouseMove(data);
                    break;
                case "click":
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    handleFrameClick(data);
                    break;
            }
        }

        createOverlay();
        document.addEventListener("mousemove", onMouseMove, true);
        document.addEventListener("click", onClick, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("message", onFrameMessage, true);

        // 存储清理引用
        window.__autoFillPickerCleanup = function () {
            isActive = false;
            document.removeEventListener("mousemove", onMouseMove, true);
            document.removeEventListener("click", onClick, true);
            document.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("message", onFrameMessage, true);
            hideHighlight();
            const overlayEl = document.getElementById("__autoFillPickerOverlay");
            const labelEl = document.getElementById("__autoFillPickerLabel");
            if (overlayEl) overlayEl.remove();
            if (labelEl) labelEl.remove();
            window.__autoFillPickerActive = false;
        };

    } else {
        // ==================== iframe 内逻辑 ====================
        // iframe 中不绘制高亮，只负责检测鼠标事件并转发给顶层页面
        let isActive = true;

        // 获取从顶层到当前 iframe 的路径
        function getIframePath() {
            const path = [];
            let currentWin = window;
            while (currentWin !== window.top) {
                try {
                    const frameEl = currentWin.frameElement;
                    if (!frameEl) break;
                    const doc = frameEl.ownerDocument;
                    const iframes = doc.querySelectorAll(frameEl.tagName);
                    let index = -1;
                    for (let i = 0; i < iframes.length; i++) {
                        if (iframes[i] === frameEl) { index = i; break; }
                    }
                    let sel = frameEl.tagName.toLowerCase();
                    if (frameEl.id) {
                        sel = "#" + CSS.escape(frameEl.id);
                    } else if (frameEl.className && typeof frameEl.className === "string") {
                        const cls = frameEl.className.trim().split(/\s+/).filter(Boolean);
                        if (cls.length > 0) {
                            sel += "." + cls.map(c => CSS.escape(c)).join(".");
                        }
                    }
                    if (index > 0) {
                        sel += ":nth-of-type(" + (index + 1) + ")";
                    }
                    path.unshift(sel);
                } catch (e) {
                    break; // 跨域 iframe，无法获取路径
                }
                currentWin = currentWin.parent;
            }
            return path;
        }

        // 在 iframe 内生成选择器
        function generateSelectorInFrame(el) {
            if (el.id) {
                return "#" + CSS.escape(el.id);
            }
            const path = [];
            let current = el;
            while (current && current !== document.body && current !== document.documentElement) {
                let segment = current.tagName.toLowerCase();
                if (current.id) {
                    path.unshift("#" + CSS.escape(current.id));
                    break;
                }
                const classes = Array.from(current.classList).filter(
                    (c) => c && !c.startsWith("__autoFill") && c.length > 0
                );
                if (classes.length > 0) {
                    segment += "." + classes.map((c) => CSS.escape(c)).join(".");
                }
                const parent = current.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children).filter(
                        (c) => c.tagName === current.tagName
                    );
                    if (siblings.length > 1) {
                        segment += ":nth-child(" + (siblings.indexOf(current) + 1) + ")";
                    }
                }
                path.unshift(segment);
                current = current.parentElement;
                if (path.length >= 4) break;
            }
            return path.join(" > ");
        }

        // 鼠标移动 — 转发给顶层
        function onFrameMouseMove(e) {
            if (!isActive) return;
            if (e.target.id === "__autoFillPickerOverlay" || e.target.id === "__autoFillPickerLabel") return;

            const rect = e.target.getBoundingClientRect();
            const iframeRect = window.frameElement ? window.frameElement.getBoundingClientRect() : { top: 0, left: 0 };

            // 将 iframe 内的坐标转换为顶层坐标
            window.top.postMessage({
                type: "__autoFillPickerEvent",
                event: "mousemove",
                rect: {
                    top: rect.top + iframeRect.top,
                    left: rect.left + iframeRect.left,
                    width: rect.width,
                    height: rect.height,
                },
                selectorText: generateSelectorInFrame(e.target),
                iframePath: getIframePath(),
            }, "*");
        }

        // 点击 — 转发给顶层
        function onFrameClick(e) {
            if (!isActive) return;
            if (e.target.id === "__autoFillPickerOverlay" || e.target.id === "__autoFillPickerLabel") return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const selector = generateSelectorInFrame(e.target);
            const iframePath = getIframePath();
            const elementValue = getElementValue(e.target);

            window.top.postMessage({
                type: "__autoFillPickerEvent",
                event: "click",
                selector: selector,
                iframePath: iframePath,
                value: elementValue,
            }, "*");
        }

        // ESC 转发给顶层
        function onFrameKeyDown(e) {
            if (e.key === "Escape" && isActive) {
                window.top.postMessage({
                    type: "__autoFillPickerEvent",
                    event: "keydown_esc",
                }, "*");
            }
        }

        document.addEventListener("mousemove", onFrameMouseMove, true);
        document.addEventListener("click", onFrameClick, true);
        document.addEventListener("keydown", onFrameKeyDown, true);

        window.__autoFillPickerCleanup = function () {
            isActive = false;
            document.removeEventListener("mousemove", onFrameMouseMove, true);
            document.removeEventListener("click", onFrameClick, true);
            document.removeEventListener("keydown", onFrameKeyDown, true);
            window.__autoFillPickerActive = false;
        };
    }
}

/**
 * 移除目标页面中的元素选取器脚本
 */
function removeElementPicker() {
    if (window.__autoFillPickerCleanup) {
        window.__autoFillPickerCleanup();
    }
}
