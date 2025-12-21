<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# [https://github.com/aaajiao/1bit](https://github.com/aaajiao/1bit) 按照这里的文档风格写一个类似的文档。

下面是按你 repo 现在的 README 语气和结构，写的一份「四种精神场景」版本文档草案，你可以直接拷到 README 里再微调用词。

***

# 1bit — 极化世界里的自处练习

一个基于 Three.js 的 **1-bit 抖动渲染** 交互式 3D 体验作品。玩家手持一朵发光的花，在程序化生成的嵌合体废墟中穿行，在高信息流、被迫站队与长期 in‑between 的精神世界里，练习如何与自己待在一起。[^1][^2]

***

## 🎯 核心概念

在这个项目里，1-bit 不只是复古像素风格，而是一种极化现实的隐喻：黑是“无”、白是“有”，抖动是未被决定的噪点空间。 玩家唯一稳定的对象，是手中的那朵发光的花，它既是照明工具，也是脆弱的“内在状态”。[^1]

本作不提供传统意义上的终点或胜利条件，而是一系列可反复进入的“状态练习场景”。每一局游戏是一段 3–5 分钟的短旅程，由若干精神场景自动拼接：

- 高信息流、无回应
- 被迫站队
- 长期 in‑between
- 极化世界 / 纯 1-bit 边界地带

玩家通过移动、视角与花的亮度，在不同场景中体验“顺从、对抗、游离、抽离”这些姿态，并在结束时获得一小段关于“这一次，我是怎样待在这个世界里的”视觉回声。

***

## 🎮 操作说明

| 按键 | 功能 |
| :-- | :-- |
| `W / A / S / D` | 移动 |
| `空格键` | 跳跃 |
| `鼠标` | 视角控制 |
| `点击` | 进入游戏（锁定鼠标） |

> 注：花的亮度与姿态会在后续版本中绑定到视角和交互行为，例如仰视 Sky Eye 时自动收起花，俯视废墟时花光增强等。[^1]

***

## 🧠 精神场景（State Rooms）

下面四个场景不是关卡，而是四种当代精神状态的可视化实验，它们会被随机组合成一次旅程。每一局结束时，玩家的行为会被转换为一小段 1-bit 噪点图案或极简文本，用作「状态快照」。

### 1. 高信息流、无回应

- 视觉特征：
    - 极密的数字雨与信号干扰充满视野，远处建筑不断被点亮又被抹去，路径时隐时现。
- 玩法感受：
    - 当玩家抬高手中的花，噪点与光晕变得更密集，信息量急剧增加，但世界并不给出“回应”，只是以更强的噪声覆盖视线。
    - 玩家需要通过调低光强、改变视角与移动方式，找到一种在信息洪流中不被完全淹没、又不彻底关闭感知的中间姿态。


### 2. 被迫站队

- 视觉特征：
    - 废墟被一道巨大的裂缝劈开，两侧是风格略有差异的混凝土高墙与线缆系统，Sky Eye 的光从两侧侧向照射。
- 玩法感受：
    - 当玩家靠近裂缝边缘，花光会被两侧不同频率的“口号噪声”调制，仿佛随时要被拖拽向某一阵营。
    - 将光完全调向某侧，环境会短暂稳定但变得单调；保持在裂缝边缘行走，则持续感到不适与拉扯，却更接近“自己的路径”。


### 3. 长期 in‑between

- 视觉特征：
    - 两种建筑语言、两套线缆系统在同一空间错层叠加，地面网格有细微错位，仿佛站在两个系统之间的空隙里。[^3]
- 玩法感受：
    - 在某些区域，花光被读取为“噪声”，会触发遮蔽与驱逐效果；在另一些区域，同样的光又被视为“信号”，可以激活隐藏结构。
    - 同一动作在不同局部被赋予完全相反的意义，玩家需要通过移动与试探，慢慢摸索出一条属于“in‑between 身份”的生存路线。


### 4. 极化世界（纯 1-bit 边界）

- 视觉特征：
    - 几乎没有灰度与抖动，只有极硬的黑白块面和清晰边界，线缆沿着边界线延伸，构成强烈的“非黑即白”视觉压力。[^1]
- 玩法感受：
    - 在这里，花光的任何犹豫都会被世界自动“量化”为黑或白，所有中间状态被压缩消失。
    - 玩家可以选择熄灭花暂时退出被分类、把花种在某个边界点，或强行保持亮度，让世界出现短暂的抖动与错误渲染，体验“拒绝立即站队”的代价与可能性。

***

## 🚀 运行方式

### 开发模式（推荐，支持热更新）

```bash
npm install      # 首次运行需要安装依赖
npm run dev      # 启动 Vite 开发服务器
# 访问 http://localhost:5173
```


### 构建生产版本

```bash
npm run build    # 构建静态资源
npm run preview  # 预览生产构建
```


