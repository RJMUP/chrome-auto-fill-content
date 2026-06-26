window.addEventListener("load", () => {
    chrome.storage.sync.get(["autoFillRules"], (result) => {
        const rules = result.autoFillRules;
        if (!rules || rules.length === 0) return;

        const currentUrl = window.location.href;
        const matchedRules = matchRules(rules, currentUrl);

        if (matchedRules.length > 0) {
            for (const rule of matchedRules) {
                applyRule(rule);
            }
        }
    });
});

/**
 * 匹配当前URL的规则
 * @param {Array} rules 所有规则
 * @param {string} currentUrl 当前页面URL
 * @returns {Array} 匹配的规则列表
 */
function matchRules(rules, currentUrl) {
    return rules.filter((rule) => {
        // 如果 url 为空，表示匹配所有页面
        if (!rule.url) return true;
        // 前缀匹配
        return currentUrl.startsWith(rule.url);
    });
}

/**
 * 应用规则，自动填充表单字段
 * @param {Object} rule 规则对象
 */
function applyRule(rule) {
    if (!rule.fields || rule.fields.length === 0) return;

    for (const field of rule.fields) {
        if (!field.selector) continue;

        try {
            const element = document.querySelector(field.selector);
            if (element) {
                element.value = field.value;

                // 派发事件以兼容 Vue/React 等框架
                const inputEvent = new Event("input", { bubbles: true });
                const changeEvent = new Event("change", { bubbles: true });
                element.dispatchEvent(inputEvent);
                element.dispatchEvent(changeEvent);

                printLog(`[${rule.name}] 自动填充[${field.name}]`);
            }
        } catch (e) {
            printLog(`[${rule.name}] 选择器错误: ${field.selector}`);
        }
    }
}

/**
 * 打印日志内容
 * @param {string} msg 日志内容
 */
function printLog(msg) {
    console.log(
        "%c Auto Fill Content ",
        "background-color:#2274A5;color: white",
        msg
    );
}
