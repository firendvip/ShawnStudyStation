# 项目规则（ShawnStudyStation）

## 完成后自动提交 GitHub（always on）

每完成一个 bug 修复或需求后，**必须自动提交并推送到 GitHub**：

- 仓库：`origin = https://github.com/firendvip/ShawnStudyStation`，默认分支 **main**，直接提交到 main 并 `push`。
- 流程：`git add -A` → `git commit`（简洁中文说明，可用 `feat:` / `fix:` / `opt:` 前缀）→ `git push origin main`。
- **不要提交**大体积媒体与生成物：`vendor/CoCaWordCards/audio/`、`vendor/gaokao-english-recite/audio/`、`node_modules/`、`.next/`、`storage/`、`.env`、`*.db`（均已在 `.gitignore` 排除，勿移除）。
- 涉及 **PinPin** 的改动：先同步到运行副本与本仓库副本，再以本仓库（`WebStation2/ShawnStudyStation`）为准提交。
- 提交后仍按下方既有规则打开预览、写更新日志。

## 完成后自动在 Chrome 打开预览（always on）

每次修复 bug 或完成需求后，必须自动在**谷歌浏览器（Google Chrome）**中打开对应 HTML 预览——**用 `open -a "Google Chrome" <文件>`**，不要用默认 `open`（会打到 Claude 桌面端预览）。

- 若本次改动的是**子页面**（如 `vendor/koudaa/index.html`、`vendor/PinPin`、`vendor/lottery/index.html` 等），打开该子页面文件。
- 若本次改动的是**主站**（根目录 `index.html`）或涉及主站外壳/菜单，则打开根目录 `index.html`。
- 若同时改动主站与子页面，优先打开主站 `index.html`。

执行示例：`open -a "Google Chrome" index.html` 或 `open -a "Google Chrome" vendor/koudaa/index.html`。

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
- **管理员后台、数据统计/埋点/数据分析相关的任何改动，一律不写入更新日志**：更新日志只面向小学生家长展示学习功能；后台与数据统计属内部运营，不对外展示。

### 记录粒度（always on）

- **每次对话 = 一条独立日志条目**：只要本次对话涉及对网站的改进，就整理成**一个新的 `.cl-item`**（版本号按 SemVer 递增、日期为当天）。
- **每一处细微修改都要记**：哪怕只是改个文案、挪个位置、调个颜色，都作为该条目下的一行 `.cl-line`，归类为 `新增` / `优化` / `修复`。
- **唯一例外——同一需求/同一 Bug 的延续**：如果本次只是对**上一次相同的需求或同一个 Bug**做继续调整（反复微调同一处），则**并入上一条目**、不新开版本（可在原条目补一行或修订原文案），避免为同一件事重复开版本。
- 一次对话里有多项不同改动时，放在**同一条目**内的多行 `.cl-line`。

## 新页面必须埋点（always on）

每当**新增一个子菜单 / 新页面 / 新子应用**接入主站，都**必须对其埋点**，把访问数据上报到后台数据分析系统（管理员后台「数据分析」），与现有页面一致。具体：

- 在新页面 `</body>` 前注入埋点加载器（带 `xss-track-loader` 标记，幂等），`data-app` 用该页**唯一英文标识**：

  ```html
  <!-- xss-track-loader --><script>(function(){try{var B=(location.protocol==='file:'||/^(localhost|127\.|192\.168\.|10\.|172\.)/.test(location.hostname))?'http://localhost:4000':'';var s=document.createElement('script');s.src=B+'/api/analytics/track.js';s.async=true;s.dataset.app='新页面标识';document.head.appendChild(s);}catch(e){}})();</script>
  ```

- 该 `data-app` 标识要在后台的 app→中文名映射里补上（`vendor/admin/index.html` 的映射 + 必要处），让后台能按中文名展示这个新功能的使用数据。
- 若新页面是 SPA/多视图，关键视图切换调用 `window.xssTrack('view_change',{view:...})`；打开子应用调 `window.xssTrack('app_open',{view:...})`。
- 埋点必须**全程容错**，任何采集报错都不得影响页面本身。
- 接入前自检：打开新页面 → 后端 `analytics_events` 应有该 app 的 pageview 记录。

（注：埋点 / 后台 / 数据统计本身的改动**不写入更新日志**——见上面的更新日志规则。）