***

## 📁 项目结构（节选）

```text
1bit/
├── index.html              # 入口 HTML（ES6 模块版本）
├── 1-bit.html              # 原始单文件版本
├── package.json            # 项目配置
├── README.md               # 本文档
├── styles/
│   └── main.css            # 样式表（扫描线效果等）
└── src/
    ├── main.js             # 主程序入口
    ├── audio/
    │   └── AudioSystem.js  # 程序化音效系统
    ├── shaders/
    │   └── DitherShader.js # 1-bit 抖动着色器 + 线缆脉冲着色器
    ├── player/
    │   ├── Controls.js     # 第一人称移动控制
    │   ├── HandsModel.js   # 解剖学精确的手部模型
    │   └── FlowerProp.js   # 手持发光花朵
    ├── world/
    │   ├── ChunkManager.js # 无限地形区块管理
    │   ├── SharedAssets.js # 共享材质和几何体
    │   ├── BuildingFactory.js # 建筑生成器
    │   ├── FloraFactory.js # 树木/植物生成器
    │   ├── FloorTile.js    # 地板纹理生成
    │   └── CableSystem.js  # 动态线缆系统
    └── utils/
        ├── hash.js         # 确定性伪随机哈希
        └── ObjectPool.js   # 对象池（性能优化）
```


***

## 🛠️ 技术栈

| 组件 | 版本 | 说明 |
| :-- | :-- | :-- |
| **Three.js** | 0.160.0 | 3D 渲染引擎（ES6 模块版本） |
| **模块系统** | ES6 Import Map | 浏览器原生模块支持 |

> 与原版 r128 的兼容性与迁移细节，请参见源码中的注释与 `README` 早期版本记录。

***

如果你愿意，下一个版本可以再加一小节「设计笔记」（写给 curator / 理解当代精神状态的人看），把“极化政治—算法治理—深度孤独”的高维度动机压缩成几段话，放在 README 的最下方。

<div align="center">⁂</div>

[^1]: https://github.com/aaajiao/1bit

[^2]: https://github.com/aaajiao

[^3]: https://www.perplexity.ai/search/ec927311-f9f6-452b-b122-ddbae589a910



<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# 全部都写出来，你的文字主要就是跟开发对接。

下面按「给开发看的设计说明」来写，把四个 State Room 都拆成**可控参数 / 触发条件 / 反馈方式**，方便直接映射到现有模块（DitherShader、CableSystem、ChunkManager、AudioSystem、FlowerProp、Controls 等）。[^1][^2]

***

## 通用设计约定

- 花光强度：由 `FlowerProp` 暴露一个 0–1 的 `intensity`（可由鼠标右键/滚轮/键盘绑定，或暂时用视角 pitch 推导）。
- 场景类型：`world/ChunkManager` 在生成 chunk 时带一个 `roomType` 枚举，例如：`INFO_OVERFLOW / FORCED_ALIGNMENT / IN_BETWEEN / POLARIZED`.
- 抖动/噪点：通过 `DitherShader` 的几个参数控制：`noiseDensity`, `thresholdBias`, `temporalJitter`。
- 音频：`AudioSystem` 接一个 `mood` 标签和一个 `intensity`，做简单滤波/密度调制即可。

下面每个 State Room 都用同一模板描述。

***

## 1. 高信息流、无回应（INFO_OVERFLOW）

### 目标感受

- 视觉上“信息爆炸”，但交互上几乎没有明确回应：空间不断刷新，但没有稳定的对象。


### 场景配置建议

- `ChunkManager`：
  - 较高建筑刷新频率：同一个 chunk 内部，远处建筑 mesh 每隔 N 秒随机替换或偏移（例如 `chunkRefreshInterval = 3–6s`）。
  - 近处 5–10 米范围内的 geometry 稍稳定，只做轻微 jitter，保证玩家不会迷路。
- `DitherShader`：
  - `noiseDensity`: 高（0.8–1.0）。
  - `temporalJitter`: 中高（0.6–0.8），让远处画面持续微抖。
  - `thresholdBias`: 依花光强度动态调整（见下面）。
- `CableSystem`：
  - 线缆数量中等，但抖动频率高，幅度小，只是“躁动”不形成方向。
- `AudioSystem`：
  - 选择高频轻量噪声为底（类似数据中心环境声），叠加随机 “ping” 式信号声，不做明显 Call/Response。


### 花光 → 参数映射

伪代码示意：

```js
// roomType === INFO_OVERFLOW
const I = flower.intensity; // 0–1

ditherShader.noiseDensity = lerp(0.6, 1.0, I);
ditherShader.thresholdBias = lerp(-0.1, 0.3, I); // 光越强，越偏向过曝
ditherShader.temporalJitter = lerp(0.4, 0.9, I);

chunkRefreshInterval = lerp(6.0, 2.0, I); // 光越强，建筑刷新越快
audioSystem.setInfoOverflowIntensity(I);
```


