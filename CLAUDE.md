# 项目规则（ShawnStudyStation）

## 完成后自动打开预览（always on）

每次修复 bug 或完成需求后，必须自动用 `open` 打开对应的 HTML 文件进行预览：

- 若本次改动的是**子页面**（如 `vendor/koudaa/index.html`、`vendor/PinPin`、`vendor/lottery/index.html` 等），直接 `open` 该子页面文件。
- 若本次改动的是**主站**（根目录 `index.html`）或涉及主站外壳/菜单，则 `open` 根目录 `index.html`。
- 若同时改动主站与子页面，优先打开主站 `index.html`。

执行示例：`open vendor/koudaa/index.html` 或 `open index.html`。

## 子页面与菜单的统一间距（always on）

所有子页面（`vendor/*`，通过 iframe 嵌入主站、紧贴顶部菜单下方）的内容排版必须遵循统一标准：

- **顶部对齐**：子页面内容**顶部对齐**，不得用 `align-items:center` 把内容垂直居中（会在菜单下方留下大空隙）。居中型卡片页改用 `align-items:flex-start`。
- **统一顶距 = 24px**：首个内容块（最外层容器的 `padding-top`／`margin-top`，或自带顶栏的首元素）距页面顶部统一为 **24px**（即距主站菜单底部 24px），与「错字练习(PinPin)」一致。
- **左右/底部间距**：各页面按自身设计自定，仅顶距需统一。
- **新增子页面**：接入主站前必须套用此 24px 顶距标准。

已套用 24px：错字练习(PinPin)、英语作文(gaokao)、转盘(lottery)、自然拼读(phonics)。
例外：小学心算(koudaa) 按用户要求保留 70px 顶距。

## 更新日志（always on）

每完成一次更新（新增功能 / 优化 / 修复 bug），都必须把本次改动用**简短的大白话**追加到「更新日志」页面：根目录 `index.html` 中 `id="view-changelog"` 的时间线里。

- 在 `.cl-list` 顶部新增一个 `.cl-item`，包含：版本号 `.cl-ver`（按 SemVer 递增）、日期 `.cl-date`（当天，YYYY-MM-DD）。
- 把上一条目的 `最新` 标记（`.cl-item.latest` 与 `<span class="cl-latest">最新</span>`）移到新条目。
- 每条改动一行 `.cl-line`，前面用标签：`新增`=`cl-tag add`、`优化`=`cl-tag opt`、`修复`=`cl-tag fix`。
- 文案面向小学生家长，**通俗、简短、不堆术语**（例：「日记可以设密码，记天气」而非「AES-GCM 加密的本地日记」）。

### 记录粒度（always on）

- **每次对话 = 一条独立日志条目**：只要本次对话涉及对网站的改进，就整理成**一个新的 `.cl-item`**（版本号按 SemVer 递增、日期为当天）。
- **每一处细微修改都要记**：哪怕只是改个文案、挪个位置、调个颜色，都作为该条目下的一行 `.cl-line`，归类为 `新增` / `优化` / `修复`。
- **唯一例外——同一需求/同一 Bug 的延续**：如果本次只是对**上一次相同的需求或同一个 Bug**做继续调整（反复微调同一处），则**并入上一条目**、不新开版本（可在原条目补一行或修订原文案），避免为同一件事重复开版本。
- 一次对话里有多项不同改动时，放在**同一条目**内的多行 `.cl-line`。