### 交互逻辑

- 微光（I≈0.2）：
  - 视野信息量下降，噪点少，远处建筑刷新变慢，玩家能看清脚边一小圈，感受“窄但清晰”。
- 中光（I≈0.5）：
  - 信息量密集，建筑刷新频率提高，但仍可辨认路径；这是“最常用”的探索状态。
- 强光（I→1.0）：
  - 远处建筑几乎处于持续重绘状态，抖动强烈，视野接近过曝；Audio 加入高频刺耳成分但不做方向反馈，强化“说了很多，却没人回答”的感觉。

***

## 2. 被迫站队（FORCED_ALIGNMENT）

### 目标感受

- 空间强制划分左右两侧，两套秩序同时存在，玩家在裂缝边被持续拉扯。


### 场景配置建议

- `ChunkManager / BuildingFactory`：
  - 在 X 轴（例如 x=0）生成一条“裂缝走廊”，宽度约 4–6 米，两侧各生成不同风格的 building set：
    - 左侧：更规整、高度接近、线条垂直，噪点稍低。
    - 右侧：高度差大，倾斜多，噪点更高。
- `CableSystem`：
  - 大部分线缆跨越裂缝，从左连到右，`CableSystem` 对玩家位置有轻微 “拉视角” 力：
    - 靠近左侧：视角 yaw 被微弱偏向左。
    - 靠近右侧：相反。
- `DitherShader`：
  - 左右两侧使用略不同的参数 preset（比如左更干净，右更噪）。


### 花光 \& 横向位置 → 参数映射

先定义一个侧向因子：

```js
const side = clamp(player.position.x / sideWidth, -1.0, 1.0);
// side ≈ -1 在左, 0 在中间, +1 在右
```

- 左右视觉 preset：

```js
// 左 preset
const leftPreset = { noiseDensity: 0.4, thresholdBias: -0.05 };
// 右 preset
const rightPreset = { noiseDensity: 0.7, thresholdBias: 0.1 };
```

- 实时插值：

```js
const t = (side + 1) / 2; // -1..1 → 0..1
ditherShader.noiseDensity = lerp(leftPreset.noiseDensity, rightPreset.noiseDensity, t);
ditherShader.thresholdBias = lerp(leftPreset.thresholdBias, rightPreset.thresholdBias, t);
```

- 花光强度 I 则控制“站队稳定度”：

```js
// 当玩家靠近某侧且 I 高时，世界更稳定；I 低时，两侧都抖
const alignment = Math.abs(side) * I; // 0–1
chunkJitterAmplitude = lerp(0.1, 0.0, alignment); // alignment 高则 jitter 低
```


### 交互逻辑

- 玩家长时间停在左侧 + 中高光：
  - 画面噪点减弱，线缆抖动变小，Audio 更稳定，给“站好队”的秩序感。
- 长时间停在右侧 + 中高光：
  - 噪点略高、线缆更“躁”，但同样会稳定下来，是另一种秩序。
- 试图在中线徘徊（side≈0）：
  - 将 `chunkMissingProbability` 提高一些，偶尔在中线附近生成缺失地砖，需要跳跃通过；视觉噪点较高，音频左右声道有拉扯感，形成“中间最不舒服、但也最诚实”的体验。

***

## 3. 长期 in‑between（IN_BETWEEN）

### 目标感受

- 同一个自己在不同系统里被完全不同对待：有时是信号，有时是噪声。


### 场景配置建议

- `ChunkManager`：
  - 在 Z 轴或角度方向划出两个交错区域 A/B（例如通过噪声函数决定某点所属系统）。
- `BuildingFactory`：
  - 系统 A：规则混凝土方块；系统 B：带更多不规则切割与悬挑。
- `CableSystem`：
  - A 的线缆走向主要水平，B 的线缆更多垂直或斜向，便于一眼辨识。


### 系统标记与空间查询

- 对每个 chunk 增加一个 `systemTag` 字段：`"A"` 或 `"B"`。
- 提供一个函数：

```js
function getSystemAtPosition(pos) {
  // 例如通过 2D noise / checkerboard 决定
  return noise2D(pos.x, pos.z) > 0 ? 'A' : 'B';
}
```


### 花光 → 系统响应

```js
const system = getSystemAtPosition(player.position);
const I = flower.intensity;

// 基础噪点
if (system === 'A') {
  ditherShader.noiseDensity = lerp(0.3, 0.6, I);
  // 在 A 系统中，光被视为“信号”
  world.highlightStructuresAround(player.position, I); // 点亮附近建筑边缘
} else {
  ditherShader.noiseDensity = lerp(0.6, 0.9, I);
  // 在 B 系统中，同样的光被视为“排异”
  world.addLocalGlitch(player.position, I); // 局部 mesh 抖动/瓦解
}
```


### 门/桥的系统条件

- 某些 `BuildingFactory` 生成的门对象，带属性 `requiredSystem = 'A' | 'B'`：
  - 当玩家站在触发区时，如果 `system === requiredSystem` 且 `I > threshold`，则门缓慢打开（mesh 偏移或 alpha 改变）。
  - 否则门表面噪点增强/抖动加剧，用视觉语言说“你不属于这里”。


### 交互逻辑

- 玩家在 A 系统区域强光前进：
  - 会“点亮”一系列路标似的结构，形成一条隐约可见的路径；Audio 中加入轻微和弦铺底。
- 同样操作在 B 系统：
  - 建筑边缘抖动，甚至出现小块坍塌，Audio 加入不稳定的失真，营造“被排斥”的感觉。
- 在系统边界区域（noise 接近 0 的区域）：
  - 不触发明显 A/B 效应，只增加局部噪点和轻微错位，让玩家感知“在两者之间被同时误读”。

***

## 4. 极化世界 / 纯 1-bit 边界（POLARIZED）

### 目标感受

- 完全拒绝灰度与过渡，世界只承认黑与白；任何模糊都被当场量化。


### 场景配置建议

- `DitherShader`：
  - 这一房间直接切换成类硬阈值模式：
    - `noiseDensity`: 低（0.1–0.2）。
    - `temporalJitter`: 极低（≈0.1）。
    - `thresholdBias`: 0 附近，让物体要么全黑要么全白。
- `BuildingFactory`：
  - 大量平直平面、极简几何体，几乎不使用噪声变化；FloorTile 做成大块棋盘格。
- `CableSystem`：
  - 线缆严格沿着边界线（例如黑白交界）生成，像在强调“这里才是世界的骨架”。


### 花光 \& 阈值量化

```js
const I = flower.intensity;

// 在极化房间，光主要影响 threshold 而不是 noise
ditherShader.noiseDensity = 0.15;
ditherShader.temporalJitter = 0.1;

// 基本阈值
let baseThreshold = 0.5;

// 光越强，世界越被强硬量化
ditherShader.thresholdBias = baseThreshold + (I - 0.5) * 0.4;
```

效果理解：

- 微光（I<0.3）：
  - threshold 接近 0.4，黑稍多于白，世界偏“压抑”。
- 中光（I≈0.5）：
  - 接近均衡黑白。
- 强光（I>0.7）：
  - threshold 接近 0.6，白更多，世界偏“暴露/过度显影”，阴影消失。


### 仰视 Sky Eye 的强制规则

在 Controls 中增加一个简单检测（pitch > 某阈值即认为是仰视）：

```js
if (isLookingAtSkyEye(camera)) {
  flower.forceLowerIntensity(); // 例如缓动到 0.1
  ditherShader.contrast = lerp(ditherShader.contrast, lowerContrastValue, 0.1);
}
```

- 效果：玩家一旦抬头看眼睛，花会自动暗下去，对比度也略降，世界“安全但失色”。


### 违例操作（可选后续版本）

- 如果你们愿意加入“强行违例”的隐藏机制，可以在 UI 里提供一个不提示的键（比如长按某键），在仰视状态下强行抬高花光：

```js
if (isLookingAtSkyEye(camera) && player.isHoldingOverrideKey) {
  flower.setIntensity(1.0);
  world.spawnPolarizationGlitch(camera.position, camera.direction);
}
```

- `spawnPolarizationGlitch` 可以做：
  - 短时间内把附近几何体的 UV 乱扭；
  - 把局部棋盘格变成“第三种”错位纹理；
  - Audio 注入一小段刺耳但很短的 Click。
- 这些残影 2–3 秒后消失，留下一点“曾经试图拒绝量化”的痕迹。

***

## 给开发的最小落地优先级建议

1) 先在 `ChunkManager` 里加 `roomType`，哪怕一开始只是基于坐标粗暴切四块，也足够测试。
2) 在 `DitherShader` 暴露：`noiseDensity`, `thresholdBias`, `temporalJitter` 三个 uniform；在 `CableSystem` 和 `AudioSystem` 各加一个简单的 `setMode(roomType, intensity)`。
3) 只实现“高信息流、无回应 + 极化世界”两个房间的参数逻辑，跑通一次 3–5 分钟的 walk，感受节奏，再迭代另外两个房间。

如果你愿意，可以把 `DitherShader.js` 和 `ChunkManager.js` 的部分代码结构贴出来，下一步可以直接帮你按现有 API 写更具体的伪代码/接口命名。

<div align="center">⁂</div>

[^1]: https://github.com/aaajiao

[^2]: https://github.com/aaajiao/1bit

